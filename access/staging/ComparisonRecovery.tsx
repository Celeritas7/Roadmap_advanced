import {useEffect,useState} from 'react'
import {comparisonEdits,retryComparison,fetchComparisons,normalizeItems,type ComparisonEdit,type ConfirmedComparison} from './compareSync.ts'
import {useStore} from './useStore.ts'
import type {Comparison} from '../types.ts'
export function applyComparisonResult(result:ConfirmedComparison){
 comparisonEdits.assertContext(result.context)
 useStore.setState(s=>({
  comparisons:s.comparisons.map(c=>c.id===result.comparison.id?result.comparison as Comparison:c),
  comparisonItems:[...s.comparisonItems.filter(i=>i.comparison_id!==result.comparison.id),...normalizeItems(result.items)],
 }))
}
export function ComparisonRecovery({comparisonId}:{comparisonId?:string}={}){
 const openId=useStore(s=>s.compareOpen)
 const [revision,setRevision]=useState(0),[message,setMessage]=useState(''),[refreshing,setRefreshing]=useState(false)
 useEffect(()=>comparisonEdits.subscribe(()=>{setRevision(x=>x+1);setMessage('')}),[])
 let pending:ComparisonEdit[]=[];let issue=''
 try{pending=comparisonEdits.list().filter(p=>!comparisonId||p.comparisonId===comparisonId)}catch{issue='Saved comparison changes need review. Nothing was sent.'}
 const busy=refreshing||comparisonEdits.busy()
 const retry=async(p:ComparisonEdit)=>{
  try{applyComparisonResult(await retryComparison(p));setMessage('Comparison save confirmed. Showing the current saved result.')}
  catch(e){setMessage(e instanceof Error?e.message:'Save not confirmed. Your retry stays saved.')}
 }
 const refresh=async()=>{
  setRefreshing(true)
  try{
   const result=await fetchComparisons();comparisonEdits.assertContext(result.context)
   useStore.setState({comparisons:result.comparisons,comparisonItems:result.items})
   setMessage('Current saved comparisons loaded. Review any pending change before trying again.')
  }catch(e){setMessage(e instanceof Error?e.message:'Refresh was not confirmed.')}
  finally{setRefreshing(false)}
 }
 if(openId&&!comparisonId||!pending.length&&!message&&!issue)return null
 return <section aria-label="Comparison recovery" role="status" data-revision={revision} style={{padding:12,border:'1px solid currentColor'}}>
  <p>{issue||message||'A comparison change is waiting for confirmation.'}</p>
  {pending.map(p=><div key={p.requestId}>
   <span>{p.patch.weights?'Comparison weights':'Product choice'} </span>
   <button disabled={busy} onClick={()=>void retry(p)}>Retry comparison change</button>
   <button disabled={busy} onClick={()=>{
    if(window.confirm('Discard this saved retry? Any change already committed on the server stays saved.')){
     try{comparisonEdits.discard(p);void refresh()}catch(e){setMessage(e instanceof Error?e.message:'Retry remains saved.')}
    }
   }}>Discard comparison retry</button>
  </div>)}
  <button disabled={busy} onClick={()=>void refresh()}>Refresh comparisons</button>
 </section>
}
