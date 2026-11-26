import type {RpcClient} from './session-contract.ts'
export type ComparisonPatch={weights?:Record<string,number>;chosen_item?:string|null}
export type ComparisonEdit={version:1;owner:string;comparisonId:string;requestId:string;expectedUpdatedAt:string;patch:ComparisonPatch}
export type ActorContext={owner:string|null;epoch:number}
export type ComparisonSnapshot={comparison:Record<string,unknown>;items:Record<string,unknown>[]}
export type ConfirmedComparison=ComparisonSnapshot & {context:ActorContext;requestId:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid=(v:unknown):v is string=>typeof v==='string'&&uuid.test(v)
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const stamp=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
const prefix='rm-comparison-edit-v1:'
export function normalizePatch(value:unknown):ComparisonPatch {
 if(!object(value)||!Object.keys(value).length||Object.keys(value).some(k=>!['weights','chosen_item'].includes(k)))
  throw Error('Invalid comparison changes.')
 const result:ComparisonPatch={}
 if(Object.hasOwn(value,'weights')){
  const weights=value.weights
  if(!object(weights)||Object.keys(weights).length>64||Object.entries(weights).some(([k,v])=>
   !k.length||k.length>64||typeof v!=='number'||!Number.isInteger(v)||v<0||v>3))throw Error('Invalid comparison weights.')
  result.weights=Object.fromEntries(Object.entries(weights).sort(([a],[b])=>a.localeCompare(b))) as Record<string,number>
 }
 if(Object.hasOwn(value,'chosen_item')){
  if(value.chosen_item!==null&&(typeof value.chosen_item!=='string'||!uuid.test(value.chosen_item)))throw Error('Invalid product choice.')
  result.chosen_item=value.chosen_item as string|null
 }
 if(new TextEncoder().encode(JSON.stringify(result)).length>8192)throw Error('Comparison changes are too large.')
 return result
}
export function comparisonSnapshot(comparison:unknown,items:unknown,owner:string):ComparisonSnapshot {
 if(!object(comparison)||!isUuid(comparison.id)||typeof comparison.title!=='string'||
  !stamp(comparison.updated_at)||!object(comparison.weights)||!Array.isArray(items)||
  comparison.user_id!==undefined&&comparison.user_id!==owner)throw Error('Comparison result was not confirmed.')
 const ids=new Set<string>()
 for(const item of items){
  if(!object(item)||!isUuid(item.id)||item.comparison_id!==comparison.id||
   typeof item.name!=='string'||ids.has(item.id as string)||item.user_id!==undefined&&item.user_id!==owner)
   throw Error('Comparison products were not confirmed.')
  ids.add(item.id as string)
 }
 if(comparison.chosen_item!==null&&(!isUuid(comparison.chosen_item)||!ids.has(comparison.chosen_item)))
  throw Error('Product choice was not confirmed.')
 return {comparison,items}
}
export function createComparisonEdits({client,storage,requestId}:{
 client:RpcClient;storage:Storage;requestId:()=>string;
}){
 let owner:string|null=null,epoch=0
 const listeners=new Set<()=>void>(),running=new Map<string,Promise<ConfirmedComparison>>()
 const notify=()=>{for(const listener of listeners)listener()}
 const context=():ActorContext=>({owner,epoch})
 function assertContext(c:ActorContext){if(!owner||c.owner!==owner||c.epoch!==epoch)throw Error('Account changed. The original comparison retry stays saved.')}
 const key=(p:ComparisonEdit)=>prefix+p.owner+':'+p.comparisonId
 const parse=(raw:string):ComparisonEdit=>{
  if(raw.length>12000)throw Error('Saved comparison changes need review.')
  const p=JSON.parse(raw) as ComparisonEdit
  if(p?.version!==1||!isUuid(p.owner)||!isUuid(p.comparisonId)||!isUuid(p.requestId)||!stamp(p.expectedUpdatedAt))
   throw Error('Saved comparison changes need review.')
  return {...p,patch:normalizePatch(p.patch)}
 }
 const check=(p:ComparisonEdit)=>{assertContext({owner:p.owner,epoch});parse(JSON.stringify(p))}
 const list=()=>{
  if(!owner)return []
  const result:ComparisonEdit[]=[]
  for(let i=0;i<storage.length;i++){
   const name=storage.key(i);if(!name?.startsWith(prefix+owner+':'))continue
   const raw=storage.getItem(name);if(!raw)continue
   const p=parse(raw);check(p);if(key(p)!==name)throw Error('Saved comparison owner/key mismatch.')
   result.push(p)
  }
  return result
 }
 function prepare(comparisonId:string,expectedUpdatedAt:string,patch:ComparisonPatch){
  if(!owner)throw Error('Sign in before editing a comparison.')
  const p:ComparisonEdit={version:1,owner,comparisonId,requestId:requestId(),expectedUpdatedAt,patch:normalizePatch(patch)}
  check(p)
  const raw=storage.getItem(key(p))
  if(raw){
   const prior=parse(raw);check(prior)
   if(key(prior)!==key(p)||prior.expectedUpdatedAt!==p.expectedUpdatedAt||!same(prior.patch,p.patch))
    throw Error('A comparison change is already waiting. Retry it or review and discard it first.')
   return prior
  }
  storage.setItem(key(p),JSON.stringify(p));notify();return p
 }
 function run(p:ComparisonEdit):Promise<ConfirmedComparison>{
  try{check(p)}catch(e){return Promise.reject(e)}
  const name=key(p),pending=running.get(name);if(pending)return pending
  const actor=context()
  const work=(async()=>{
   const raw=storage.getItem(name)
   if(!raw||!same(parse(raw),p))throw Error('Saved comparison changes changed. Review before retrying.')
   const {data,error}=await client.rpc('ga_roadmap_edit_comparison',{
    p_comparison_id:p.comparisonId,p_expected_updated_at:p.expectedUpdatedAt,p_patch:p.patch,p_request_id:p.requestId,
   })
   assertContext(actor)
   if(error){
    if(error.code==='40001')throw Error('This comparison changed elsewhere. Refresh to review it; your proposed change stays saved.')
    if(error.code==='42501')throw Error('Access denied or saving paused. Your comparison retry stays saved.')
    throw Error('Comparison save was not confirmed. Your retry stays saved.')
   }
   if(!object(data)||data.request_id!==p.requestId||typeof data.replayed!=='boolean')
    throw Error('Comparison save was not confirmed. Your retry stays saved.')
   const result=comparisonSnapshot(data.comparison,data.items,p.owner)
   if(result.comparison.id!==p.comparisonId)throw Error('Comparison save was not confirmed.')
   if(storage.getItem(name)!==raw)throw Error('A newer saved comparison change exists. Refresh before continuing.')
   storage.removeItem(name);notify()
   return {...result,requestId:p.requestId,context:actor}
  })()
  running.set(name,work);notify()
  void work.finally(()=>{if(running.get(name)===work)running.delete(name);notify()}).catch(()=>{})
  return work
 }
 return {
  prepare,run,list,notify,context,assertContext,
  bind(next:string|null){if(next!==owner){owner=next;epoch++;notify()}},
  busy:()=>running.size>0,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  discard(p:ComparisonEdit){
   check(p);if(running.has(key(p)))throw Error('Wait for the comparison save to finish.')
   const raw=storage.getItem(key(p));if(raw&&parse(raw).requestId===p.requestId)storage.removeItem(key(p));notify()
  },
 }
}
