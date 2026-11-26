import {supabase} from '../lib/supabase.ts'
import {useStore} from './useStore.ts'
import {createDailyLogs,type LogIntent} from './daily-log-contract.ts'
export const dailyLogs=createDailyLogs({client:supabase,storage:localStorage,uuid:()=>crypto.randomUUID()})
let locked=false,seen=false,previous:string|null=null,message='',reviewRequired=false,deleting=0
let applying:{owner:string|null;epoch:number;requestId:string;promise:Promise<void>}|null=null
export const dailyLogMessage=()=>message
export function setDailyLogMessage(text:string){message=text;dailyLogs.notify()}
supabase.auth.onAuthStateChange((_event,session)=>{
 const next=session?.user.id??null;if(seen&&next!==previous)locked=true
 dailyLogs.bind(next);previous=next;seen=true;message=''
})
window.addEventListener('storage',()=>dailyLogs.notify())
function ready(){
 if(locked)throw Error('Reload safely to continue with the current account.')
 dailyLogs.assertContext(dailyLogs.context())
 if(useStore.getState().loading)throw Error('Wait for current logs to load.')
}
export function retryDailyLog(p:LogIntent):Promise<void>{
 const actor=dailyLogs.context()
 try{ready();dailyLogs.assertContext({...actor,owner:p.owner})}catch(e){return Promise.reject(e)}
 if(applying)return applying.owner===actor.owner&&applying.epoch===actor.epoch&&applying.requestId===p.requestId?applying.promise:Promise.reject(Error('Wait for the current daily log.'))
 const work=(async()=>{
  if(deleting)throw Error('Wait for the current log deletion. The new entry stays saved for retry.')
  const before=JSON.stringify(useStore.getState().log.find(l=>l.id===p.entryId))
  const result=await dailyLogs.run(p);ready();dailyLogs.assertContext(result.context)
  let applied=false
  useStore.setState(s=>{
   if(JSON.stringify(s.log.find(l=>l.id===p.entryId))!==before)return s
   applied=true
   return {log:s.log.some(l=>l.id===p.entryId)?s.log.map(l=>l.id===p.entryId?result.entry:l):[result.entry,...s.log],error:null}
  })
  if(!applied)throw Error('Log was confirmed on the server. Newer local work was kept; review the saved retry.')
  dailyLogs.acknowledge(result);setDailyLogMessage('Daily log confirmed for '+result.entry.log_date+'.')
 })()
 applying={...actor,requestId:p.requestId,promise:work};void work.finally(()=>{if(applying?.promise===work)applying=null}).catch(()=>{});return work
}
export async function saveDailyLog(entry:unknown){
 ready();if(reviewRequired)throw Error('Reload current logs after discarding a retry before logging another entry.')
 await retryDailyLog(dailyLogs.prepare(entry))
}
export function discardDailyLog(p:LogIntent){
 dailyLogs.discard(p);reviewRequired=true
 setDailyLogMessage('Retry discarded. A server entry may already exist. Reload current logs before logging another entry.')
}
// Keep the unchanged delete/rollback path out of a new entry's save lifetime.
// Full deletion/history semantics remain a separate owning-client work group.
export async function runLegacyLogDelete<T>(write:()=>Promise<T>):Promise<T>{
 ready();if(applying||dailyLogs.busy()||dailyLogs.list().length)throw Error('Resolve the saved daily log before deleting entries.')
 deleting++
 try{return await write()}finally{deleting--}
}
