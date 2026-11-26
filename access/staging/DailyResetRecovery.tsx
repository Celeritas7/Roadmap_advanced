import {useEffect,useState} from 'react'
import {dailyResets,retryDailyReset,discardDailyReset,resetMessage,setResetMessage} from './daily-reset-sync.ts'
import type {ResetIntent} from './daily-reset-contract.ts'
export function DailyResetRecovery(){
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>dailyResets.subscribe(()=>setRevision(v=>v+1)),[])
 let pending:ResetIntent[]=[],issue=''
 try{pending=dailyResets.list()}catch{issue='Saved daily reset needs review. No request was sent.'}
 const message=issue||resetMessage()
 if(!pending.length&&!message)return null
 return <section aria-label="Daily reset recovery" role="status" data-revision={revision} style={{padding:12,border:'1px solid currentColor'}}>
  <p>{message||'A daily reset is waiting for confirmation. Showing the last confirmed tasks.'}</p>
  {pending.map(p=><div key={p.requestId}>
   <span>{p.tasks.length} daily tasks · {p.day} </span>
   <button disabled={busy||dailyResets.busy()} onClick={()=>{setBusy(true);void retryDailyReset(p).catch(e=>setResetMessage(e instanceof Error?e.message:'Reset was not confirmed.')).finally(()=>setBusy(false))}}>Retry daily reset</button>
   <button disabled={busy||dailyResets.busy()} onClick={()=>{
    if(window.confirm('Discard this saved reset retry? A reset already committed on the server is not undone.')){
     try{discardDailyReset(p)}catch(e){setResetMessage(e instanceof Error?e.message:'Retry stays saved.')}
    }
   }}>Discard reset retry</button>
  </div>)}
  <button disabled={busy||dailyResets.busy()} onClick={()=>window.location.reload()}>Reload current tasks</button>
 </section>
}
