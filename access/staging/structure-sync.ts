import {supabase} from '../lib/supabase.ts'
import {useStore} from './useStore.ts'
import type {TaskRow} from '../types.ts'
import {createStructures,type StructurePayload,type StructureIntent,type StructureResult,normalizeStructure} from './structure-contract.ts'
import {ordinaryTasksBusy,assertNoPendingTaskEdit,assertNoPendingTaskCreation,setStructureGuard,runStructureMutation} from './task-write-activity.ts'
import {sessionActions} from './studySessions.ts'
import {dailyResets} from './daily-reset-sync.ts'
import {dailyLogs,legacyLogsBusy} from './daily-log-sync.ts'
import {comparisonEdits,comparisonImports} from './compareSync.ts'
export const structures=createStructures({client:supabase,storage:localStorage,uuid:()=>crypto.randomUUID()})
let locked=false,seen=false,previous:string|null=null,message='',reviewRequired=false
let applying:{owner:string|null;epoch:number;requestId:string;promise:Promise<StructureResult>}|null=null
export const structureMessage=()=>message
export function setStructureMessage(text:string){message=text;structures.notify()}
supabase.auth.onAuthStateChange((_event,session)=>{
 const next=session?.user.id??null;if(seen&&next!==previous)locked=true
 structures.bind(next);previous=next;seen=true;message=''
})
window.addEventListener('storage',()=>structures.notify())
setStructureGuard(()=>{if(locked||reviewRequired||structures.list().length||applying)throw Error('Resolve the saved tree change or reload current tasks before another write.')})
function ready(){
 if(locked)throw Error('Reload safely to continue with the current account.')
 structures.assertContext(structures.context())
 if(useStore.getState().loading)throw Error('Wait for current tasks to load.')
}
function otherWrites(){
 if(ordinaryTasksBusy()||legacyLogsBusy())throw Error('Wait for the current task or log change.')
 assertNoPendingTaskEdit();assertNoPendingTaskCreation()
 if(sessionActions.list().length||dailyResets.list().length||dailyLogs.list().length||comparisonEdits.list().length||comparisonImports.list().length)
  throw Error('Resolve saved study actions before changing the task tree.')
}
function currentTask(id:string){const row=useStore.getState().tree.find(t=>t.id===id)
 if(!row)throw Error('Task is no longer loaded.')
 if(row.tags.some(t=>['wf','orphaned','wf-orphan'].includes(t)))throw Error('Change this mirror in Weekly Focus.')
 return row
}
const target=(t:TaskRow)=>({id:t.id,expected_updated_at:t.updated_at,label:t.title})
export function newFolderMoveDraft(ids:string[],title:string,parentId:string|null=null,tags:string[]=[]):StructurePayload{
 return normalizeStructure({kind:'move',folder:{id:'$new',title:title.trim(),parent_id:parentId,tags},
  tasks:ids.map((id,position)=>({...target(currentTask(id)),parent_id:'$new',position}))})
}
export function retryStructure(p:StructureIntent):Promise<StructureResult>{
 const actor=structures.context()
 try{ready();structures.assertContext({...actor,owner:p.owner})}catch(e){return Promise.reject(e)}
 if(applying)return applying.owner===actor.owner&&applying.epoch===actor.epoch&&applying.requestId===p.requestId?applying.promise:Promise.reject(Error('Wait for the current tree change.'))
 const work=(async()=>{
  otherWrites()
  return runStructureMutation(async()=>{
   const before=new Map(useStore.getState().tree.map(t=>[t.id,JSON.stringify(t)]))
   const result=await structures.run(p);ready();structures.assertContext(result.context)
   let applied=false
   useStore.setState(s=>{
    const ids=[...result.tasks.map(t=>t.id),...result.deletedIds]
    if(ids.some(id=>before.get(id)!==JSON.stringify(s.tree.find(t=>t.id===id))))return s
    const rows=new Map(result.tasks.map(t=>[t.id,t])),deleted=new Set(result.deletedIds)
    if(s.tree.some(t=>t.parent_id&&deleted.has(t.parent_id)&&!deleted.has(t.id)))return s
    applied=true
    // Apply only confirmed targets. History/proof stays owned and intact.
    return {tree:[...s.tree.filter(t=>!deleted.has(t.id)).map(t=>rows.get(t.id)??t),...result.tasks.filter(t=>!s.tree.some(r=>r.id===t.id))],
     resources:s.resources.filter(r=>!deleted.has(r.task_id)),
     sessions:s.sessions.map(r=>r.task_id&&deleted.has(r.task_id)?{...r,task_id:null}:r),
     log:s.log.map(r=>r.task_id&&deleted.has(r.task_id)?{...r,task_id:null}:r),
     comparisons:s.comparisons.map(r=>r.task_id&&deleted.has(r.task_id)?{...r,task_id:null}:r),error:null}
   })
   if(!applied)throw Error('Server change was confirmed. Newer local work was kept; review the saved retry.')
   structures.acknowledge(result);setStructureMessage(p.payload.kind==='delete'?'Deletion confirmed. Study history was retained.':'Move confirmed.');return result
  })
 })()
 applying={...actor,requestId:p.requestId,promise:work};void work.finally(()=>{if(applying?.promise===work)applying=null;structures.notify()}).catch(()=>{});return work
}
export async function saveStructure(input:StructurePayload){
 ready();if(reviewRequired)throw Error('Reload current tasks after discarding a retry.')
 otherWrites();return retryStructure(structures.prepare(input))
}
export async function moveTaskStructures(patches:{id:string;patch:{parent_id?:string|null;position?:number}}[]){
 if(!patches.length)return
 const tasks=patches.map(({id,patch})=>{const row=currentTask(id);
  if(!Object.keys(patch).length||Object.keys(patch).some(k=>!['parent_id','position'].includes(k)))throw Error('Save task moves separately from other edits.')
  return {...target(row),parent_id:patch.parent_id===undefined?row.parent_id:patch.parent_id,position:patch.position??row.position}
 })
 await saveStructure({kind:'move',tasks})
}
export async function reorderTaskStructure(id:string,index:number){
 const row=currentTask(id),siblings=useStore.getState().tree.filter(t=>t.parent_id===row.parent_id).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id))
 if(!Number.isInteger(index))throw Error('Invalid position.')
 const from=siblings.findIndex(t=>t.id===id),to=Math.max(0,Math.min(index,siblings.length-1));if(from===to)return
 const [moved]=siblings.splice(from,1);siblings.splice(to,0,moved)
 await moveTaskStructures(siblings.map((t,position)=>({id:t.id,patch:{parent_id:t.parent_id,position}})))
}
export async function queueTaskDeletion(ids:string[]){
 if(!ids.length)return
 ready();if(reviewRequired)throw Error('Reload current tasks after discarding a retry.');otherWrites()
 const selected=new Set(ids),tree=useStore.getState().tree
 for(let changed=true;changed;){changed=false;for(const row of tree)if(row.parent_id&&selected.has(row.parent_id)&&!selected.has(row.id)){selected.add(row.id);changed=true}}
 structures.prepare({kind:'delete',tasks:[...selected].map(id=>target(currentTask(id)))})
 setStructureMessage('Review this deletion. Nothing has been deleted. Cancel keeps the whole tree.')
}
export function discardStructure(p:StructureIntent){
 ready();structures.discard(p)
 if(p.attempted){reviewRequired=true;setStructureMessage('Retry discarded. A server change may already be saved. Reload current tasks before another write.')}
 else setStructureMessage('Deletion cancelled. No request was sent; tasks and study history are unchanged.')
}
