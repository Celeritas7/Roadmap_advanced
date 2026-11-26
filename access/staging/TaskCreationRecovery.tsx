import {useEffect,useState} from 'react'
import {taskCreations,retryTaskCreation,discardTaskCreation,taskCreationMessage,setTaskCreationMessage} from './task-creation-sync.ts'
import type {CreationIntent} from './task-creation-contract.ts'
export function TaskCreationRecovery(){
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>taskCreations.subscribe(()=>setRevision(v=>v+1)),[])
 let pending:CreationIntent[]=[],issue=''
 try{pending=taskCreations.list()}catch{issue='Saved task creation needs review. No request was sent.'}
 const message=issue||taskCreationMessage()
 if(!pending.length&&!message)return null
 return <section aria-label="Task creation recovery" role="status" data-revision={revision} style={{padding:12,border:'1px solid currentColor'}}>
  <p>{message||'Task creation is waiting for confirmation. Its original details stay saved.'}</p>
  {pending.map(p=><div key={p.requestId}>
   {p.payload.kind==='capture'&&<p style={{whiteSpace:'pre-wrap'}}>{p.payload.text}</p>}
   <ul>{p.payload.items.map(t=><li key={t.id}>{t.title}{t.folder?' → '+t.folder:''}</li>)}</ul>
   <button disabled={busy||taskCreations.busy()} onClick={()=>{setBusy(true);void retryTaskCreation(p).catch(e=>setTaskCreationMessage(e instanceof Error?e.message:'Creation was not confirmed.')).finally(()=>setBusy(false))}}>Retry task creation</button>
   <button disabled={busy||taskCreations.busy()} onClick={()=>{
    if(window.confirm('Discard this creation retry? Tasks already committed on the server are not removed.'))try{discardTaskCreation(p)}catch(e){setTaskCreationMessage(e instanceof Error?e.message:'Creation stays saved.')}
   }}>Discard creation retry</button>
  </div>)}
  <button disabled={busy||taskCreations.busy()} onClick={()=>window.location.reload()}>Reload current tasks</button>
 </section>
}
