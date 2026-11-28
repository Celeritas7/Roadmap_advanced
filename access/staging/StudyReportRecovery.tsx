import {useEffect,useState} from 'react'
import {studyReports,studyReportMessage,setStudyReportMessage,retryStudyReport} from './study-report-sync.ts'
import type {StudyIntent} from './study-report-contract.ts'
export function StudyReportRecovery(){
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>studyReports.subscribe(()=>setRevision(n=>n+1)),[])
 let pending:StudyIntent[]=[],issue='';try{pending=studyReports.list()}catch{issue='Saved study delivery needs review. Nothing was sent.'}
 const message=issue||studyReportMessage();if(!pending.length&&!message)return null
 return <section aria-label="Study report recovery" role="status" data-revision={revision} style={{padding:12,border:'1px solid currentColor'}}>
  <p>{message||'A study completion is waiting for confirmation.'}</p>
  {pending.map(p=><div key={p.event.seq}><p>Study day: {p.event.day}</p><button disabled={busy||studyReports.busy()} onClick={()=>{setBusy(true);void retryStudyReport(p).catch(e=>setStudyReportMessage(e instanceof Error?e.message:'Delivery stays saved.')).finally(()=>setBusy(false))}}>Retry study report</button></div>)}
  <button disabled={busy||studyReports.busy()} onClick={()=>window.location.reload()}>Reload current study records</button>
 </section>
}
