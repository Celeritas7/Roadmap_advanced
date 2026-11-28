import type {AccountScope} from './hub-account.ts'
import type {RpcClient} from './session-contract.ts'
type Json=Record<string,unknown>
export type SharedTarget={kind:'document';doc:string;path:string;key:string}|{kind:'place';id:string}
export type SharedSnapshot={protocol:'roadmap.shared.v1';owner:string;target:SharedTarget;revision:string|null;record:Json|null}
export type SharedIntent={owner:string;target:SharedTarget;requestId:string;expectedRevision:string|null;change:Json}
export type SharedResult={protocol:'roadmap.shared.v1';owner:string;target:SharedTarget;request_id:string;expected_revision:string|null;change:Json;status:'saved'|'conflict';replayed:boolean;applied_revision?:string;current:SharedSnapshot}
type Slot={version:1;owner:string;target:SharedTarget;active:SharedIntent|null;history:{intent:SharedIntent;resolution:string}[]}
type Locks={request<T>(name:string,options:{signal:AbortSignal},work:()=>Promise<T>):Promise<T>}
const object=(x:unknown):x is Json=>!!x&&typeof x==='object'&&!Array.isArray(x)
const hash=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x)
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)
const bytes=(x:string)=>new TextEncoder().encode(x).length
export function sharedCanonical(x:unknown):string{
 function normalize(v:unknown,depth=0):unknown{
  if(depth>20)throw Error('Shared value is too deeply nested.')
  if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v
  if(Array.isArray(v))return v.map(a=>normalize(a,depth+1))
  if(object(v)&&Object.getPrototypeOf(v)===Object.prototype)return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k],depth+1)]))
  throw Error('Shared values must be plain JSON.')
 }
 return JSON.stringify(normalize(x))
}
const same=(a:unknown,b:unknown)=>sharedCanonical(a)===sharedCanonical(b)
const clone=<T>(x:T):T=>JSON.parse(sharedCanonical(x))
function target(value:unknown):asserts value is SharedTarget{
 if(!object(value)||bytes(sharedCanonical(value))>4096)throw Error('Invalid shared target.')
 if(value.kind==='document'&&Object.keys(value).length===4&&typeof value.key==='string'&&bytes(value.key)<=1024&&
  (value.doc==='task_tags'&&value.path==='rm'||value.doc==='roadmap_now'&&value.path==='suggestion'&&value.key===''))return
 if(value.kind==='place'&&Object.keys(value).length===2&&typeof value.id==='string'&&value.id.trim().length>0&&value.id.length<=160&&!/[\x00-\x1f\x7f]/.test(value.id))return
 throw Error('This shared target has not been reviewed.')
}
function change(value:unknown,t:SharedTarget):asserts value is Json{
 if(!object(value)||bytes(sharedCanonical(value))>32768)throw Error('Invalid or oversized shared draft.')
 const keys=Object.keys(value)
 if(t.kind==='document'){
  if(value.op==='put'&&keys.length===2&&Object.hasOwn(value,'value')||value.op==='remove'&&keys.length===1)return
 }else{
  if((value.op==='retire'||value.op==='restore')&&keys.length===1)return
  const p=value.op==='create'&&keys.length===5?Object.fromEntries(Object.entries(value).filter(([k])=>k!=='op')):value.op==='edit'&&keys.length===2?value.patch:null
  if(object(p)&&Object.keys(p).length&&Object.keys(p).every(k=>['label','class','ord','aliases'].includes(k))&&
   (value.op!=='create'||['label','class','ord','aliases'].every(k=>Object.hasOwn(p,k)))&&
   (!Object.hasOwn(p,'label')||typeof p.label==='string'&&p.label.trim().length>0&&p.label.length<=160)&&
   (!Object.hasOwn(p,'class')||typeof p.class==='string'&&['home','office','transit','cafe','out'].includes(p.class))&&
   (!Object.hasOwn(p,'ord')||Number.isInteger(p.ord)&&Math.abs(Number(p.ord))<=9999999)&&
   (!Object.hasOwn(p,'aliases')||Array.isArray(p.aliases)&&p.aliases.length<=32&&p.aliases.every(a=>typeof a==='string'&&a.trim().length>0&&a.length<=160)))return
 }
 throw Error('Invalid shared draft fields.')
}
function snapshot(value:unknown,owner:string,t:SharedTarget):asserts value is SharedSnapshot{
 if(!object(value)||value.protocol!=='roadmap.shared.v1'||value.owner!==owner||!same(value.target,t))throw Error('Shared value was not confirmed.')
 if(value.record===null&&value.revision===null)return
 const r=value.record
 if(!hash(value.revision)||!object(r)||r.user_id!==owner||!Number.isSafeInteger(r.seq)||Number(r.seq)<0)throw Error('Shared version was not confirmed.')
 if(t.kind==='document'){
  if(r.doc!==t.doc||r.path!==t.path||r.item_key!==t.key||r.owner_app!=='rm'||!Object.hasOwn(r,'value')||!(r.deleted_at===null||typeof r.deleted_at==='string'))throw Error('Shared document was not confirmed.')
 }else if(r.id!==t.id||typeof r.label!=='string'||typeof r.class!=='string'||!Array.isArray(r.aliases)||!r.aliases.every(a=>typeof a==='string')||!Number.isInteger(r.ord)||!(r.retired_at===null||typeof r.retired_at==='string'))throw Error('Shared place was not confirmed.')
}

// One atomic localStorage value per full target identity, serialized across tabs.
// History retains the original draft when the user rebases or keeps current data.
// Only an exact checked result can close recovery; account scopes never revive.
export function createSharedWriters({scope,client,storage,locks,newId=()=>crypto.randomUUID(),notify=()=>{}}:{scope:AccountScope;client:RpcClient;storage:Storage;locks:Locks|undefined;newId?:()=>string;notify?:()=>void}){
 const prefix='rm-shared-write-v1:'+scope.owner+':',reads=new WeakMap<SharedSnapshot,string>()
 const results=new WeakMap<SharedResult,{raw:string;intent:SharedIntent;encoded:string}>(),flights=new Map<string,Promise<SharedResult>>()
 const key=(t:SharedTarget)=>prefix+sharedCanonical(t)
 function intent(p:unknown):asserts p is SharedIntent{
  if(!object(p)||p.owner!==scope.owner||!uuid(p.requestId)||!(p.expectedRevision===null||hash(p.expectedRevision)))throw Error('Saved shared draft needs review.')
  target(p.target);change(p.change,p.target)
 }
 function parse(raw:string,t:SharedTarget):Slot{
  if(bytes(raw)>512000)throw Error('Saved shared history is too large. Original data was kept.')
  const s=JSON.parse(raw) as Slot
  if(!s||s.version!==1||s.owner!==scope.owner||!same(s.target,t)||!Array.isArray(s.history)||s.history.length>200)throw Error('Saved shared history needs review.')
  for(const p of [s.active,...s.history.map(h=>h.intent)])if(p!==null){intent(p);if(!same(p.target,t))throw Error('Saved shared target changed.')}
  return s
 }
 function exact(p:SharedIntent,raw?:string){scope.assert();intent(p);const found=storage.getItem(key(p.target));if(!found||raw!==undefined&&found!==raw||!same(parse(found,p.target).active,p))throw Error('Saved shared draft changed. Original work was kept.');return found}
 function save(t:SharedTarget,s:Slot){scope.assert();const raw=sharedCanonical(s);parse(raw,t);let size=bytes(raw),count=0
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(prefix)&&k!==key(t)){size+=bytes(storage.getItem(k)??'');count++}}
  if(size>2000000||count>=100)throw Error('Shared history storage is full. Existing work was kept.')
  storage.setItem(key(t),raw);notify()
 }
 function lock<T>(work:()=>Promise<T>){scope.assert();if(!locks)throw Error('Shared saves paused: Web Locks support is required.');return locks.request(prefix,{signal:scope.signal},async()=>{scope.assert();return work()})}
 function remember(s:SharedSnapshot){reads.set(s,sharedCanonical(s));return s}
 function reviewed(s:SharedSnapshot,t:SharedTarget){scope.assert();if(reads.get(s)!==sharedCanonical(s))throw Error('Read and review the current shared value first.');snapshot(s,scope.owner,t)}
 function proof(r:SharedResult){scope.assert();const p=results.get(r);if(!p||p.encoded!==sharedCanonical(r))throw Error('Original shared confirmation required.');exact(p.intent,p.raw);return p}
 function next(t:SharedTarget,revision:string|null,c:Json):SharedIntent{const p={owner:scope.owner,target:clone(t),requestId:newId(),expectedRevision:revision,change:clone(c)};intent(p);return p}
 function archive(s:Slot,p:SharedIntent,resolution:string){return {...s,history:[...s.history,{intent:clone(p),resolution}],active:null}}
 return {
  list(){scope.assert();const all:SharedIntent[]=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(prefix))continue;const t=JSON.parse(k.slice(prefix.length));target(t);const row=parse(storage.getItem(k)!,t);if(row.active)all.push(clone(row.active))}return all},
  history(){scope.assert();const all:Slot['history']=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(prefix))continue;const t=JSON.parse(k.slice(prefix.length));target(t);all.push(...parse(storage.getItem(k)!,t).history)}return clone(all)},
  async read(t:SharedTarget){scope.assert();target(t);const original=clone(t),{data,error}=await client.rpc('ga_roadmap_shared_read',{p_target:original});scope.assert();if(error)throw Error('Current shared value is unavailable. Your draft was kept.');snapshot(data,scope.owner,original);return remember(clone(data))},
  prepare(s:SharedSnapshot,c:Json){return lock(async()=>{
   reviewed(s,s.target);change(c,s.target);const raw=storage.getItem(key(s.target)),slot:Slot=raw?parse(raw,s.target):{version:1,owner:scope.owner,target:clone(s.target),active:null,history:[]}
   if(slot.active){if(slot.active.expectedRevision===s.revision&&same(slot.active.change,c))return clone(slot.active);throw Error('Resolve the saved shared draft before preparing another.')}
   const p=next(s.target,s.revision,c);save(s.target,{...slot,active:p});return clone(p)
  })},
  run(p:SharedIntent):Promise<SharedResult>{
   exact(p);const running=flights.get(p.requestId);if(running)return running
   const work=lock(async()=>{
    const raw=exact(p),original=clone(p),{data,error}=await client.rpc('ga_roadmap_shared_write',{p_target:original.target,p_expected_revision:original.expectedRevision,p_change:original.change,p_request_id:original.requestId});exact(original,raw)
    if(error)throw Object.assign(Error('Shared save was not confirmed. Retry the original saved draft.'),{code:error.code})
    if(!object(data)||data.protocol!=='roadmap.shared.v1'||data.owner!==scope.owner||data.request_id!==original.requestId||!same(data.target,original.target)||data.expected_revision!==original.expectedRevision||!same(data.change,original.change)||typeof data.replayed!=='boolean'||!['saved','conflict'].includes(String(data.status)))throw Error('Shared save was not confirmed.')
    snapshot(data.current,scope.owner,original.target)
    if(data.status==='saved'?(!hash(data.applied_revision)||!data.replayed&&data.applied_revision!==data.current.revision):(data.replayed||data.current.revision===original.expectedRevision))throw Error('Shared result was not confirmed.')
    const r=clone(data) as SharedResult;results.set(r,{raw,intent:original,encoded:sharedCanonical(r)});remember(r.current);return r
   });flights.set(p.requestId,work);void work.finally(()=>{if(flights.get(p.requestId)===work)flights.delete(p.requestId)}).catch(()=>{});return work
  },
  acknowledge(r:SharedResult){return lock(async()=>{const p=proof(r);if(r.status!=='saved')throw Error('Review the shared conflict before resolving it.');save(p.intent.target,archive(parse(p.raw,p.intent.target),p.intent,'saved'))})},
  resolve(r:SharedResult,s:SharedSnapshot,reapply:boolean){return lock(async()=>{
   const p=proof(r);if(r.status!=='conflict')throw Error('Only a confirmed conflict can be resolved.');reviewed(s,p.intent.target)
   if(s.revision===p.intent.expectedRevision)throw Error('The original version is current. Retry the original request first.')
   const slot=archive(parse(p.raw,p.intent.target),p.intent,reapply?'rebased':'kept-current'),replacement=reapply?next(p.intent.target,s.revision,p.intent.change):null
   save(p.intent.target,{...slot,active:replacement});return replacement&&clone(replacement)
  })}
 }
}
