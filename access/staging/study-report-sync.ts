import {accountRpc} from './account-rpc.ts'
import {supabase} from '../lib/supabase.ts'
import {useStore} from './useStore.ts'
import {createStudyReports,type StudyIntent,type StudyResult} from './study-report-contract.ts'
import {ordinaryTasksBusy,assertNoPendingStructure,runStudyReportMutation} from './task-write-activity.ts'
import {sessionActions} from './studySessions.ts'
export const studyReports=createStudyReports({client:accountRpc(supabase,()=>studyReports.context(),c=>studyReports.assertContext(c)),storage:localStorage})
let seen=false,previous:string|null=null,locked=false,message=''
export const studyReportMessage=()=>message
export function setStudyReportMessage(text:string){message=text;studyReports.notify()}
supabase.auth.onAuthStateChange((_event,session)=>{const next=session?.user.id??null;if(seen&&next!==previous)locked=true;studyReports.bind(next);previous=next;seen=true;message=''})
window.addEventListener('storage',()=>studyReports.notify())
function ready(){if(locked)throw Error('Reload safely with the current account.');studyReports.assertContext(studyReports.context());if(useStore.getState().loading)throw Error('Wait for study records to load.')}
let applying:{owner:string|null;epoch:number;seq:number;promise:Promise<StudyResult>}|null=null
export function retryStudyReport(p:StudyIntent):Promise<StudyResult>{
 const actor=studyReports.context()
 try{ready();studyReports.assertContext({...actor,owner:p.owner})}catch(e){return Promise.reject(e)}
 if(applying)return applying.owner===actor.owner&&applying.epoch===actor.epoch&&applying.seq===p.event.seq?applying.promise:Promise.reject(Error('Wait for the current study delivery.'))
 const work=(async()=>{
  assertNoPendingStructure();if(ordinaryTasksBusy()||sessionActions.list().length)throw Error('Resolve saved task/session changes first.')
  return runStudyReportMutation(async()=>{
   const before=JSON.stringify(useStore.getState().sessions),task=JSON.stringify(useStore.getState().tree.find(t=>t.id===p.event.taskId))
   if(!task)throw Error('Reload current tasks before applying this study report.')
   const result=await studyReports.run(p);ready();studyReports.assertContext(result.context)
   let applied=false
   useStore.setState(s=>{
    if(JSON.stringify(s.sessions)!==before||JSON.stringify(s.tree.find(t=>t.id===p.event.taskId))!==task)return s
    applied=true;const keep=s.sessions.filter(r=>!(r.task_id===p.event.taskId&&r.day_key===p.event.day))
    return {sessions:result.session?[...keep,result.session]:keep,error:null}
   })
   if(!applied)throw Error('Study report saved on the server. Newer local work was kept; reload before retrying.')
   ready();studyReports.assertContext(result.context);studyReports.acknowledge(result)
   setStudyReportMessage(result.outcome==='reported'?'Study completion reported by the app. This is not independently verified.':result.outcome==='removed'?'Study record was removed; nothing was recreated.':'Current study record kept.');return result
  })
 })()
 applying={...actor,seq:p.event.seq,promise:work};void work.catch(e=>setStudyReportMessage(e instanceof Error?e.message:'Study delivery stays saved.')).finally(()=>{if(applying?.promise===work)applying=null;studyReports.notify()}).catch(()=>{});return work
}
export function receiveStudyReport(payload:Record<string,unknown>,seq:number){ready();return retryStudyReport(studyReports.prepare({seq,taskId:payload.task_id,day:payload.day_key}))}
