import {assertNoPendingStructure} from './task-write-activity.ts'
import {supabase} from '../lib/supabase.ts'
import {useStore} from './useStore.ts'
import {guessCapture,splitCapture} from '../lib/capture.ts'
import {createTaskCreations,type CreationDraft,type CreationIntent,type CreationResult} from './task-creation-contract.ts'
import {ordinaryTasksBusy,assertNoPendingTaskEdit,setTaskCreationGuard,runTaskCreation} from './task-write-activity.ts'
export const taskCreations=createTaskCreations({client:supabase,storage:localStorage,uuid:()=>crypto.randomUUID()})
let locked=false,seen=false,previous:string|null=null,message='',reviewRequired=false
let applying:{owner:string|null;epoch:number;requestId:string;promise:Promise<CreationResult>}|null=null
export const taskCreationMessage=()=>message
export function setTaskCreationMessage(text:string){message=text;taskCreations.notify()}
supabase.auth.onAuthStateChange((_event,session)=>{
 const next=session?.user.id??null;if(seen&&next!==previous)locked=true
 taskCreations.bind(next);previous=next;seen=true;message=''
})
window.addEventListener('storage',()=>taskCreations.notify())
setTaskCreationGuard(()=>{if(taskCreations.list().length||applying)throw Error('Resolve the saved task creation before another tree change.')})
function ready(){
 assertNoPendingStructure()
 if(locked)throw Error('Reload safely to continue with the current account.')
 taskCreations.assertContext(taskCreations.context())
 if(useStore.getState().loading)throw Error('Wait for current tasks to load.')
}
export function retryTaskCreation(p:CreationIntent):Promise<CreationResult>{
 const actor=taskCreations.context()
 try{ready();taskCreations.assertContext({...actor,owner:p.owner})}catch(e){return Promise.reject(e)}
 if(applying)return applying.owner===actor.owner&&applying.epoch===actor.epoch&&applying.requestId===p.requestId?applying.promise:Promise.reject(Error('Wait for the current task creation.'))
 const work=(async()=>{
  if(ordinaryTasksBusy())throw Error('Wait for the current tree change. The new tasks stay saved for retry.')
  assertNoPendingTaskEdit()
  return runTaskCreation(async()=>{
   const before=new Map(useStore.getState().tree.map(t=>[t.id,JSON.stringify(t)]))
   const result=await taskCreations.run(p);ready();taskCreations.assertContext(result.context)
   let applied=false
   useStore.setState(s=>{
    if(result.tasks.some(t=>before.get(t.id)!==JSON.stringify(s.tree.find(r=>r.id===t.id))))return s
    // Only acknowledged rows change; unrelated edits, logs and session proof remain.
    const fresh=new Map(result.tasks.map(t=>[t.id,t]));applied=true
    return {tree:[...s.tree.map(t=>fresh.get(t.id)??t),...result.tasks.filter(t=>!s.tree.some(r=>r.id===t.id))],error:null}
   })
   if(!applied)throw Error('Creation was confirmed on the server. Newer local work was kept; review the saved retry.')
   taskCreations.acknowledge(result);setTaskCreationMessage('Confirmed '+p.payload.items.length+' new task'+(p.payload.items.length===1?'':'s')+'.');return result
  })
 })()
 applying={...actor,requestId:p.requestId,promise:work};void work.finally(()=>{if(applying?.promise===work)applying=null}).catch(()=>{});return work
}
export async function saveTaskCreation(input:CreationDraft){
 ready();if(reviewRequired)throw Error('Reload current tasks after discarding a retry before creating more tasks.')
 return retryTaskCreation(taskCreations.prepare(input))
}
export const taskDraft=(parent_id:string|null,title:string,tags:string[]=[]):CreationDraft=>({kind:'task',parent_id,items:[{title:title.trim(),tags}]})
export const captureDraft=(text:string):CreationDraft=>({kind:'capture',text,items:splitCapture(text).map(line=>{
 const guess=guessCapture(line)!;return {title:guess.title,tags:[...guess.tags,'parked'],folder:guess.folder}
})})
export function discardTaskCreation(p:CreationIntent){
 taskCreations.discard(p);reviewRequired=true
 setTaskCreationMessage('Retry discarded. Tasks may already exist on the server. Reload current tasks before creating more.')
}
