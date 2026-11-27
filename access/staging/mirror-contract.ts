import type {RpcClient} from './session-contract.ts'
import type {TaskRow} from './task-edit-contract.ts'
export type MirrorEvent={address:Record<string,unknown>;payload:Record<string,unknown>;seq:number}
export type MirrorIntent={version:1;owner:string;event:MirrorEvent}
export type MirrorContext={owner:string|null;epoch:number}
export type MirrorResult={context:MirrorContext;event:MirrorEvent;lastSeq:number;taskId:string|null;suppressed:boolean;sourceDeleted:boolean;tasks:TaskRow[]}
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)
const positive=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0
const bytes=(x:string)=>new TextEncoder().encode(x).length
export const canonical=(x:unknown):unknown=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x
export const mirrorAddressKey=(x:unknown)=>JSON.stringify(canonical(x))
const same=(a:unknown,b:unknown)=>mirrorAddressKey(a)===mirrorAddressKey(b)
export function normalizeMirror(input:unknown):MirrorEvent{
 const bad=()=>Object.assign(Error('Malformed mirror delivery. Nothing was sent.'),{code:'22023'})
 if(!object(input)||Object.keys(input).length!==3||!object(input.address)||!object(input.payload)||!positive(input.seq))throw bad()
 const {address:a,payload:p,seq}=input
 if(!['board_id','item_key','sub_id'].every(k=>typeof a[k]==='string'&&!!(a[k] as string).trim())||
  ['done','del','lat'].some(k=>k in p&&typeof p[k]!=='boolean')||['title','t'].some(k=>k in p&&(typeof p[k]!=='string'||bytes(p[k] as string)>4096))||
  p.del!==true&&!(typeof (p.title??p.t)==='string'&&String(p.title??p.t).trim()))throw bad()
 let raw:string
 try{raw=JSON.stringify(input);if(bytes(JSON.stringify(a))>4096||bytes(JSON.stringify(p))>16384)throw bad()
  // Reject non-JSON values instead of silently dropping fields or coercing numbers.
  JSON.stringify(input,(_k,v)=>{if(v===undefined||typeof v==='function'||typeof v==='symbol'||typeof v==='number'&&!Number.isFinite(v))throw bad();return v})
 }catch{throw bad()}
 const clone=JSON.parse(raw);return {address:clone.address,payload:clone.payload,seq}
}
const stamp=(x:unknown)=>typeof x==='string'&&Number.isFinite(Date.parse(x))
function validRow(r:unknown,owner:string):r is TaskRow{return object(r)&&uuid(r.id)&&(r.parent_id===null||uuid(r.parent_id))&&typeof r.title==='string'&&
 ['task','group'].includes(String(r.kind))&&typeof r.done==='boolean'&&typeof r.expanded==='boolean'&&Number.isInteger(r.position)&&Number.isInteger(r.streak)&&
 (r.streak_day===null||typeof r.streak_day==='string')&&Array.isArray(r.tags)&&r.tags.every(t=>typeof t==='string')&&stamp(r.created_at)&&stamp(r.updated_at)&&(r.user_id===undefined||r.user_id===owner)}
export function createMirrors({client,storage}:{client:RpcClient;storage:Storage}){
 let owner:string|null=null,epoch=0,running:{key:string;promise:Promise<MirrorResult>}|null=null
 const listeners=new Set<()=>void>(),receipts=new WeakMap<MirrorResult,{raw:string;result:string}>()
 const notify=()=>{for(const fn of listeners)fn()},context=():MirrorContext=>({owner,epoch})
 function assertContext(c:MirrorContext){if(!owner||owner!==c.owner||epoch!==c.epoch)throw Error('Account changed. Original mirror delivery stays saved.')}
 const prefix=(o:string)=>'rm-mirror-v1:'+o+':',key=(p:MirrorIntent)=>prefix(p.owner)+p.event.seq
 function parse(raw:string):MirrorIntent{
  if(bytes(raw)>22000)throw Error('Saved mirror delivery needs review.')
  const p=JSON.parse(raw);if(!object(p)||Object.keys(p).length!==3||p.version!==1||!uuid(p.owner))throw Error('Saved mirror delivery needs review.')
  return {version:1,owner:p.owner,event:normalizeMirror(p.event)}
 }
 const list=()=>{if(!owner)return [];const out:MirrorIntent[]=[]
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(prefix(owner)))continue;const raw=storage.getItem(k);if(raw===null)continue
   const p=parse(raw);if(p.owner!==owner||key(p)!==k)throw Error('Saved mirror identity needs review.');out.push(p)}return out.sort((a,b)=>a.event.seq-b.event.seq)
 }
 function prepare(input:unknown){assertContext(context());const event=normalizeMirror(input),prior=list().find(p=>p.event.seq===event.seq)
  if(prior){if(!same(prior.event,event))throw Object.assign(Error('Mirror sequence changed. Review the original delivery.'),{code:'22023'});return prior}
  const p:MirrorIntent={version:1,owner:owner!,event},raw=JSON.stringify(p);parse(raw);storage.setItem(key(p),raw);notify();return p
 }
 function run(intent:MirrorIntent):Promise<MirrorResult>{
  let p:MirrorIntent,raw:string
  try{assertContext({...context(),owner:intent.owner});raw=storage.getItem(key(intent))??'';p=parse(raw);if(!same(p,intent))throw Error('Saved mirror delivery changed.')}
  catch(e){return Promise.reject(e)}
  const actor=context(),flight=actor.epoch+':'+p.event.seq
  if(running)return running.key===flight?running.promise:Promise.reject(Error('Wait for the current mirror delivery.'))
  const current=()=>{assertContext(actor);if(storage.getItem(key(p))!==raw)throw Error('Newer saved mirror delivery exists. Review before continuing.')}
  const work=(async()=>{
   const {data,error}=await client.rpc('ga_roadmap_receive_task',{p_address:p.event.address,p_payload:p.event.payload,p_seq:p.event.seq});current()
   if(error)throw Object.assign(Error(error.code==='42501'?'Mirror access is paused or reconciliation is required. Original delivery stays saved.':error.code==='40001'?'Mirror pairing needs review. Original delivery stays saved.':'Mirror delivery was not confirmed. Retry the original.'),{code:error.code})
   if(!object(data)||data.seq!==p.event.seq||!same(data.address,p.event.address)||typeof data.replayed!=='boolean'||!positive(data.last_seq)||data.last_seq<p.event.seq||
    data.task_id!==null&&!uuid(data.task_id)||typeof data.suppressed!=='boolean'||typeof data.source_deleted!=='boolean'||!Array.isArray(data.tasks)||data.tasks.length>2||
    data.tasks.some(r=>!validRow(r,p.owner))||new Set(data.tasks.map(r=>r.id)).size!==data.tasks.length)throw Error('Mirror acknowledgement was not confirmed.')
   const tasks:TaskRow[]=data.tasks,task=tasks.find(r=>r.id===data.task_id)
   if(data.suppressed?tasks.length!==0:!task||task.kind!=='task'||!task.tags.includes('wf')||
    tasks.length!==(task.parent_id?2:1)||tasks.some(r=>r.id!==task.id&&(r.id!==task.parent_id||r.kind!=='group')))throw Error('Mirror rows were not confirmed.')
   current();const result:MirrorResult={context:actor,event:p.event,lastSeq:data.last_seq,taskId:data.task_id as string|null,suppressed:data.suppressed,sourceDeleted:data.source_deleted,tasks}
   receipts.set(result,{raw,result:JSON.stringify(result)});return result
  })()
  running={key:flight,promise:work};notify();void work.finally(()=>{if(running?.promise===work)running=null;notify()}).catch(()=>{});return work
 }
 function acknowledge(result:MirrorResult){assertContext(result.context);const proof=receipts.get(result),k=prefix(owner!)+result.event.seq
  if(!proof||JSON.stringify(result)!==proof.result||storage.getItem(k)!==proof.raw)throw Error('Saved mirror delivery changed. Review before continuing.')
  storage.removeItem(k);receipts.delete(result);notify()
 }
 return {prepare,run,acknowledge,list,context,assertContext,notify,busy:()=>!!running,
  bind(next:string|null){if(next!==owner){owner=next;epoch++;notify()}},subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}}
}
