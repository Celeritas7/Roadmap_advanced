import {useEffect,useState} from 'react'
import {flushSync} from 'react-dom'
import {preparedHubClient,hubAccounts,subscribeHubQueue} from './hub-account-sync.ts'
import type {SharedIntent,SharedResult,SharedSnapshot} from './shared-writer-contract.ts'
export function SharedWriteRecovery(){
 const [,tick]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const [review,setReview]=useState<{result:SharedResult;latest:SharedSnapshot}|null>(null)
 const [shown,setShown]=useState<SharedSnapshot|null>(null)
 useEffect(()=>{const changed=()=>{setReview(null);setShown(null);setMessage('');tick(n=>n+1)}
  const off=hubAccounts.subscribe(changed),notify=subscribeHubQueue(()=>tick(n=>n+1));window.addEventListener('storage',changed)
  return ()=>{off();notify();window.removeEventListener('storage',changed)}
 },[])
 let rows:SharedIntent[]=[],history:{intent:SharedIntent;resolution:string}[]=[],storageError=''
 try{const writer=preparedHubClient().__hubAccount.shared;rows=writer.list();history=writer.history()}catch(e){if(hubAccounts.context().owner)storageError=e instanceof Error?e.message:'Saved shared history needs review.'}
 if(!rows.length&&!history.length&&!message&&!shown&&!storageError)return null
 async function retry(p:SharedIntent){setBusy(true);setMessage('');setReview(null)
  try{const writer=preparedHubClient().__hubAccount.shared,r=await writer.run(p)
   flushSync(()=>setShown(r.current))
   if(r.status==='conflict'){setReview({result:r,latest:r.current});setMessage('A newer shared value was kept. Compare it with your saved draft before deciding.')}
   else{await writer.acknowledge(r);setMessage('Saved change confirmed. The latest shared value is shown.')}
  }catch(e){setMessage(e instanceof Error?e.message:'Your shared draft remains saved.')}finally{setBusy(false);tick(n=>n+1)}
 }
 async function refresh(){if(!review)return;setBusy(true)
  try{const latest=await preparedHubClient().__hubAccount.shared.read(review.result.target);setShown(latest);setReview({...review,latest})}
  catch(e){setReview(null);setMessage(e instanceof Error?e.message:'Could not read the shared value.')}finally{setBusy(false)}
 }
 async function resolve(reapply:boolean){if(!review)return;setBusy(true)
  try{const next=await preparedHubClient().__hubAccount.shared.resolve(review.result,review.latest,reapply);setReview(null)
   if(next)await retry(next);else setMessage('Latest shared value kept. Your original draft remains in saved history.')
  }catch(e){setMessage(e instanceof Error?e.message:'Your shared draft remains saved.')}finally{setBusy(false);tick(n=>n+1)}
 }
 return <section aria-label="Shared change recovery"><h2>Shared changes</h2><p role="status">{storageError||message}</p>
  <ul>{rows.map(p=><li key={p.requestId}>{p.target.kind==='place'?'Place: '+p.target.id:'Shared document: '+p.target.doc}
   <button disabled={busy} onClick={()=>void retry(p)}>Retry original shared draft</button></li>)}</ul>
  {shown&&<div><h3>Latest shared value</h3><pre aria-label="Latest shared value">{JSON.stringify(shown.record,null,2)}</pre></div>}
  {review&&<div><h3>Your saved draft</h3><pre aria-label="Your saved draft">{JSON.stringify(review.result.change,null,2)}</pre>
   <button disabled={busy} onClick={()=>void refresh()}>Refresh latest value</button>
   <button disabled={busy} onClick={()=>void resolve(true)}>Save draft against reviewed version</button>
   <button disabled={busy} onClick={()=>void resolve(false)}>Keep latest value</button></div>}
  {history.length>0&&<details><summary>Saved draft history ({history.length})</summary><pre>{JSON.stringify(history,null,2)}</pre></details>}
 </section>
}
