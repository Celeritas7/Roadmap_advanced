import {useEffect,useState} from 'react'
import {suggestionAnswers,suggestionMessage,setSuggestionMessage,retrySuggestionAnswer} from './suggestion-sync.ts'
import type {AnswerIntent} from './suggestion-contract.ts'
export function SuggestionRecovery(){
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>suggestionAnswers.subscribe(()=>setRevision(n=>n+1)),[])
 let pending:AnswerIntent[]=[],issue=''
 try{pending=suggestionAnswers.list()}catch{issue='Saved suggestion answer needs review. No request was sent.'}
 const message=issue||suggestionMessage();if(!pending.length&&!message)return null
 return <section aria-label="Suggestion answer recovery" role="status" data-revision={revision} style={{padding:12,border:'1px solid currentColor'}}>
  <p>{message||'A suggestion answer is waiting for confirmation. Its original details stay saved.'}</p>
  {pending.map(p=><div key={p.requestId}>
   <p>{p.payload.action} · {p.payload.suggestion_id}{p.payload.reason?' · '+p.payload.reason:''}</p>
   {p.blocked?<p>Hub delivery requires review ({p.blocked}). The original answer is retained.</p>:<button disabled={busy||suggestionAnswers.busy()} onClick={()=>{
    setBusy(true);void retrySuggestionAnswer(p).catch(e=>setSuggestionMessage(e instanceof Error?e.message:'Answer stays saved.')).finally(()=>setBusy(false))
   }}>Retry suggestion answer</button>}
  </div>)}
  <button disabled={busy||suggestionAnswers.busy()} onClick={()=>window.location.reload()}>Reload current suggestions</button>
 </section>
}
