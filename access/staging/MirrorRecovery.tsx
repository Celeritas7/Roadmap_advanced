import {useEffect,useState} from 'react'
import {mirrors,mirrorMessage,setMirrorMessage,retryMirror} from './mirror-sync.ts'
import type {MirrorIntent} from './mirror-contract.ts'
export function MirrorRecovery(){
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>mirrors.subscribe(()=>setRevision(n=>n+1)),[])
 let pending:MirrorIntent[]=[],issue=''
 try{pending=mirrors.list()}catch{issue='Saved mirror delivery needs review. Nothing was sent.'}
 const message=issue||mirrorMessage();if(!pending.length&&!message)return null
 return <section aria-label="Mirror delivery recovery" role="status" data-revision={revision} style={{padding:12,border:'1px solid currentColor'}}>
  <p>{message||'A mirror delivery is waiting for confirmation. Its original details stay saved.'}</p>
  {pending.map(p=><div key={p.event.seq}><p>{String(p.event.payload.title??p.event.payload.t??'Removed source task')}</p>
   <button disabled={busy||mirrors.busy()} onClick={()=>{setBusy(true);void retryMirror(p).catch(e=>setMirrorMessage(e instanceof Error?e.message:'Delivery stays saved.')).finally(()=>setBusy(false))}}>Retry mirror delivery</button>
  </div>)}
  <button disabled={busy||mirrors.busy()} onClick={()=>window.location.reload()}>Reload current tasks</button>
 </section>
}
