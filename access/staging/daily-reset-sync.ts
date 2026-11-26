import {supabase} from '../lib/supabase.ts'
import {dayKey} from '../lib/dailyReset.ts'
import {useStore} from './useStore.ts'
import {sessionActions} from './studySessions.ts'
import {createDailyResets,type ResetIntent} from './daily-reset-contract.ts'
import {taskWriting,taskWriteVersion,setDailyResetGuard} from './task-write-activity.ts'
import type {TaskRow} from '../types.ts'
export const dailyResets=createDailyResets({client:supabase,storage:localStorage,requestId:()=>crypto.randomUUID()})
let locked=false,seen=false,previous:string|null=null,message='',automaticPaused=false,ticking:Promise<void>|null=null
export const resetMessage=()=>message
export function setResetMessage(text:string){message=text;dailyResets.notify()}
supabase.auth.onAuthStateChange((_event,session)=>{
 const next=session?.user.id??null;if(seen&&next!==previous)locked=true
 dailyResets.bind(next);previous=next;seen=true;message=''
})
window.addEventListener('storage',()=>dailyResets.notify())
setDailyResetGuard(id=>{
 if(dailyResets.list().some(p=>p.tasks.some(t=>t.id===id)))throw Error('Resolve the saved daily reset before changing this checkbox.')
})
function unlocked(){if(locked)throw Error('Reload safely to continue with the current account.')}
export async function retryDailyReset(p:ResetIntent){
 unlocked();const actor=dailyResets.context();dailyResets.assertContext(actor)
 const ids=p.tasks.map(t=>t.id)
 if(taskWriting(ids))throw Error('Wait for the current task edit to finish.')
 if(sessionActions.list().some(s=>s.kind==='daily'&&ids.includes(s.taskId)))throw Error('Resolve the saved daily action before resetting these tasks.')
 const before=new Map(useStore.getState().tree.filter(t=>ids.includes(t.id)).map(t=>[t.id,{json:JSON.stringify(t),version:taskWriteVersion(t.id)}]))
 if(before.size!==ids.length)throw Error('Some reset tasks are no longer loaded. Review before retrying.')
 const result=await dailyResets.run(p);unlocked();dailyResets.assertContext(result.context)
 let applied=false
 useStore.setState(s=>{
  if(taskWriting(ids)||ids.some(id=>{const old=before.get(id)!;return old.version!==taskWriteVersion(id)||old.json!==JSON.stringify(s.tree.find(t=>t.id===id))}))return s
  const rows=new Map(result.tasks.map(t=>[t.id,t]));applied=true
  return {tree:s.tree.map(t=>rows.has(t.id)?rows.get(t.id) as TaskRow:t)}
 })
 if(!applied)throw Error('Reset was confirmed on the server. Newer local edits were kept; review and retry after those edits finish.')
 dailyResets.acknowledge(result);setResetMessage('Daily reset confirmed. Streaks and study history were kept.')
}
export function discardDailyReset(p:ResetIntent){
 dailyResets.discard(p);automaticPaused=true
 setResetMessage('Reset retry discarded. A server change may already be saved. Reload to review current tasks before another automatic reset.')
}
export function runDailyReset():Promise<void>{
 if(ticking)return ticking
 const work=(async()=>{
  try{
   unlocked();const actor=dailyResets.context();if(!actor.owner||automaticPaused||dailyResets.busy()||dailyResets.list().length)return
   const pending=new Set(sessionActions.list().filter(p=>p.kind==='daily').map(p=>p.taskId)),today=dayKey()
   const stale=useStore.getState().tree.filter(t=>t.kind==='task'&&Array.isArray(t.tags)&&t.tags.includes('daily-routine')&&t.done===true&&
    Number.isFinite(Date.parse(t.updated_at))&&dayKey(new Date(t.updated_at))<today&&!pending.has(t.id)&&!taskWriting([t.id]))
    .sort((a,b)=>a.id.localeCompare(b.id)).slice(0,100)
   if(!stale.length)return
   const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone
   const p=dailyResets.prepare(stale.map(t=>({id:t.id,expectedUpdatedAt:t.updated_at})),today,timezone)
   await retryDailyReset(p)
  }catch(e){setResetMessage(e instanceof Error?e.message:'Daily reset was not confirmed. Review the saved retry.')}
 })()
 ticking=work;void work.finally(()=>{if(ticking===work)ticking=null}).catch(()=>{});return work
}
