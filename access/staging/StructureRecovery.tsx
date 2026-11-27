import {useEffect,useState} from 'react'
import {useStore} from './useStore.ts'
import {structures,retryStructure,discardStructure,structureMessage,setStructureMessage} from './structure-sync.ts'
import type {StructureIntent} from './structure-contract.ts'
export function StructureRecovery(){
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false),tree=useStore(s=>s.tree)
 useEffect(()=>structures.subscribe(()=>setRevision(v=>v+1)),[])
 let pending:StructureIntent[]=[],issue=''
 try{pending=structures.list()}catch{issue='Saved tree change needs review. No new request was sent.'}
 const message=issue||structureMessage()
 if(!pending.length&&!message)return null
 const title=(id:string|null|undefined)=>id?tree.find(t=>t.id===id)?.title??'Folder no longer loaded':'Main list'
 return <section aria-label="Tree change recovery" role="status" data-revision={revision} style={{padding:12,border:'1px solid currentColor'}}>
  <p>{message||'A tree change is waiting for review. Original details stay saved.'}</p>
  {pending.map(p=><div key={p.requestId}>
   <p>{p.payload.kind==='delete'?`Delete ${p.payload.tasks.length} tasks and folders. Study history is retained; linked resources are removed from the task view.`:'Move tasks together in one save.'}</p>
   {p.payload.folder&&<p>New folder: {p.payload.folder.title}</p>}
   <ul>{p.payload.tasks.map(t=><li key={t.id}>{t.label}{p.payload.kind==='move'?' → '+(t.parent_id===p.payload.folder?.id?p.payload.folder?.title:title(t.parent_id))+' (position '+(t.position!+1)+')':''}</li>)}</ul>
   <p>{p.attempted?'A previous attempt may already be saved. Retry checks the same request; discarding does not undo it.':p.payload.kind==='delete'?'Nothing is deleted until you confirm. Cancel keeps all tasks.':'The move has not been sent.'}</p>
   <button disabled={busy||structures.busy()} onClick={()=>{setBusy(true);void retryStructure(p).catch(e=>setStructureMessage(e instanceof Error?e.message:'Change was not confirmed.')).finally(()=>setBusy(false))}}>
    {p.payload.kind==='delete'&&!p.attempted?'Confirm deletion':'Retry tree change'}
   </button>
   <button disabled={busy||structures.busy()} onClick={()=>{
    if(!p.attempted||window.confirm('Discard this retry? A committed server change is not undone. Reload before further writes.'))try{discardStructure(p)}catch(e){setStructureMessage(e instanceof Error?e.message:'Request stays saved.')}
   }}>{p.attempted?'Discard tree retry':'Cancel deletion'}</button>
  </div>)}
  <button disabled={busy||structures.busy()} onClick={()=>window.location.reload()}>Reload current tree</button>
 </section>
}
