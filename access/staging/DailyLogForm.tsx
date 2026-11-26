import {useEffect,useMemo,useRef,useState} from 'react'
import {useStore} from './useStore.ts'
import {CONTEXTS} from '../seed.ts'
import {dailyLogs,retryDailyLog} from './daily-log-sync.ts'
import type {LogIntent} from './daily-log-contract.ts'
export function DailyLogForm({today}:{today:string}){
 const addLog=useStore(s=>s.addLog),tree=useStore(s=>s.tree)
 const tasks=useMemo(()=>tree.filter(t=>t.kind==='task'),[tree])
 const [draftStarted,setDraftStarted]=useState(false)
 const [open,setOpen]=useState(false),[taskId,setTaskId]=useState(''),[context,setContext]=useState('')
 const [duration,setDuration]=useState(''),[notes,setNotes]=useState(''),[date,setDate]=useState(today)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[request,setRequest]=useState<string|null>(null),[revision,setRevision]=useState(0)
 const sending=useRef(false)
 useEffect(()=>dailyLogs.subscribe(()=>setRevision(v=>v+1)),[])
 const reset=()=>{setTaskId('');setContext('');setDuration('');setNotes('');setRequest(null);setError('');setOpen(false);setDraftStarted(false)}
 useEffect(()=>{if(request&&dailyLogs.confirmation()?.requestId===request)reset()},[revision,request])
 let pending:LogIntent|undefined
 try{pending=dailyLogs.list()[0]}catch{/* Recovery preserves malformed storage for review. */}
 const held=!!pending&&pending.requestId===request
 const start=()=>{
  setError('')
  if(pending){const p=pending.entry;setTaskId(p.task_id??'');setContext(p.context??'');setDuration(String(p.duration_minutes));setNotes(p.notes??'');setDate(p.log_date);setRequest(pending.requestId)}
  else {if(!draftStarted)setDate(today);setRequest(null)}
  setDraftStarted(true);setOpen(true)
 }
 const commit=async()=>{
  if(sending.current)return
  const mins=Number(duration)
  if(!Number.isInteger(mins)||mins<1||mins>1440){setError('Enter a whole-number duration from 1 to 1440 minutes.');return}
  sending.current=true;setBusy(true);setError('')
  try{
   const work=held?retryDailyLog(pending!):addLog({task_id:taskId||null,context:context||null,duration_minutes:mins,notes:notes.trim()||null,log_date:date})
   try{const saved=dailyLogs.list()[0];if(saved)setRequest(saved.requestId)}catch{}
   await work;reset()
  }catch(e){setError(e instanceof Error?e.message:'Log was not confirmed. Your draft stays here.')}
  finally{sending.current=false;setBusy(false)}
 }
 if(!open)return <button type="button" className="logaddbtn" onClick={start}>+ log something</button>
 const waiting=busy||dailyLogs.busy()
 return <div className="logdraft" aria-label="Daily log draft" onKeyDown={e=>{if(e.key==='Escape'&&!waiting){e.preventDefault();setOpen(false)}}}>
  <span style={{flexBasis:'100%'}}>Log date: {date}</span>
  <select autoFocus className="logtask" aria-label="Task" disabled={waiting||held} value={taskId} onChange={e=>setTaskId(e.target.value)}>
   <option value="">General (no task)</option>
   {taskId&&!tasks.some(t=>t.id===taskId)&&<option value={taskId}>Original task (not currently loaded)</option>}
   {tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
  </select>
  <select className="logctx" aria-label="Context" disabled={waiting||held} value={context} onChange={e=>setContext(e.target.value)}>
   <option value="">— context —</option>
   {context&&!CONTEXTS.some(c=>c.id===context)&&<option value={context}>{context}</option>}
   {CONTEXTS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
  </select>
  <input className="logdur" type="number" min="1" max="1440" step="1" inputMode="numeric" placeholder="min" aria-label="Duration in minutes" disabled={waiting||held} value={duration} onChange={e=>setDuration(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void commit()}}}/>
  <input className="lognotes" type="text" placeholder="notes (optional)" aria-label="Notes" disabled={waiting||held} value={notes} onChange={e=>setNotes(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void commit()}}}/>
  <button type="button" className="logcommit" disabled={waiting} onClick={()=>void commit()}>{held?'Retry this log':'Log'}</button>
  <button type="button" className="logcancel" disabled={waiting} onClick={()=>setOpen(false)}>Close draft</button>
  {error&&<p role="status" style={{flexBasis:'100%'}}>{error}</p>}
 </div>
}
