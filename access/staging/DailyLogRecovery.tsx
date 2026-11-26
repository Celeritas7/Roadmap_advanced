import {useEffect,useState} from 'react'
import {dailyLogs,retryDailyLog,discardDailyLog,dailyLogMessage,setDailyLogMessage} from './daily-log-sync.ts'
import type {LogIntent} from './daily-log-contract.ts'
export function DailyLogRecovery(){
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>dailyLogs.subscribe(()=>setRevision(v=>v+1)),[])
 let pending:LogIntent[]=[],issue=''
 try{pending=dailyLogs.list()}catch{issue='Saved daily log needs review. No request was sent.'}
 const message=issue||dailyLogMessage(),confirmed=dailyLogs.confirmation()
 if(!pending.length&&!message)return null
 return <section aria-label="Daily log recovery" role="status" data-revision={revision} style={{padding:12,border:'1px solid currentColor'}}>
  <p>{message||'A daily log is waiting for confirmation. Its original date and notes stay saved.'}</p>
  {confirmed&&!pending.length&&<p>{confirmed.entry.log_date} · {confirmed.entry.duration_minutes} min · {confirmed.entry.context} · {confirmed.entry.notes}</p>}
  {pending.map(p=><div key={p.requestId}>
   <p>{p.entry.log_date} · {p.entry.duration_minutes} min · {p.entry.context}</p>
   <p style={{whiteSpace:'pre-wrap'}}>{p.entry.notes}</p>
   <button disabled={busy||dailyLogs.busy()} onClick={()=>{setBusy(true);void retryDailyLog(p).catch(e=>setDailyLogMessage(e instanceof Error?e.message:'Log was not confirmed.')).finally(()=>setBusy(false))}}>Retry daily log</button>
   <button disabled={busy||dailyLogs.busy()} onClick={()=>{
    if(window.confirm('Discard this saved log retry? An entry already committed on the server is not removed.')){
     try{discardDailyLog(p)}catch(e){setDailyLogMessage(e instanceof Error?e.message:'Log stays saved.')}
    }
   }}>Discard log retry</button>
  </div>)}
  <button disabled={busy||dailyLogs.busy()} onClick={()=>window.location.reload()}>Reload current logs</button>
 </section>
}
