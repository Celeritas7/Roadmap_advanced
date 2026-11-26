import type {RpcClient} from './session-contract.ts'
// Structural types keep this controller testable without a browser or source-tree copy.
export type TaskRow={id:string;parent_id:string|null;title:string;done:boolean;kind:'task'|'group';position:number;expanded:boolean;tags:string[];streak:number;streak_day:string|null;created_at:string;updated_at:string}
type TaskUpdate={title?:string;tags?:string[];expanded?:boolean;[key:string]:unknown}
export type MetadataPatch=Pick<TaskUpdate,'title'|'tags'|'expanded'>
export type EditTarget={id:string;expectedUpdatedAt:string;patch:MetadataPatch}
export type EditIntent={version:1;owner:string;requestId:string;tasks:EditTarget[]}
export type EditContext={owner:string|null;epoch:number}
export type EditResult={context:EditContext;requestId:string;tasks:TaskRow[]}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isId=(x:unknown):x is string=>typeof x==='string'&&uuid.test(x)
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const stamp=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x))
const bytes=(x:string)=>new TextEncoder().encode(x).length
export const hasMetadata=(p:TaskUpdate)=>Object.keys(p).some(k=>['title','tags','expanded'].includes(k))
export const isMetadata=(p:TaskUpdate)=>Object.keys(p).length>0&&Object.keys(p).every(k=>['title','tags','expanded'].includes(k))
function patchValid(p:unknown):p is MetadataPatch {
 if(!object(p)||!isMetadata(p))return false
 if('title' in p&&(typeof p.title!=='string'||!p.title.trim()||bytes(p.title)>4096))return false
 if('expanded' in p&&typeof p.expanded!=='boolean')return false
 if('tags' in p&&(!Array.isArray(p.tags)||p.tags.length>32||new Set(p.tags).size!==p.tags.length||
  !p.tags.every(t=>typeof t==='string'&&!!t.trim()&&bytes(t)<=80&&!['wf','orphaned','wf-orphan'].includes(t))))return false
 return true
}
function valid(p:EditIntent){
 return p?.version===1&&isId(p.owner)&&isId(p.requestId)&&Array.isArray(p.tasks)&&p.tasks.length>=1&&p.tasks.length<=100&&
  p.tasks.every(t=>object(t)&&Object.keys(t).length===3&&isId(t.id)&&stamp(t.expectedUpdatedAt)&&patchValid(t.patch))&&new Set(p.tasks.map(t=>t.id)).size===p.tasks.length
}
function rowValid(r:unknown):r is TaskRow {
 return object(r)&&isId(r.id)&&(r.parent_id===null||isId(r.parent_id))&&typeof r.title==='string'&&typeof r.done==='boolean'&&
  ['task','group'].includes(String(r.kind))&&Number.isInteger(r.position)&&typeof r.expanded==='boolean'&&Array.isArray(r.tags)&&r.tags.every(t=>typeof t==='string')&&
  Number.isInteger(r.streak)&&(r.streak_day===null||typeof r.streak_day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.streak_day))&&stamp(r.created_at)&&stamp(r.updated_at)
}
export function createTaskEdits({client,storage,requestId}:{client:RpcClient;storage:Storage;requestId:()=>string}){
 let owner:string|null=null,epoch=0,running:{key:string;promise:Promise<EditResult>}|null=null
 const listeners=new Set<()=>void>(),receipts=new WeakMap<EditResult,{intent:EditIntent;raw:string}>()
 const notify=()=>{for(const fn of listeners)fn()}
 const context=():EditContext=>({owner,epoch})
 function assertContext(c:EditContext){if(!owner||c.owner!==owner||c.epoch!==epoch)throw Error('Account changed. Original task edits stay saved.')}
 const key=(actor:string)=>'rm-task-edit-v1:'+actor
 const parse=(raw:string)=>{if(bytes(raw)>49152)throw Error('Saved task edits need review.');const p=JSON.parse(raw) as EditIntent;if(!valid(p))throw Error('Saved task edits need review.');return p}
 const list=()=>{if(!owner)return [];const raw=storage.getItem(key(owner));if(!raw)return [];const p=parse(raw);assertContext({owner:p.owner,epoch});return [p]}
 function prepare(tasks:EditTarget[]){
  if(!owner)throw Error('Sign in before editing tasks.')
  // Clone before persisting so a later caller mutation cannot change the request.
  const p:EditIntent=JSON.parse(JSON.stringify({version:1,owner,requestId:requestId(),tasks:[...tasks].sort((a,b)=>a.id.localeCompare(b.id))}))
  const raw=JSON.stringify(p);if(!valid(p)||bytes(raw)>49152)throw Error('Invalid or oversized task edits. Review the selected tasks.')
  const previous=list()[0]
  if(previous){if(JSON.stringify({...previous,requestId:p.requestId})!==raw)throw Error('Task edits are waiting. Review the original retry first.');return previous}
  storage.setItem(key(owner),raw);notify();return p
 }
 function run(p:EditIntent):Promise<EditResult>{
  let raw:string
  try{assertContext({owner:p.owner,epoch});if(!valid(p))throw Error('Invalid task edits.');raw=storage.getItem(key(p.owner))??'';
   if(JSON.stringify(parse(raw))!==JSON.stringify(p))throw Error('Saved task edits changed.')
  }catch(e){return Promise.reject(e)}
  const actor=context(),flightKey=actor.epoch+':'+p.owner+':'+p.requestId
  if(running)return running.key===flightKey?running.promise:Promise.reject(Error('Wait for the current task edit.'))
  const work=(async()=>{
   const {data,error}=await client.rpc('ga_roadmap_edit_tasks',{
    p_tasks:p.tasks.map(t=>({id:t.id,expected_updated_at:t.expectedUpdatedAt,patch:t.patch})),p_request_id:p.requestId,
   })
   assertContext(actor)
   if(error){
    if(error.code==='40001')throw Error('A task changed. Review current tasks; original edits stay saved.')
    if(error.code==='42501')throw Error('Access denied or task edits paused. Original edits stay saved.')
    if(error.code==='22023')throw Error('Task edits need review. Original edits stay saved.')
    throw Error('Task save was not confirmed. Original edits stay saved.')
   }
   if(!object(data)||data.request_id!==p.requestId||typeof data.replayed!=='boolean'||!Array.isArray(data.tasks)||data.tasks.length!==p.tasks.length)
    throw Error('Task save was not confirmed.')
   const ids=new Set<string>()
   for(const row of data.tasks){if(!rowValid(row)||ids.has(row.id)||!p.tasks.some(t=>t.id===row.id)||
    'user_id' in row&&row.user_id!==undefined&&row.user_id!==p.owner)throw Error('Task rows were not confirmed.');
    const target=p.tasks.find(t=>t.id===row.id)!
    if(!data.replayed&&(row.updated_at===target.expectedUpdatedAt||Object.entries(target.patch).some(([k,v])=>JSON.stringify(row[k as keyof TaskRow])!==JSON.stringify(v))))throw Error('Task changes were not confirmed.')
    ids.add(row.id)}
   if(storage.getItem(key(p.owner))!==raw)throw Error('Newer saved task edits exist. Review before continuing.')
   const result:EditResult={context:actor,requestId:p.requestId,tasks:data.tasks};receipts.set(result,{intent:p,raw});return result
  })()
  running={key:flightKey,promise:work};notify();void work.finally(()=>{if(running?.promise===work)running=null;notify()}).catch(()=>{});return work
 }
 function acknowledge(result:EditResult){
  assertContext(result.context);const receipt=receipts.get(result)
  if(!receipt||receipt.intent.requestId!==result.requestId||storage.getItem(key(receipt.intent.owner))!==receipt.raw)
   throw Error('Saved task edits changed. Review before continuing.')
  storage.removeItem(key(receipt.intent.owner));receipts.delete(result);notify()
 }
 return {prepare,run,acknowledge,list,context,assertContext,notify,
  bind(next:string|null){if(next!==owner){owner=next;epoch++;notify()}},busy:()=>!!running,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  discard(p:EditIntent){assertContext({owner:p.owner,epoch});if(running)throw Error('Wait for the current task edit.');const old=list()[0];if(old?.requestId===p.requestId)storage.removeItem(key(p.owner));notify()},
 }
}
