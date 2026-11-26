import {trackTaskWrite,assertNoPendingReset} from './task-write-activity.ts'
import {supabase} from '../lib/supabase.ts'
import {dayKey} from '../lib/dailyReset.ts'
import type {SessionRow,TaskRow} from '../types.ts'
import {createSessionActions,type PendingAction,type ActionResult} from './session-contract.ts'
export type {PendingAction,ActionResult}
export const sessionActions=createSessionActions({client:supabase,storage:localStorage,
 requestId:()=>crypto.randomUUID(),logicalDay:dayKey})
let seen=false,previous:string|null=null,locked=false
// A full reload avoids exposing the previous account's wider in-memory stores.
// It never clears browser storage, saved work or another account's pending action.
supabase.auth.onAuthStateChange((_event,session)=>{
 const next=session?.user.id??null
 sessionActions.bind(next)
 if(seen&&next!==previous&&!locked) {
  locked=true
  const root=document.getElementById('root');if(root)root.style.display='none'
  const panel=document.createElement('section');panel.setAttribute('role','alert')
  const message=document.createElement('p');message.textContent='Account changed. Reload to continue. Pending session changes remain saved for their original account.'
  const button=document.createElement('button');button.textContent='Reload safely';button.onclick=()=>window.location.reload()
  panel.append(message,button);document.body.append(panel)
 }
 previous=next;seen=true
})
window.addEventListener('storage',()=>sessionActions.notify())
const assertUnlocked=()=>{if(locked)throw Error('Reload to continue with the current account.')}
export async function fetchSessions(limit=400):Promise<SessionRow[]> {
 assertUnlocked();const owner=sessionActions.currentOwner()
 if(!owner)throw Error('Sign in to read study sessions.')
 const {data,error}=await supabase.from('roadmap_study_sessions')
  .select('id,task_id,day_key,source,started_at,completed_at,duration_min,feedback,verification,created_at')
  .eq('user_id',owner).order('day_key',{ascending:false}).limit(limit)
 assertUnlocked();if(owner!==sessionActions.currentOwner())throw Error('Account changed')
 if(error)throw error
 return (data??[]) as SessionRow[]
}
export async function startSession(taskId:string,day=dayKey()):Promise<void> {
 assertUnlocked();await sessionActions.run(sessionActions.prepare('start',taskId,{day}))
}
export async function setDailyTask(task:TaskRow):Promise<ActionResult> {
 assertUnlocked();assertNoPendingReset(task.id);return runSessionAction(sessionActions.prepare('daily',task.id,
  {done:!task.done,expectedUpdatedAt:task.updated_at}))
}
// Legacy exports remain type-compatible but daily UI must use one transaction.
export async function completeSessionManually(_taskId:string,_durationMin:number|null=null):Promise<void> {
 throw Error('Use the atomic daily-task action in this staging client.')
}
export async function uncompleteSessionToday(_taskId:string):Promise<void> {
 throw Error('Use the atomic daily-task action in this staging client.')
}

export async function runSessionAction(p:PendingAction):Promise<ActionResult>{
 assertUnlocked();if(p.kind==='start')return sessionActions.run(p)
 assertNoPendingReset(p.taskId);return trackTaskWrite(p.taskId,()=>sessionActions.run(p))
}
