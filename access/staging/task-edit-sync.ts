import {supabase} from '../lib/supabase.ts'
import {useStore} from './useStore.ts'
import {sessionActions} from './studySessions.ts'
import {createTaskEdits,type EditIntent,type MetadataPatch,isMetadata,hasMetadata} from './task-edit-contract.ts'
import {ordinaryTasksBusy,taskWriteVersion,trackTaskWrite,setTaskEditGuard,assertNoPendingReset} from './task-write-activity.ts'
export {isMetadata,hasMetadata}
export const taskEdits=createTaskEdits({client:supabase,storage:localStorage,requestId:()=>crypto.randomUUID()})
let locked=false,seen=false,previous:string|null=null,message='',reviewRequired=false
let applying:{owner:string|null;epoch:number;requestId:string;promise:Promise<void>}|null=null
export const taskEditMessage=()=>message
export function setTaskEditMessage(text:string){message=text;taskEdits.notify()}
supabase.auth.onAuthStateChange((_event,session)=>{
 const next=session?.user.id??null;if(seen&&next!==previous)locked=true
 taskEdits.bind(next);previous=next;seen=true;message=''
})
window.addEventListener('storage',()=>taskEdits.notify())
setTaskEditGuard(ids=>{
 if(taskEdits.list().some(p=>!ids||p.tasks.some(t=>ids.includes(t.id))))throw Error('Resolve the saved task edits before another task change.')
})
function unlocked(){if(locked)throw Error('Reload safely to continue with the current account.')}
function ready(ids:string[]){
 unlocked();if(useStore.getState().loading)throw Error('Wait for current tasks to load.')
 if(ordinaryTasksBusy())throw Error('Wait for the current task change to finish.')
 ids.forEach(assertNoPendingReset)
 if(sessionActions.list().some(p=>p.kind==='daily'&&ids.includes(p.taskId)))throw Error('Resolve the saved daily action before editing these tasks.')
}
export function retryTaskEdits(p:EditIntent):Promise<void>{
 const actor=taskEdits.context()
 try{unlocked();taskEdits.assertContext({...actor,owner:p.owner})}catch(e){return Promise.reject(e)}
 if(applying)return applying.owner===actor.owner&&applying.epoch===actor.epoch&&applying.requestId===p.requestId?applying.promise:Promise.reject(Error('Wait for the current task edit.'))
 const work=(async()=>{
  const ids=p.tasks.map(t=>t.id);ready(ids)
  const run=async()=>{
   const before=new Map(useStore.getState().tree.filter(t=>ids.includes(t.id)).map(t=>[t.id,{json:JSON.stringify(t),version:taskWriteVersion(t.id)}]))
   if(before.size!==ids.length)throw Error('Some edited tasks are no longer loaded. Review before retrying.')
   const result=await taskEdits.run(p);unlocked();taskEdits.assertContext(result.context)
   let applied=false
   useStore.setState(s=>{
    if(ids.some(id=>{const old=before.get(id)!;return old.version!==taskWriteVersion(id)||old.json!==JSON.stringify(s.tree.find(t=>t.id===id))}))return s
    const rows=new Map(result.tasks.map(t=>[t.id,t]));applied=true
    return {tree:s.tree.map(t=>rows.get(t.id)??t),error:null}
   })
   if(!applied)throw Error('Save was confirmed on the server. Newer local edits were kept; review and retry.')
   taskEdits.acknowledge(result);setTaskEditMessage('Task edits confirmed.')
  }
  await ids.reduceRight<()=>Promise<void>>((next,id)=>()=>trackTaskWrite(id,next),run)()
 })()
 applying={...actor,requestId:p.requestId,promise:work};void work.finally(()=>{if(applying?.promise===work)applying=null}).catch(()=>{});return work
}
export async function editTaskMetadata(patches:{id:string;patch:MetadataPatch}[]){
 const ids=patches.map(p=>p.id);ready(ids)
 if(reviewRequired)throw Error('Reload current tasks after discarding a retry before making a new edit.')
 const tasks=patches.map(p=>{
  const row=useStore.getState().tree.find(t=>t.id===p.id)
  if(!row)throw Error('Task is no longer loaded.')
  if(row.tags.some(t=>['wf','orphaned','wf-orphan'].includes(t))&&('title'in p.patch||'tags'in p.patch))throw Error('Edit this mirror title and tags in Weekly Focus.')
  return {id:p.id,expectedUpdatedAt:row.updated_at,patch:p.patch}
 })
 await retryTaskEdits(taskEdits.prepare(tasks))
}
export function discardTaskEdits(p:EditIntent){
 taskEdits.discard(p);reviewRequired=true
 setTaskEditMessage('Retry discarded. A server change may already be saved. Reload current tasks before another metadata edit.')
}
