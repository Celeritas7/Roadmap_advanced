import {accountRpc} from './account-rpc.ts'
import {supabase} from '../lib/supabase.ts'
import {useStore} from './useStore.ts'
import {createCompletions,completionTerminal,type CompletionIntent,type CompletionResult} from './completion-contract.ts'
import {ordinaryTasksBusy,assertNoPendingStructure,assertNoPendingTaskEdit,assertNoPendingTaskCreation,runMirrorMutation} from './task-write-activity.ts'
import {sessionActions} from './studySessions.ts'
import {dailyResets} from './daily-reset-sync.ts'
import {dailyLogs,legacyLogsBusy} from './daily-log-sync.ts'
import {comparisonEdits,comparisonImports} from './compareSync.ts'
export const completions=createCompletions({client:accountRpc(supabase,()=>completions.context(),c=>completions.assertContext(c)),storage:localStorage,uuid:()=>crypto.randomUUID()})
let seen=false,previous:string|null=null,locked=false,message='',applyView:((r:CompletionResult)=>void)|null=null
export function registerCompletionView(fn:(r:CompletionResult)=>void){applyView=fn}
export const completionMessage=()=>message
export function setCompletionMessage(text:string){message=text;completions.notify()}
supabase.auth.onAuthStateChange((_event,session)=>{
 const next=session?.user.id??null;if(seen&&next!==previous)locked=true
 completions.bind(next);previous=next;seen=true;message=''
})
completions.subscribe(()=>{try{useStore.setState({pendingDone:completions.list().map(p=>p.taskId)})}catch{/* Corrupt recovery stays visible in its own panel. */}})
window.addEventListener('storage',()=>completions.notify())
function ready(){
 if(locked)throw Error('Reload safely to continue with the current account.')
 completions.assertContext(completions.context());if(useStore.getState().loading||!applyView)throw Error('Wait for Roadmap to load.')
}
function otherWrites(){
 if(ordinaryTasksBusy()||legacyLogsBusy())throw Error('Wait for the current task or log change.')
 assertNoPendingStructure();assertNoPendingTaskEdit();assertNoPendingTaskCreation()
 if(sessionActions.list().length||dailyResets.list().length||dailyLogs.list().length||comparisonEdits.list().length||comparisonImports.list().length)throw Error('Resolve saved study changes before completion recovery.')
}
let applying:{owner:string|null;epoch:number;requestId:string;publish:boolean;promise:Promise<void>}|null=null
export function retryCompletion(p:CompletionIntent,publish=true):Promise<void>{
 const actor=completions.context();try{ready();completions.assertContext({...actor,owner:p.owner})}catch(e){return Promise.reject(e)}
 if(applying)return applying.owner===actor.owner&&applying.epoch===actor.epoch&&applying.requestId===p.requestId&&applying.publish===publish?applying.promise:Promise.reject(Error('Wait for the current completion request.'))
 const work=(async()=>{
  otherWrites();return runMirrorMutation(async()=>{
   const before=JSON.stringify(useStore.getState().tree.find(t=>t.id===p.taskId))
   const result=await completions.run(p,publish);ready();completions.assertContext(result.context)
   if(!completionTerminal(result.state)){setCompletionMessage(result.state==='pending'?'Completion sent. Waiting for the source reply.':'Original completion is saved and has not been published.');return}
   let applied=false
   useStore.setState(s=>{
    const current=s.tree.find(t=>t.id===p.taskId)
    if(before!==JSON.stringify(current)||!result.tasks.length&&current)return s
    const row=result.tasks[0];if(row&&!current)return s
    applied=true;return {tree:s.tree.map(t=>t.id===p.taskId&&row?row:t),error:null}
   })
   if(!applied)throw Error('Reply saved on the server. Newer local work was kept; reload tasks before retrying.')
   ready();completions.assertContext(result.context);applyView!(result);completions.acknowledge(result)
   setCompletionMessage(result.state==='unknown'?'Source task is unavailable. Its mirror was retained as orphaned.':result.state==='stale'?'Source task changed. Check it in Weekly Focus.':result.state==='superseded'?'Newer source changes were preserved.':result.state==='removed'?'Original task was removed. Its study history was retained.':'Completion reply confirmed.')
  })
 })()
 applying={...actor,requestId:p.requestId,publish,promise:work};void work.catch(e=>setCompletionMessage(e instanceof Error?e.message:'Original request stays saved.')).finally(()=>{if(applying?.promise===work)applying=null;completions.notify()}).catch(()=>{});return work
}
export function requestCompletion(taskId:string,suggestionId:string|null){ready();otherWrites();return retryCompletion(completions.prepare(taskId,suggestionId))}
let polling:Promise<void>|null=null
export function pollCompletionReplies():Promise<void>{
 if(polling)return polling
 const work=(async()=>{ready();otherWrites();const actor=completions.context(),pending=await completions.discover();ready();completions.assertContext(actor)
  for(const p of pending){ready();completions.assertContext(actor);await retryCompletion(p,false)}
 })();polling=work;void work.catch(e=>setCompletionMessage(e instanceof Error?e.message:'Completion recovery is unavailable.')).finally(()=>{if(polling===work)polling=null}).catch(()=>{});return work
}
