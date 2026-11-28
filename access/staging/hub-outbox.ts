import {type AccountScope,isOwner} from './hub-account.ts'
export type Effect={from_app:string;to_app:string;kind:string;src_addr:Record<string,unknown>;src_clock:string|null;payload:Record<string,unknown>;idempotency_key:string}
export type OutboxRow={order?:number;identity:string;owner:string;app:string;effect:Effect;state:'pending'|'blocked'|'sent';reason:string|null;receipt:{seq:number;status:string}|null}
export const OUTBOX_LIMITS={records:1000,bytes:8*1024*1024,effectBytes:48*1024}
const bytes=(s:string)=>new TextEncoder().encode(s).length
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function canonical(value:unknown,depth=0):string{
 if(depth>16)throw Error('Hub data is nested too deeply.')
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value)
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value)
 if(Array.isArray(value))return '['+Array.from(value,v=>canonical(v,depth+1)).join(',')+']'
 if(object(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],depth+1)).join(',')+'}'
 throw Error('Hub data must be plain JSON.')
}
const identity=(owner:string,app:string,key:string)=>JSON.stringify([owner,app,key])
const hubStatuses=['pending','delivered','rejected','skipped']
export function validateEffect(effect:Effect,app:string){
 const text=canonical(effect)
 if(!/^[a-z][a-z0-9_-]{0,63}$/.test(app)||!object(effect)||effect.from_app!==app||typeof effect.to_app!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(effect.to_app)||
  typeof effect.kind!=='string'||!/^[a-z][a-z0-9_.-]{0,127}$/.test(effect.kind)||!object(effect.src_addr)||!object(effect.payload)||
  effect.src_clock!==null&&typeof effect.src_clock!=='string'||typeof effect.idempotency_key!=='string'||!effect.idempotency_key.trim()||bytes(effect.idempotency_key)>256||
  Object.keys(effect).sort().join(',')!=='from_app,idempotency_key,kind,payload,src_addr,src_clock,to_app'||bytes(text)>OUTBOX_LIMITS.effectBytes)throw Error('Invalid or oversized hub request. Use an explicit stable request key.')
 return JSON.parse(text) as Effect
}
function validateRow(row:OutboxRow,scope:AccountScope,app:string){
 scope.assert()
 if(!object(row)||!isOwner(row.owner)||row.owner!==scope.owner||row.app!==app||row.identity!==identity(row.owner,app,row.effect?.idempotency_key)||
  !['pending','blocked','sent'].includes(row.state)||row.reason!==null&&(typeof row.reason!=='string'||bytes(row.reason)>1024)||
  row.order!==undefined&&(!Number.isSafeInteger(row.order)||row.order<1)||row.state==='blocked'&&!row.reason||
  row.state==='sent'&&(!row.receipt||!Number.isSafeInteger(row.receipt.seq)||row.receipt.seq<1||!hubStatuses.includes(row.receipt.status)||row.reason!==null)||
  row.state!=='sent'&&row.receipt!==null)throw Error('Saved hub queue needs review. Nothing was removed.')
 validateEffect(row.effect,app);return row
}

// Atomic per-request records, not a shared localStorage array. Original order is
// assigned by IndexedDB, including when two tabs enqueue in the same millisecond.
export function openHubOutbox(factory:IDBFactory=indexedDB){
 const ready=new Promise<IDBDatabase>((resolve,reject)=>{
  const r=factory.open('rm-hub-outbox-v1',1)
  r.onupgradeneeded=()=>{const s=r.result.createObjectStore('requests',{keyPath:'order',autoIncrement:true});s.createIndex('identity','identity',{unique:true});s.createIndex('account',['owner','app'])}
  r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result)};r.onerror=()=>reject(Error('Hub queue storage is unavailable. Nothing was sent.'));r.onblocked=()=>reject(Error('Close the other staging tab before opening the hub queue.'))
 })
 async function transaction<T>(scope:AccountScope,mode:IDBTransactionMode,work:(s:IDBObjectStore,done:(v:T)=>void)=>void):Promise<T>{
  scope.assert();const db=await ready;scope.assert()
  return new Promise((resolve,reject)=>{let result:T,failure:unknown;const tx=db.transaction('requests',mode)
   tx.oncomplete=()=>{try{scope.assert();resolve(result)}catch(e){reject(e)}};tx.onerror=()=>{};tx.onabort=()=>reject(failure??Error('Hub queue could not be saved. Nothing new was sent.'))
   const store=tx.objectStore('requests'),guard=(fn:()=>void)=>{try{scope.assert();fn()}catch(e){failure=e;tx.abort()}}
   // Every IDB result callback uses this guard, so disposal cannot mutate rows.
   guard(()=>work(store,v=>{scope.assert();result=v}))
   tx.addEventListener('error',()=>{failure??=tx.error})
   // Work callbacks catch validation errors through this small request wrapper.
   guards.set(tx,guard)
  })
 }
 const guards=new WeakMap<IDBTransaction,(fn:()=>void)=>void>()
 const read=<T>(store:IDBObjectStore,request:IDBRequest<T>,fn:(value:T)=>void)=>{request.onsuccess=()=>guards.get(store.transaction)!(()=>fn(request.result))}
 const list=(scope:AccountScope,app:string)=>transaction<OutboxRow[]>(scope,'readonly',(s,done)=>read(s,s.index('account').getAll([scope.owner,app]),rows=>{
  if(rows.length>OUTBOX_LIMITS.records||bytes(canonical(rows))>OUTBOX_LIMITS.bytes)throw Error('Saved hub queue exceeds review limits. Nothing was removed.')
  done(rows.map(r=>validateRow(r,scope,app)).sort((a,b)=>a.order!-b.order!))
 }))
 return {list,
  async add(scope:AccountScope,app:string,input:Effect){const effect=validateEffect(input,app),id=identity(scope.owner,app,effect.idempotency_key)
   return transaction<OutboxRow>(scope,'readwrite',(s,done)=>read(s,s.index('account').getAll([scope.owner,app]),rows=>{
    rows.forEach(r=>validateRow(r,scope,app));const old=rows.find(r=>r.identity===id)
    if(old){if(canonical(old.effect)!==canonical(effect))throw Error('This request key already belongs to different saved data. Original work kept.');done(old);return}
    const row:OutboxRow={identity:id,owner:scope.owner,app,effect,state:'pending',reason:null,receipt:null}
    if(rows.length>=OUTBOX_LIMITS.records||bytes(canonical([...rows,row]))>OUTBOX_LIMITS.bytes)throw Error('Hub queue is full. Existing work was kept; nothing new was sent.')
    read(s,s.add(row),order=>{const saved={...row,order:Number(order)}
     if(bytes(canonical([...rows,saved]))>OUTBOX_LIMITS.bytes)throw Error('Hub queue is full. Existing work was kept; nothing new was sent.')
     done(saved)
    })
   }))
  },
  update(scope:AccountScope,original:OutboxRow,patch:Pick<OutboxRow,'state'|'reason'|'receipt'>){
   return transaction<OutboxRow>(scope,'readwrite',(s,done)=>read(s,s.index('identity').get(original.identity),saved=>{
    validateRow(saved,scope,original.app)
    if(canonical(saved)!==canonical(original))throw Error('Saved request changed in another tab. Original work kept.')
    const next=validateRow({...saved,...patch},scope,original.app);read(s,s.put(next),()=>done(next))
   }))
  },close:async()=>{(await ready).close()},
 }
}
export type OutboxStore=Pick<ReturnType<typeof openHubOutbox>,'list'|'add'|'update'>
type Client={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:any;error:any}>;from:(table:string)=>any}
export function createHubOutbox(scope:AccountScope,app:string,store:OutboxStore,client:Client,locks:LockManager|undefined,notify:()=>void=()=>{}){
 let flight:Promise<number>|null=null
 const list=async()=>{const rows=await store.list(scope,app);scope.assert();return rows}
 const confirmed=(row:OutboxRow,value:any)=>{
  if(!value)return null
  const effect=Object.fromEntries(Object.keys(row.effect).map(k=>[k,value[k]]))
  let exact=false;try{exact=canonical(effect)===canonical(row.effect)}catch{/* malformed evidence is never confirmation */}
  if(value.user_id!==scope.owner||!Number.isSafeInteger(value.seq)||value.seq<1||!hubStatuses.includes(value.status)||!exact)throw Object.assign(Error('Stored hub request differs. Review required.'),{code:'EFFECT_MISMATCH'})
  return {seq:value.seq,status:value.status}
 }
 async function flushWork(lease:AccountScope){
  if(!locks)throw Error('Hub sending paused: Web Locks support is required.')
  return locks.request('rm-hub-outbox-v1:'+scope.owner+':'+app,{signal:lease.signal},async()=>{
   let count=0
   for(const row of await list()){
    scope.assert();lease.assert();if(!navigator.onLine)break
    if(row.state==='sent')continue
    if(row.state==='blocked')break // preserve ordering; review before later effects
    try{
     const read=async()=>{const r=await client.from('akatsuki_requests').select('seq,user_id,from_app,to_app,kind,src_addr,src_clock,payload,idempotency_key,status').eq('user_id',scope.owner).eq('idempotency_key',row.effect.idempotency_key).maybeSingle();scope.assert();lease.assert();if(r.error)throw r.error;return confirmed(row,r.data)}
     let receipt=await read()
     if(!receipt){const r=await client.rpc('akatsuki_publish',{p:structuredClone(row.effect)});scope.assert();lease.assert();if(r.error)throw r.error
      // An empty/queued/incorrect RPC result never removes work. Read the actual
      // original owner row, also recovering a committed-but-lost earlier reply.
      receipt=await read()
     }
     if(!receipt)throw Error('Publication is not confirmed. Original retry remains saved.')
     await store.update(scope,row,{state:'sent',reason:null,receipt});scope.assert();lease.assert();count++;notify()
    }catch(e){scope.assert();lease.assert();const code=String((e as {code?:unknown})?.code??'')
     const permanent=/^AK1\d\d$/.test(code)||code==='AK201'||code==='EFFECT_MISMATCH'
     await store.update(scope,row,{state:permanent?'blocked':'pending',reason:permanent?'Hub contract requires review ('+code+').':'Send is unconfirmed. Reconnect or sign in to the original account before retrying.',receipt:null});notify();break
    }
   }return count
  })
 }
 return {app,list,
  async publish(input:{to:string;kind:string;addr:Record<string,unknown>;payload:Record<string,unknown>;clock?:string|null;key:string}){
   scope.assert();const row=await store.add(scope,app,{from_app:app,to_app:input.to,kind:input.kind,src_addr:input.addr,src_clock:input.clock??null,payload:input.payload,idempotency_key:input.key});scope.assert();notify()
   // Durable queueing is explicit; only the leader or an explicit Retry sends.
   if(row.state==='blocked')throw Error(row.reason??'Hub contract requires review.')
   return row.state==='sent'?{seq:row.receipt!.seq,status:row.receipt!.status==='pending'?'pending':row.receipt!.status==='skipped'?'skipped':'closed',transportConfirmed:true}:{status:'queued',code:'AK301',retry:true}
  },flush(lease=scope){scope.assert();lease.assert();if(flight)return flight
   const work=flushWork(lease);flight=work;void work.finally(()=>{if(flight===work)flight=null}).catch(()=>{});return work
  },
 }
}
