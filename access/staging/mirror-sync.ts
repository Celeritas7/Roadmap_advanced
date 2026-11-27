import {accountRpc} from './account-rpc.ts'
import {supabase} from '../lib/supabase.ts'
import {useStore} from './useStore.ts'
import {createMirrors,type MirrorIntent,type MirrorResult} from './mirror-contract.ts'
import {ordinaryTasksBusy,assertNoPendingStructure,assertNoPendingTaskEdit,assertNoPendingTaskCreation,runMirrorMutation} from './task-write-activity.ts'
import {sessionActions} from './studySessions.ts'
import {dailyResets} from './daily-reset-sync.ts'
import {dailyLogs,legacyLogsBusy} from './daily-log-sync.ts'
import {comparisonEdits,comparisonImports} from './compareSync.ts'
export const mirrors=createMirrors({client:accountRpc(supabase,()=>mirrors.context(),c=>mirrors.assertContext(c)),storage:localStorage})
let seen=false,previous:string|null=null,locked=false,message='',pairView:((r:MirrorResult)=>void)|null=null
export const registerMirrorPair=(fn:(r:MirrorResult)=>void)=>{pairView=fn}
export const mirrorMessage=()=>message
export function setMirrorMessage(text:string){message=text;mirrors.notify()}
supabase.auth.onAuthStateChange((_event,session)=>{
 const next=session?.user.id??null;if(seen&&next!==previous)locked=true
 mirrors.bind(next);previous=next;seen=true;message=''
})
window.addEventListener('storage',()=>mirrors.notify())
function ready(){
 if(locked)throw Error('Reload safely to continue with the current account.')
 mirrors.assertContext(mirrors.context())
 if(useStore.getState().loading)throw Error('Wait for current tasks to load.')
}
function otherWrites(){
 if(ordinaryTasksBusy()||legacyLogsBusy())throw Error('Wait for the current task or log change.')
 assertNoPendingStructure();assertNoPendingTaskEdit();assertNoPendingTaskCreation()
 if(sessionActions.list().length||dailyResets.list().length||dailyLogs.list().length||comparisonEdits.list().length||comparisonImports.list().length)
  throw Error('Resolve saved study actions before applying mirror deliveries.')
}
let applying:{owner:string|null;epoch:number;seq:number;promise:Promise<MirrorResult>}|null=null
export function retryMirror(p:MirrorIntent):Promise<MirrorResult>{
 const actor=mirrors.context()
 try{ready();mirrors.assertContext({...actor,owner:p.owner})}catch(e){return Promise.reject(e)}
 if(applying)return applying.owner===actor.owner&&applying.epoch===actor.epoch&&applying.seq===p.event.seq?applying.promise:Promise.reject(Error('Wait for the current mirror delivery.'))
 const work=(async()=>{
  otherWrites()
  return runMirrorMutation(async()=>{
   const before=new Map(useStore.getState().tree.map(t=>[t.id,JSON.stringify(t)]))
   const result=await mirrors.run(p);ready();mirrors.assertContext(result.context)
   let applied=false
   useStore.setState(s=>{
    if(result.tasks.some(t=>before.get(t.id)!==JSON.stringify(s.tree.find(r=>r.id===t.id)))||
     result.suppressed&&s.tree.some(t=>t.id===result.taskId))return s
    const rows=new Map(result.tasks.map(t=>[t.id,t]));applied=true
    return {tree:[...s.tree.map(t=>rows.get(t.id)??t),...result.tasks.filter(t=>!s.tree.some(r=>r.id===t.id))],error:null}
   })
   if(!applied)throw Error('Mirror saved on the server. Newer local work was kept; reload current tasks before retrying.')
   ready();mirrors.assertContext(result.context);pairView?.(result);mirrors.acknowledge(result)
   setMirrorMessage(result.sourceDeleted?'Mirror retained as orphaned. Hub deletion acknowledgement still requires review.':'Mirror delivery confirmed.');return result
  })
 })()
 applying={...actor,seq:p.event.seq,promise:work};void work.catch(e=>setMirrorMessage(e instanceof Error?e.message:'Delivery stays saved.')).finally(()=>{if(applying?.promise===work)applying=null;mirrors.notify()}).catch(()=>{});return work
}
export function receiveMirror(address:unknown,payload:unknown,seq:number){ready();otherWrites();return retryMirror(mirrors.prepare({address,payload,seq}))}
