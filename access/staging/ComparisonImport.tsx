import {assertNoPendingStructure} from './task-write-activity.ts'
import {useEffect,useState} from 'react'
import {comparisonImports,comparisonEdits,previewComparisonImport,retryComparisonImport} from './compareSync.ts'
import {normalizeImport,importItemFields,type ImportDocument,type ImportIntent,type ImportState} from './comparison-import-contract.ts'
import {applyComparisonResult} from './ComparisonRecovery.tsx'
import {useStore} from './useStore.ts'
export function ComparisonImport({comparisonId}:{comparisonId?:string}={}){
 const open=useStore(s=>s.compareOpen)
 const [draft,setDraft]=useState(''),[review,setReview]=useState<{state:ImportState;document:ImportDocument}|null>(null)
 const [version,setVersion]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[clearChoice,setClearChoice]=useState(false)
 useEffect(()=>comparisonImports.subscribe(()=>setVersion(v=>v+1)),[])
 let pending:ImportIntent[]=[],issue=''
 try{pending=comparisonImports.list().filter(p=>!comparisonId||p.comparisonId===comparisonId)}catch{issue='Saved import needs review. Nothing was sent.'}
 const waiting=busy||comparisonImports.busy()||comparisonEdits.busy()
 const report=(e:unknown)=>setMessage(e instanceof Error?e.message:'Import was not confirmed. Your retry stays saved.')
 async function preview(seed=false){
  if(!comparisonId)return
  setBusy(true);setReview(null)
  try{
   const state=await previewComparisonImport(comparisonId)
   if(seed){
    const c=state.comparison
    const data={title:c.title,need:c.need,source:c.source,notes:c.notes,items:state.items.map(i=>Object.fromEntries(importItemFields.filter(k=>Object.hasOwn(i,k)).map(k=>[k,i[k]])))}
    setDraft(JSON.stringify(data,null,2));setMessage('Current study loaded. Edit or paste the products, then preview your replacement.')
   }else{
    const document=normalizeImport({...JSON.parse(draft),clear_missing_choice:clearChoice})
    if(state.comparison.chosen_item&&!document.items.some(i=>i.id===state.comparison.chosen_item)&&!clearChoice)
     throw Error('This removes your chosen product. Review the choice-clearing option first.')
    setReview({state,document});setMessage('Review the before and proposed products. No save has been sent.')
   }
  }catch(e){report(e)}finally{setBusy(false)}
 }
 async function retry(p:ImportIntent){
  setBusy(true)
  try{const result=await retryComparisonImport(p);comparisonImports.assertContext(result.context);applyComparisonResult(result)
   setDraft('');setReview(null);setMessage('Import confirmed. Showing the current saved study.')
  }catch(e){report(e)}finally{setBusy(false)}
 }
 async function confirm(){
  if(!review||!comparisonId)return
  try{
   assertNoPendingStructure();comparisonImports.assertContext(review.state.context)
   if(comparisonEdits.list().some(p=>p.comparisonId===comparisonId))throw Error('Review the pending preference change first.')
   const p=comparisonImports.prepare({comparisonId,taskId:review.state.comparison.task_id as string|null,
    expectedRevision:review.state.revision,document:review.document})
   await retry(p)
  }catch(e){report(e)}
 }
 if(open&&!comparisonId||!comparisonId&&!pending.length&&!issue&&!message)return null
 return <section aria-label="Comparison import" data-version={version} style={{padding:12,border:'1px solid currentColor'}}>
  {(message||issue)&&<p role="status">{issue||message}</p>}
  {pending.map(p=><div key={p.requestId}>
   <p>Saved import: {p.document.title}. Its original target and revision are retained.</p>
   <button disabled={waiting} onClick={()=>void retry(p)}>Retry saved import</button>
   <button disabled={waiting} onClick={()=>{
    if(window.confirm('Discard this saved retry? An import already committed on the server stays saved.')){
     try{comparisonImports.discard(p);if(comparisonId){setDraft(JSON.stringify(p.document,null,2));setClearChoice(!!p.document.clear_missing_choice)}setReview(null);setMessage('Retry discarded. Review current data before preparing another import.')}catch(e){report(e)}
    }
   }}>Discard import retry</button>
  </div>)}
  {comparisonId&&!pending.length&&!issue&&<details>
   <summary>Review a comparison import</summary>
   <p>Use existing product IDs to keep their notes and choice. Omitted products leave the active study; history is retained. Weights are kept.</p>
   <button disabled={waiting} onClick={()=>void preview(true)}>Load current study JSON</button>
   <label>Comparison JSON<textarea aria-label="Comparison JSON" value={draft} rows={8} style={{display:'block',width:'100%'}} disabled={waiting}
    onChange={e=>{setDraft(e.target.value);setReview(null)}} /></label>
   <label><input type="checkbox" checked={clearChoice} disabled={waiting} onChange={e=>{setClearChoice(e.target.checked);setReview(null)}} />Allow clearing my choice if that product is removed</label>
   <button disabled={waiting||!draft} onClick={()=>void preview()}>Preview replacement</button>
   {review&&<div>
    <p>Saved products: {review.state.items.length}. Proposed products: {review.document.items.length}.</p>
    <details><summary>Before import</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify({comparison:review.state.comparison,items:review.state.items},null,2)}</pre></details>
    <details><summary>Proposed import</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(review.document,null,2)}</pre></details>
    <button disabled={waiting} onClick={()=>void confirm()}>Confirm import</button>
   </div>}
  </details>}
 </section>
}
