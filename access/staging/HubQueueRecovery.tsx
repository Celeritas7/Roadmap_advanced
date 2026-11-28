import {useEffect,useState} from 'react'
import {hubAccounts,hubQueueView,refreshHubQueue,retryHubQueue,subscribeHubQueue} from './hub-account-sync.ts'
export function HubQueueRecovery(){
 const [,update]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>{const unsub=subscribeHubQueue(()=>update(x=>x+1)),unaccount=hubAccounts.subscribe(()=>{void refreshHubQueue()});void refreshHubQueue();return ()=>{unsub();unaccount()}},[])
 const {rows,message}=hubQueueView()
 if(!rows.length&&!message)return null
 return <section aria-label="Hub queue recovery"><h2>Hub queue recovery</h2>
  <p role="status">{message}</p><p>Only this account’s saved requests appear here. Sent means the hub received it; target application is a separate confirmation.</p>
  <ul>{rows.map(r=><li key={r.identity}>{r.effect.kind}: {r.state}. {r.receipt&&('Hub status: '+r.receipt.status+'.')} {r.reason}</li>)}</ul>
  <button disabled={busy} onClick={()=>{setBusy(true);void retryHubQueue().finally(()=>setBusy(false))}}>Retry saved hub requests</button>
  <button disabled={busy} onClick={()=>void refreshHubQueue()}>Refresh hub queue</button>
  <p>Contract blocks require review. Legacy queues are preserved and are not assigned to the current account.</p>
 </section>
}
