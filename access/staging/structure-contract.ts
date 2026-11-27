import type {RpcClient} from './session-contract.ts'
import type {TaskRow} from './task-edit-contract.ts'
export type StructureTask={id:string;expected_updated_at:string;label:string;parent_id?:string|null;position?:number}
export type StructurePayload={kind:'move'|'delete';tasks:StructureTask[];folder?:{id:string;title:string;parent_id:string|null;tags:string[]}}
export type StructureIntent={version:1;owner:string;requestId:string;attempted:boolean;payload:StructurePayload}
export type StructureContext={owner:string|null;epoch:number}
export type StructureResult={context:StructureContext;requestId:string;tasks:TaskRow[];deletedIds:string[];submitted:StructurePayload}
const id=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const bytes=(x:string)=>new TextEncoder().encode(x).length
const stamp=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x))
export function normalizeStructure(input:unknown,placeholder=true):StructurePayload{
 if(!object(input)||!['move','delete'].includes(String(input.kind))||Object.keys(input).some(k=>!['kind','tasks','folder'].includes(k))||
  !Array.isArray(input.tasks)||input.tasks.length>100||!input.tasks.length&&!input.folder)throw Error('Review 1 to 100 structural targets or a new folder.')
 let folder:StructurePayload['folder']
 if('folder'in input){const f=input.folder;
  if(input.kind!=='move'||!object(f)||Object.keys(f).length!==4||(!id(f.id)&&!(placeholder&&f.id==='$new'))||
   typeof f.title!=='string'||!f.title.trim()||bytes(f.title)>4096||f.parent_id!==null&&!id(f.parent_id)||!Array.isArray(f.tags)||f.tags.length>32||
   new Set(f.tags).size!==f.tags.length||!f.tags.every(t=>typeof t==='string'&&!!t.trim()&&bytes(t)<=80&&!['wf','orphaned','wf-orphan'].includes(t)))throw Error('Review the new folder.')
  folder={id:f.id as string,title:f.title,parent_id:f.parent_id as string|null,tags:[...f.tags]}
 }
 const tasks=input.tasks.map(t=>{
  if(!object(t)||Object.keys(t).length!==(input.kind==='move'?5:3)||!id(t.id)||!stamp(t.expected_updated_at)||typeof t.label!=='string'||bytes(t.label)>4096)
   throw Error('Review the task identity, version and title.')
  if(input.kind==='delete'&&('parent_id'in t||'position'in t)||input.kind==='move'&&
   (t.parent_id!==null&&!id(t.parent_id)&&!(placeholder&&folder&&t.parent_id==='$new')||!Number.isInteger(t.position)||(t.position as number)<0||(t.position as number)>2147483647))throw Error('Review the move destination and position.')
  return {id:t.id,expected_updated_at:t.expected_updated_at as string,label:t.label,...(input.kind==='move'?{parent_id:t.parent_id as string|null,position:t.position as number}:{})}
 }).sort((a,b)=>a.id.localeCompare(b.id))
 if(new Set(tasks.map(t=>t.id)).size!==tasks.length||folder&&tasks.some(t=>t.id===folder!.id))throw Error('Duplicate structural identities.')
 return {kind:input.kind as 'move'|'delete',tasks,...(folder?{folder}:{})}
}
export function structureDraft(p:StructurePayload):StructurePayload{
 const original=normalizeStructure(p,false);if(!original.folder)return original
 return {...original,tasks:original.tasks.map(t=>({...t,parent_id:t.parent_id===original.folder!.id?'$new':t.parent_id})),folder:{...original.folder,id:'$new'}}
}
function rowValid(r:unknown,owner:string):r is TaskRow{
 return object(r)&&id(r.id)&&(r.parent_id===null||id(r.parent_id))&&typeof r.title==='string'&&typeof r.done==='boolean'&&
  ['task','group'].includes(String(r.kind))&&Number.isInteger(r.position)&&typeof r.expanded==='boolean'&&Array.isArray(r.tags)&&r.tags.every(t=>typeof t==='string')&&
  Number.isInteger(r.streak)&&(r.streak_day===null||typeof r.streak_day==='string')&&stamp(r.created_at)&&stamp(r.updated_at)&&(r.user_id===undefined||r.user_id===owner)
}
export function createStructures({client,storage,uuid}:{client:RpcClient;storage:Storage;uuid:()=>string}){
 let owner:string|null=null,epoch=0,running:{key:string;promise:Promise<StructureResult>}|null=null,confirmed:StructureResult|null=null
 const listeners=new Set<()=>void>(),receipts=new WeakMap<StructureResult,{raw:string;result:string}>()
 const notify=()=>{for(const fn of listeners)fn()},context=():StructureContext=>({owner,epoch})
 function assertContext(c:StructureContext){if(!owner||owner!==c.owner||epoch!==c.epoch)throw Error('Account changed. Original structural request stays saved.')}
 const prefix=(actor:string)=>'rm-structure-v1:'+actor+':',key=(actor:string,request:string)=>prefix(actor)+request
 function parse(raw:string):StructureIntent{
  if(bytes(raw)>49152)throw Error('Saved structural request exceeds the review limit.')
  const p=JSON.parse(raw)
  if(!object(p)||Object.keys(p).length!==5||p.version!==1||!id(p.owner)||!id(p.requestId)||typeof p.attempted!=='boolean')throw Error('Saved structural request needs review.')
  const payload=normalizeStructure(p.payload,false)
  if(JSON.stringify(payload)!==JSON.stringify(p.payload))throw Error('Saved structural request changed.')
  return {...p,payload} as StructureIntent
 }
 const list=()=>{if(!owner)return [];const out:StructureIntent[]=[];
  for(let i=0;i<storage.length;i++){const name=storage.key(i);if(!name?.startsWith(prefix(owner)))continue;const raw=storage.getItem(name);if(raw===null)continue;
   const p=parse(raw);assertContext({owner:p.owner,epoch});if(name!==key(p.owner,p.requestId))throw Error('Saved structural identity needs review.');out.push(p)}
  return out.sort((a,b)=>a.requestId.localeCompare(b.requestId))
 }
 function prepare(input:StructurePayload){
  if(!owner)throw Error('Sign in before changing the task tree.')
  const draft=normalizeStructure(input),pending=list(),previous=pending.find(p=>JSON.stringify(structureDraft(p.payload))===JSON.stringify(draft))??pending[0]
  if(previous){if(JSON.stringify(structureDraft(previous.payload))!==JSON.stringify(draft))throw Error('A structural request is waiting. Resolve it before another change.');return previous}
  const folder=draft.folder?{...draft.folder,id:uuid()}:undefined
  const payload=normalizeStructure({...draft,tasks:draft.tasks.map(t=>({...t,...(t.parent_id==='$new'?{parent_id:folder!.id}:{})})),...(folder?{folder}:{})},false)
  const p:StructureIntent={version:1,owner,requestId:uuid(),attempted:false,payload},raw=JSON.stringify(p);parse(raw);storage.setItem(key(owner,p.requestId),raw);notify();return p
 }
 function run(intent:StructureIntent):Promise<StructureResult>{
  let p:StructureIntent,raw:string
  try{assertContext({owner:intent.owner,epoch});raw=storage.getItem(key(intent.owner,intent.requestId))??'';p=parse(raw);if(JSON.stringify({...p,attempted:intent.attempted})!==JSON.stringify(intent))throw Error('Saved structural request changed.')}
  catch(e){return Promise.reject(e)}
  const actor=context(),flight=actor.epoch+':'+p.owner+':'+p.requestId
  if(running)return running.key===flight?running.promise:Promise.reject(Error('Wait for the current structural change.'))
  try{if(!p.attempted){p={...p,attempted:true};raw=JSON.stringify(p);storage.setItem(key(p.owner,p.requestId),raw);notify()}}catch(e){return Promise.reject(e)}
  const work=(async()=>{
   const {data,error}=await client.rpc('ga_roadmap_structure',{p_payload:p.payload,p_request_id:p.requestId});assertContext(actor)
   if(error){if(error.code==='40001')throw Error('The task tree changed. Review current records; the original request stays saved.');if(error.code==='42501')throw Error('Access denied or saving paused. Original request stays saved.');throw Error('Structural change was not confirmed. Original request stays saved.')}
   if(!object(data)||data.request_id!==p.requestId||typeof data.replayed!=='boolean'||data.kind!==p.payload.kind||!Array.isArray(data.tasks)||!Array.isArray(data.deleted_ids))throw Error('Structural change was not confirmed.')
   const expected=p.payload.tasks.map(t=>t.id),rows:TaskRow[]=data.tasks,deletedIds:string[]=data.deleted_ids
   if(p.payload.kind==='delete'){
    if(rows.length||deletedIds.length!==expected.length||new Set(deletedIds).size!==expected.length||deletedIds.some(t=>!expected.includes(t)))throw Error('Deletion was not confirmed.')
   }else{
    if(p.payload.folder)expected.push(p.payload.folder.id)
    if(deletedIds.length||rows.length!==expected.length||new Set(rows.map(t=>t.id)).size!==expected.length||rows.some(t=>!rowValid(t,p.owner)||!expected.includes(t.id)))throw Error('Structural rows were not confirmed.')
    if(!data.replayed)for(const row of rows){const target=p.payload.tasks.find(t=>t.id===row.id),folder=p.payload.folder;
     if(target&&(row.parent_id!==target.parent_id||row.position!==target.position||row.title!==target.label)||!target&&folder&&
      (row.kind!=='group'||row.title!==folder.title||row.parent_id!==folder.parent_id||JSON.stringify(row.tags)!==JSON.stringify(folder.tags)))throw Error('Structural details were not confirmed.')
    }
   }
   if(storage.getItem(key(p.owner,p.requestId))!==raw)throw Error('Newer saved structural work exists. Review before continuing.')
   const result:StructureResult={context:actor,requestId:p.requestId,tasks:rows,deletedIds,submitted:structureDraft(p.payload)};receipts.set(result,{raw,result:JSON.stringify(result)});return result
  })()
  running={key:flight,promise:work};notify();void work.finally(()=>{if(running?.promise===work)running=null;notify()}).catch(()=>{});return work
 }
 function acknowledge(result:StructureResult){assertContext(result.context);const receipt=receipts.get(result);
  if(!receipt||JSON.stringify(result)!==receipt.result||storage.getItem(key(owner!,result.requestId))!==receipt.raw)throw Error('Saved structural request changed.')
  storage.removeItem(key(owner!,result.requestId));receipts.delete(result);confirmed=result;notify()
 }
 function discard(p:StructureIntent){assertContext({owner:p.owner,epoch});if(running)throw Error('Wait for the current structural request.');
  if(storage.getItem(key(p.owner,p.requestId))!==JSON.stringify(p))throw Error('Saved structural request changed.');storage.removeItem(key(p.owner,p.requestId));notify()
 }
 return {prepare,run,acknowledge,discard,list,context,assertContext,notify,confirmation:()=>confirmed,busy:()=>!!running,
  bind(next:string|null){if(owner!==next){owner=next;epoch++;confirmed=null;notify()}},subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
 }
}
