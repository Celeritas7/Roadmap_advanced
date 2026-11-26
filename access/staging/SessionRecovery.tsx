import {useEffect,useState} from 'react'
import {sessionActions,runSessionAction,type PendingAction,type ActionResult} from './studySessions.ts'
import {useStore} from './useStore.ts'
import type {TaskRow,SessionRow} from '../types.ts'
export function applySessionResult(result:ActionResult) {
 if(result.kind==='daily')useStore.setState(s=>({
  tree:s.tree.map(t=>t.id===result.task.id?result.task as TaskRow:t),
  sessions:result.session?[...s.sessions.filter(x=>x.id!==result.session!.id),result.session as SessionRow]:s.sessions,
 }))
 else void useStore.getState().refreshSessions()
}
export function SessionRecovery() {
 const [revision,setRevision]=useState(0),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>sessionActions.subscribe(()=>setRevision(x=>x+1)),[])
 let pending:PendingAction[]=[];let issue=''
 try{pending=sessionActions.list()}catch{issue='Saved session actions need review. No request was sent.'}
 const retry=async(p:PendingAction)=>{
  setBusy(true);setMessage('')
  try{applySessionResult(await runSessionAction(p));setMessage('Saved session confirmed.')}
  catch(e){setMessage(e instanceof Error?e.message:'Save not confirmed. Retry remains saved.')}
  finally{setBusy(false)}
 }
 if(!pending.length&&!message&&!issue)return null
 return <section aria-label="Study session recovery" role="status" style={{padding:12,border:'1px solid currentColor'}} data-revision={revision}>
  <p>{issue||message||'Study changes are waiting for confirmation. Retry when connected.'}</p>
  {pending.map(p=><div key={p.requestId}>
   <span>{p.kind==='start'?'Session start':'Daily task change'} · {p.day} </span>
   <button disabled={busy} onClick={()=>void retry(p)}>Retry saved action</button>
   <button disabled={busy} onClick={()=>{
    if(window.confirm('Discard this device’s retry? This does not undo any change already saved on the server.')) {
     try{sessionActions.discard(p);setMessage('Retry discarded. Refresh to check the server result.');void useStore.getState().refreshSessions()}
     catch(e){setMessage(e instanceof Error?e.message:'Could not discard retry.')}
    }
   }}>Discard retry</button>
  </div>)}
 </section>
}
