import {useEffect,useState} from 'react'
import {taskEdits,retryTaskEdits,discardTaskEdits,taskEditMessage,setTaskEditMessage} from './task-edit-sync.ts'
import type {EditIntent} from './task-edit-contract.ts'
export function TaskEditRecovery(){
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>taskEdits.subscribe(()=>setRevision(v=>v+1)),[])
 let pending:EditIntent[]=[],issue=''
 try{pending=taskEdits.list()}catch{issue='Saved task edits need review. No request was sent.'}
 const message=issue||taskEditMessage()
 if(!pending.length&&!message)return null
 return <section aria-label="Task edit recovery" role="status" data-revision={revision} style={{padding:12,border:'1px solid currentColor'}}>
  <p>{message||'Task edits are waiting for confirmation. Showing the last confirmed tasks.'}</p>
  {pending.map(p=><div key={p.requestId}>
   <details><summary>{p.tasks.length} saved task edits</summary>{p.tasks.map(t=><pre key={t.id} style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(t.patch)}</pre>)}</details>
   <button disabled={busy||taskEdits.busy()} onClick={()=>{setBusy(true);void retryTaskEdits(p).catch(e=>setTaskEditMessage(e instanceof Error?e.message:'Save was not confirmed.')).finally(()=>setBusy(false))}}>Retry task edits</button>
   <button disabled={busy||taskEdits.busy()} onClick={()=>{
    if(window.confirm('Discard these saved task edits? A change already committed on the server is not undone.')){
     try{discardTaskEdits(p)}catch(e){setTaskEditMessage(e instanceof Error?e.message:'Edits stay saved.')}
    }
   }}>Discard task edits</button>
  </div>)}
  <button disabled={busy||taskEdits.busy()} onClick={()=>window.location.reload()}>Reload current tasks</button>
 </section>
}
