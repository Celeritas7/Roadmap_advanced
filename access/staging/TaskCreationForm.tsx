import {useEffect,useRef,useState} from 'react'
import {useStore} from './useStore.ts'
import {taskCreations,saveTaskCreation,taskDraft,captureDraft,retryTaskCreation} from './task-creation-sync.ts'
import {creationDraft,normalizeCreation,type CreationDraft,type CreationIntent} from './task-creation-contract.ts'
function useCreationForm(draft:CreationDraft,clear:()=>void){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [request,setRequest]=useState<{id:string;draft:string}|null>(null),sending=useRef(false)
 useEffect(()=>taskCreations.subscribe(()=>setRevision(v=>v+1)),[])
 const confirmed=taskCreations.confirmation()
 useEffect(()=>{
  if(request&&confirmed?.requestId===request.id&&JSON.stringify(confirmed.submitted)===request.draft){setRequest(null);setError('');clear()}
 },[revision,request,confirmed])
 let pending:CreationIntent|undefined
 try{pending=taskCreations.list().find(p=>p.requestId===request?.id)}catch{/* Recovery keeps malformed saved work intact. */}
 const held=!!pending&&pending.requestId===request?.id&&JSON.stringify(creationDraft(pending.payload))===request.draft
 const unresolved=!!request&&!held&&confirmed?.requestId!==request.id
 const save=async()=>{
  if(sending.current)return
  if(unresolved){setError('This request changed in another tab. Reload current tasks before creating it again.');return}
  sending.current=true;setBusy(true);setError('')
  try{
   const input=normalizeCreation(draft),work=held?retryTaskCreation(pending!):saveTaskCreation(input)
   try{const p=taskCreations.list().find(p=>JSON.stringify(creationDraft(p.payload))===JSON.stringify(input));if(p)setRequest({id:p.requestId,draft:JSON.stringify(input)})}catch{}
   await work;setRequest(null);clear()
  }catch(e){setError(e instanceof Error?e.message:'Creation was not confirmed. Your draft stays here.')}
  finally{sending.current=false;setBusy(false)}
 }
 return {save,busy:busy||taskCreations.busy(),locked:held||unresolved,error,held}
}
export function TaskCreationForm({parentId}:{parentId:string}){
 const [open,setOpen]=useState(false),[title,setTitle]=useState('')
 const form=useCreationForm(taskDraft(parentId,title),()=>{setTitle('');setOpen(false)})
 if(!open)return <div className="addrow"><button type="button" className="addbtn" onClick={()=>setOpen(true)}>+ add task</button></div>
 return <div className="addrow" aria-label="New task draft">
  <input autoFocus className="addinput" aria-label="New task name" value={title} disabled={form.busy||form.locked} onChange={e=>setTitle(e.target.value)}
   onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void form.save()}else if(e.key==='Escape'&&!form.busy)setOpen(false)}}/>
  <button type="button" disabled={form.busy} onClick={()=>void form.save()}>{form.held?'Retry new task':'Add task'}</button>
  <button type="button" disabled={form.busy} onClick={()=>setOpen(false)}>Close task draft</button>
  {form.error&&<span role="status">{form.error}</span>}
 </div>
}
export function CaptureCreationForm(){
 const open=useStore(s=>s.captureOpen),setOpen=useStore(s=>s.setCaptureOpen),openCaptured=useStore(s=>s.openCaptured)
 const [text,setText]=useState(''),draft=captureDraft(text)
 const form=useCreationForm(draft,()=>setText(''))
 const confirmed=taskCreations.confirmation(),captured=confirmed?.submitted.kind==='capture'?confirmed.submitted.items:[]
 if(!open)return null
 return <div className="cap-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!form.busy)setOpen(false)}}>
  <div className="cap-sheet" role="dialog" aria-modal="true" aria-label="Quick capture">
   <form className="cap-row" onSubmit={e=>{e.preventDefault();void form.save()}}>
    <input autoFocus className="cap-input" aria-label="Capture a task" autoComplete="off" value={text} disabled={form.busy||form.locked}
     onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'&&!form.busy)setOpen(false)}}/>
    <button className="ns-chip on" type="submit" disabled={form.busy||!draft.items.length}>{form.held?'Retry capture':draft.items.length>1?'Add '+draft.items.length:'Add'}</button>
    <button className="ns-chip" type="button" disabled={form.busy} onClick={()=>setOpen(false)}>Done</button>
   </form>
   <p className="cap-preview">Capture up to 32 items together. Separate items with commas or new lines; ! marks high priority.</p>
   {draft.items.length>0&&<ul>{draft.items.map((item,i)=><li key={i}>{item.title} → Inbox › {item.folder}</li>)}</ul>}
   {form.error&&<p className="cap-error" role="alert">{form.error}</p>}
   {captured.length>0&&<p role="status">Confirmed {captured.length} captured item{captured.length===1?'':'s'}. <button type="button" onClick={openCaptured}>See in Inbox</button></p>}
   <p>Close keeps this draft here. A Save attempt keeps its retry across reloads. Review saved tasks in Inbox before deleting them.</p>
  </div>
 </div>
}
