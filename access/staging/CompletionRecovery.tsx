import {useEffect,useState} from 'react'
import {completions,completionMessage,setCompletionMessage,retryCompletion,pollCompletionReplies} from './completion-sync.ts'
import type {CompletionIntent} from './completion-contract.ts'
export function CompletionRecovery(){
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>completions.subscribe(()=>setRevision(n=>n+1)),[])
 let pending:CompletionIntent[]=[],issue=''
 try{pending=completions.list()}catch{issue='Saved completion needs review. Nothing was sent.'}
 const message=issue||completionMessage()
 const run=(fn:()=>Promise<void>)=>{setBusy(true);void fn().catch(e=>setCompletionMessage(e instanceof Error?e.message:'Original completion stays saved.')).finally(()=>setBusy(false))}
 return <section aria-label="Completion recovery" role="status" data-revision={revision} style={{padding:12,border:'1px solid currentColor'}}>
  {(message||pending.length>0)&&<p>{message||'A completion is waiting. The original request stays saved.'}</p>}
  {pending.map(p=><div key={p.taskId}>
   <p>Task completion awaiting confirmation{p.blocked?' · Hub contract requires review ('+p.blocked+')':''}</p>
   <button disabled={busy||completions.busy()} onClick={()=>run(()=>retryCompletion(p,!p.blocked))}>{p.blocked?'Check saved reply':'Retry completion'}</button>
  </div>)}
  <button disabled={busy||completions.busy()} onClick={()=>run(pollCompletionReplies)}>Check completion replies</button>
 </section>
}
