import type {RpcClient} from './session-contract.ts'
import type {TaskRow} from './task-edit-contract.ts'
export type CreationItem={title:string;tags:string[];folder?:string}
export type CreationDraft={kind:'task';parent_id:string|null;items:CreationItem[]}|{kind:'capture';text:string;items:CreationItem[]}
export type CreationPayload=({kind:'task';parent_id:string|null}|{kind:'capture';text:string}) & {items:(CreationItem & {id:string})[]}
export type CreationIntent={version:1;owner:string;requestId:string;payload:CreationPayload}
export type CreationContext={owner:string|null;epoch:number}
export type CreationResult={context:CreationContext;requestId:string;tasks:TaskRow[];itemIds:string[];submitted:CreationDraft}
const id=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const bytes=(x:string)=>new TextEncoder().encode(x).length
const folders=['Shopping','Places','App dev','Languages','Office','Home','Other']
const stamp=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x))
export function normalizeCreation(input:unknown):CreationDraft{
 if(!object(input)||!['task','capture'].includes(String(input.kind))||!Array.isArray(input.items)||input.items.length<1||input.items.length>32)
  throw Error('Enter 1 to 32 tasks per capture.')
 if(input.kind==='task'&&(Object.keys(input).length!==3||!Object.hasOwn(input,'parent_id')||input.parent_id!==null&&!id(input.parent_id)||input.items.length!==1)||
  input.kind==='capture'&&(Object.keys(input).length!==3||typeof input.text!=='string'||!input.text.trim()||bytes(input.text)>32768))throw Error('Review the task parent or capture text.')
 const items=input.items.map(t=>{
  if(!object(t)||Object.keys(t).some(k=>!['title','tags','folder'].includes(k))||typeof t.title!=='string'||!t.title.trim()||bytes(t.title)>4096||
   !Array.isArray(t.tags)||t.tags.length>32||new Set(t.tags).size!==t.tags.length||
   !t.tags.every(v=>typeof v==='string'&&!!v.trim()&&bytes(v)<=80&&!['wf','orphaned','wf-orphan'].includes(v))||
   input.kind==='task'&&Object.hasOwn(t,'folder')||input.kind==='capture'&&(!folders.includes(String(t.folder))||!t.tags.includes('parked')))
   throw Error('Review task titles, tags and capture folders.')
  return {title:t.title,tags:[...t.tags],...(input.kind==='capture'?{folder:t.folder as string}:{})}
 })
 return input.kind==='task'?{kind:'task',parent_id:input.parent_id as string|null,items}:{kind:'capture',text:input.text as string,items}
}
export const creationDraft=(p:CreationPayload):CreationDraft=>normalizeCreation({...p,items:p.items.map(({id:_,...item})=>item)})
function parse(raw:string):CreationIntent{
 if(bytes(raw)>49152)throw Error('Saved task creation is too large. Review the draft.')
 const p=JSON.parse(raw)
 if(!object(p)||Object.keys(p).length!==4||p.version!==1||!id(p.owner)||!id(p.requestId)||!object(p.payload)||!Array.isArray(p.payload.items)||
  !p.payload.items.every(t=>object(t)&&id(t.id))||new Set(p.payload.items.map(t=>t.id)).size!==p.payload.items.length)throw Error('Saved task creation needs review.')
 const saved=p.payload as CreationPayload,draft=creationDraft(saved)
 const payload={...draft,items:draft.items.map((t,i)=>({...t,id:saved.items[i].id}))}
 if(JSON.stringify(payload)!==JSON.stringify(p.payload))throw Error('Saved task creation needs review.')
 return {...p,payload} as CreationIntent
}
function rowValid(r:unknown,owner:string):r is TaskRow{
 return object(r)&&id(r.id)&&(r.parent_id===null||id(r.parent_id))&&typeof r.title==='string'&&typeof r.done==='boolean'&&
  ['task','group'].includes(String(r.kind))&&Number.isInteger(r.position)&&typeof r.expanded==='boolean'&&Array.isArray(r.tags)&&r.tags.every(t=>typeof t==='string')&&
  Number.isInteger(r.streak)&&(r.streak_day===null||typeof r.streak_day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.streak_day))&&stamp(r.created_at)&&stamp(r.updated_at)&&
  (r.user_id===undefined||r.user_id===owner)
}
export function createTaskCreations({client,storage,uuid}:{client:RpcClient;storage:Storage;uuid:()=>string}){
 let owner:string|null=null,epoch=0,running:{key:string;promise:Promise<CreationResult>}|null=null,confirmed:CreationResult|null=null
 const listeners=new Set<()=>void>(),receipts=new WeakMap<CreationResult,{raw:string;result:string}>()
 const notify=()=>{for(const fn of listeners)fn()},context=():CreationContext=>({owner,epoch})
 function assertContext(c:CreationContext){if(!owner||c.owner!==owner||c.epoch!==epoch)throw Error('Account changed. Original task creation stays saved.')}
 const prefix=(actor:string)=>'rm-task-create-v1:'+actor+':'
 const key=(actor:string,request:string)=>prefix(actor)+request
 const list=()=>{
  if(!owner)return []
  const pending:CreationIntent[]=[]
  for(let i=0;i<storage.length;i++){
   const name=storage.key(i);if(!name?.startsWith(prefix(owner)))continue
   const raw=storage.getItem(name);if(raw===null)continue
   const p=parse(raw);assertContext({owner:p.owner,epoch})
   if(name!==key(p.owner,p.requestId))throw Error('Saved task creation identity needs review.')
   pending.push(p)
  }
  return pending.sort((a,b)=>a.requestId.localeCompare(b.requestId))
 }
 function prepare(input:unknown){
  if(!owner)throw Error('Sign in before creating tasks.')
  const draft=normalizeCreation(input),pending=list(),previous=pending.find(p=>JSON.stringify(creationDraft(p.payload))===JSON.stringify(draft))??pending[0]
  if(previous){if(JSON.stringify(creationDraft(previous.payload))!==JSON.stringify(draft))throw Error('A task creation is waiting. Review its original retry first.');return previous}
  const p:CreationIntent={version:1,owner,requestId:uuid(),payload:{...draft,items:draft.items.map(t=>({...t,id:uuid()}))}},raw=JSON.stringify(p)
  parse(raw);storage.setItem(key(owner,p.requestId),raw);notify();return p
 }
 function run(intent:CreationIntent):Promise<CreationResult>{
  let raw:string,p:CreationIntent
  try{assertContext({owner:intent.owner,epoch});raw=storage.getItem(key(intent.owner,intent.requestId))??'';p=parse(raw);
   if(JSON.stringify(p)!==JSON.stringify(intent))throw Error('Saved task creation changed.')
  }catch(e){return Promise.reject(e)}
  const actor=context(),flightKey=actor.epoch+':'+p.owner+':'+p.requestId
  if(running)return running.key===flightKey?running.promise:Promise.reject(Error('Wait for the current task creation.'))
  const work=(async()=>{
   const {data,error}=await client.rpc('ga_roadmap_create_tasks',{p_payload:p.payload,p_request_id:p.requestId});assertContext(actor)
   if(error){
    if(error.code==='42501')throw Error('Access denied, parent unavailable or saving paused. Original creation stays saved.')
    if(error.code==='22023')throw Error('Task or capture folders need review. Original creation stays saved.')
    throw Error('Task creation was not confirmed. Original creation stays saved.')
   }
   if(!object(data)||data.request_id!==p.requestId||typeof data.replayed!=='boolean'||!Array.isArray(data.tasks)||data.tasks.length>40)
    throw Error('Task creation was not confirmed.')
   const rows:TaskRow[]=data.tasks,seen=new Set<string>()
   for(const r of rows){if(!rowValid(r,p.owner)||seen.has(r.id))throw Error('Task rows were not confirmed.');seen.add(r.id)}
   if(p.payload.items.some(t=>!seen.has(t.id))||rows.some(r=>!p.payload.items.some(t=>t.id===r.id)&&r.kind!=='group')||
    p.payload.kind==='task'&&rows.length!==1)throw Error('Created tasks were not confirmed.')
   if(!data.replayed){
    let root:TaskRow|undefined
    if(p.payload.kind==='capture'){
     const groups=rows.filter(r=>r.kind==='group');root=groups.find(r=>r.parent_id===null&&r.title==='Captured'&&r.tags.includes('inbox'))
     if(!root||groups.length!==1+new Set(p.payload.items.map(t=>t.folder)).size)throw Error('Capture folders were not confirmed.')
    }
    for(const item of p.payload.items){const row=rows.find(r=>r.id===item.id)!,parent=rows.find(r=>r.id===row.parent_id)
     if(row.kind!=='task'||row.title!==item.title||JSON.stringify(row.tags)!==JSON.stringify(item.tags)||row.done||!row.expanded||row.streak!==0||row.streak_day!==null||
      (p.payload.kind==='task'?row.parent_id!==p.payload.parent_id:!parent||parent.kind!=='group'||parent.title!==item.folder||parent.parent_id!==root!.id))
      throw Error('New task details were not confirmed.')
    }
   }
   if(storage.getItem(key(p.owner,p.requestId))!==raw)throw Error('Newer saved task creation exists. Review before continuing.')
   const result:CreationResult={context:actor,requestId:p.requestId,tasks:rows,itemIds:p.payload.items.map(t=>t.id),submitted:creationDraft(p.payload)}
   receipts.set(result,{raw,result:JSON.stringify(result)});return result
  })()
  running={key:flightKey,promise:work};notify();void work.finally(()=>{if(running?.promise===work)running=null;notify()}).catch(()=>{});return work
 }
 function acknowledge(result:CreationResult){
  assertContext(result.context);const receipt=receipts.get(result)
  if(!receipt||JSON.stringify(result)!==receipt.result||storage.getItem(key(owner!,result.requestId))!==receipt.raw)throw Error('Saved task creation changed. Review before continuing.')
  storage.removeItem(key(owner!,result.requestId));receipts.delete(result);confirmed=result;notify()
 }
 return {prepare,run,acknowledge,list,context,assertContext,notify,confirmation:()=>confirmed,
  bind(next:string|null){if(next!==owner){owner=next;epoch++;confirmed=null;notify()}},busy:()=>!!running,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  discard(p:CreationIntent){assertContext({owner:p.owner,epoch});if(running)throw Error('Wait for the current task creation.');const old=list().find(x=>x.requestId===p.requestId);
   if(JSON.stringify(old)===JSON.stringify(p))storage.removeItem(key(p.owner,p.requestId));notify()},
 }
}
