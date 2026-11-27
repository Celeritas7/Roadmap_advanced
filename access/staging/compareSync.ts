import {assertNoPendingStructure,structureWriteVersion} from './task-write-activity.ts'
import {createComparisonImports,type ImportIntent} from './comparison-import-contract.ts'
import {supabase} from '../lib/supabase.ts'
import type {Comparison,ComparisonItem} from '../types.ts'
import {createComparisonEdits,comparisonSnapshot,type ComparisonPatch,type ComparisonEdit,type ConfirmedComparison} from './comparison-contract.ts'
export type {ComparisonEdit,ConfirmedComparison}
export const comparisonEdits=createComparisonEdits({client:supabase,storage:localStorage,requestId:()=>crypto.randomUUID()})
export const comparisonImports=createComparisonImports({client:supabase,storage:localStorage,requestId:()=>crypto.randomUUID()})
let generation=0,locked=false,seen=false,previous:string|null=null
supabase.auth.onAuthStateChange((_event,session)=>{
 const next=session?.user.id??null
 if(seen&&next!==previous)locked=true
 if(next!==previous)generation++
 comparisonEdits.bind(next);comparisonImports.bind(next);previous=next;seen=true
})
window.addEventListener('storage',()=>{generation++;comparisonEdits.notify();comparisonImports.notify()})
comparisonImports.subscribe(()=>{generation++;comparisonEdits.notify()})
function unlocked(){if(locked)throw Error('Reload safely to continue with the current account.')}
const num=(v:unknown)=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
export const normalizeItems=(rows:Record<string,unknown>[])=>rows.map(r=>({...r,
 price:num(r.price),quality:num(r.quality),life_years:num(r.life_years),warranty_months:num(r.warranty_months),
 rating:num(r.rating),review_count:num(r.review_count),pros:r.pros??[],cons:r.cons??[],extra:r.extra??{},
})) as ComparisonItem[]
export async function fetchComparisons(){
 unlocked();const actor=comparisonEdits.context();comparisonEdits.assertContext(actor)
 if(comparisonEdits.busy()||comparisonImports.busy())throw Error('Wait for the current comparison save before refreshing.')
 const current=++generation,revision=structureWriteVersion()
 // One PostgREST statement keeps comparisons and products in the same snapshot.
 const {data,error}=await supabase.from('roadmap_comparisons')
  .select('*,items:roadmap_comparison_items!roadmap_comparison_items_comparison_id_fkey(*)')
  .eq('user_id',actor.owner!).order('updated_at',{ascending:false})
 unlocked();comparisonEdits.assertContext(actor)
 if(revision!==structureWriteVersion()||current!==generation||comparisonEdits.busy()||comparisonImports.busy())throw Error('A newer comparison request is in progress.')
 if(error)throw error
 if(!Array.isArray(data))throw Error('Comparison refresh was not confirmed.')
 const snapshots=data.map(row=>comparisonSnapshot(row,row.items,actor.owner!))
 return {context:actor,comparisons:snapshots.map(s=>{const {items:_,...row}=s.comparison;return row}) as Comparison[],
  items:normalizeItems(snapshots.flatMap(s=>s.items))}
}
export async function retryComparison(p:ComparisonEdit):Promise<ConfirmedComparison>{
 unlocked();assertNoPendingStructure();if(comparisonImports.list().some(i=>i.comparisonId===p.comparisonId))throw Error('Review the pending import first.')
 generation++
 try{return await comparisonEdits.run(p)}finally{generation++}
}
export async function editComparison(comparison:Comparison,patch:ComparisonPatch){
 unlocked();assertNoPendingStructure();if(comparisonImports.list().some(i=>i.comparisonId===comparison.id))throw Error('Review the pending import first.')
 return retryComparison(comparisonEdits.prepare(comparison.id,comparison.updated_at,patch))
}

export async function previewComparisonImport(id:string){
 unlocked();if(comparisonEdits.busy()||comparisonImports.busy())throw Error('Wait for the current comparison save.')
 const current=++generation,result=await comparisonImports.preview(id)
 unlocked();if(current!==generation)throw Error('A newer comparison action is in progress. Review again.')
 return result
}
export async function retryComparisonImport(p:ImportIntent){
 unlocked();assertNoPendingStructure();if(comparisonEdits.list().some(i=>i.comparisonId===p.comparisonId))throw Error('Review the pending preference change first.')
 generation++
 try{return await comparisonImports.run(p)}finally{generation++}
}
