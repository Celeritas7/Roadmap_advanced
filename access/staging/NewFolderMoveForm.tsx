import {useEffect,useRef,useState} from 'react'
import {structures,newFolderMoveDraft,saveStructure,retryStructure} from './structure-sync.ts'
import {structureDraft,type StructureIntent} from './structure-contract.ts'
export function NewFolderMoveForm({ids,initialTitle='',onDone,onClose}:{ids:string[];initialTitle?:string;onDone:()=>void;onClose:()=>void}){
 const [title,setTitle]=useState(initialTitle),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [request,setRequest]=useState<{id:string;draft:string}|null>(null),sending=useRef(false)
 useEffect(()=>structures.subscribe(()=>setRevision(v=>v+1)),[])
 const confirmed=structures.confirmation()
 useEffect(()=>{if(request&&confirmed?.requestId===request.id&&JSON.stringify(confirmed.submitted)===request.draft){setRequest(null);setError('');onDone()}},[revision,request,confirmed])
 let pending:StructureIntent|undefined
 try{pending=structures.list().find(p=>p.requestId===request?.id)}catch{}
 const unresolved=!!request&&!pending&&confirmed?.requestId!==request.id,held=!!pending
 const save=async()=>{
  if(sending.current)return
  if(unresolved){setError('This request changed in another tab. Reload current tasks before creating a folder again.');return}
  sending.current=true;setBusy(true);setError('')
  try{
   const draft=newFolderMoveDraft(ids,title),work=held?retryStructure(pending!):saveStructure(draft)
   try{const p=structures.list().find(p=>JSON.stringify(structureDraft(p.payload))===JSON.stringify(draft));if(p)setRequest({id:p.requestId,draft:JSON.stringify(draft)})}catch{}
   await work;setRequest(null);onDone()
  }catch(e){setError(e instanceof Error?e.message:'Move was not confirmed. Your folder name stays here.')}
  finally{sending.current=false;setBusy(false)}
 }
 return <form className="ib-new" aria-label="New folder move draft" onSubmit={e=>{e.preventDefault();void save()}}>
  <input className="ib-input" autoFocus aria-label="New folder name" placeholder="New folder name" value={title} disabled={busy||held||unresolved} onChange={e=>setTitle(e.target.value)}/>
  <button type="submit" className="ns-chip on" disabled={busy||!title.trim()||unresolved}>{held?'Retry folder move':'Create & move'}</button>
  <button type="button" className="ns-chip" disabled={busy} onClick={onClose}>Close folder draft</button>
  {error&&<span role="alert">{error}</span>}
 </form>
}
