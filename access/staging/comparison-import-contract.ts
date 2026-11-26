import type {RpcClient} from './session-contract.ts'
import {comparisonSnapshot,type ActorContext,type ComparisonSnapshot} from './comparison-contract.ts'
export type ImportDocument={title:string;items:Record<string,unknown>[];need?:string|null;source?:string|null;notes?:string|null;clear_missing_choice?:boolean}
export type ImportState=ComparisonSnapshot & {revision:string;context:ActorContext}
export type ImportIntent={version:1;owner:string;comparisonId:string;taskId:string|null;expectedRevision:string|null;requestId:string;document:ImportDocument}
export type ImportedComparison=ImportState & {requestId:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isId=(v:unknown):v is string=>typeof v==='string'&&uuid.test(v)
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const revision=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)
const numeric=['price','quality','life_years','warranty_months','rating','review_count']
const text=['brand','model','image_url','url','shop','currency','size','notes']
export const importItemFields=['id','name',...numeric,...text,'pros','cons','extra']
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
export function normalizeImport(value:unknown):ImportDocument {
 if(!object(value)||Object.keys(value).some(k=>!['title','need','source','notes','items','clear_missing_choice'].includes(k))||
  typeof value.title!=='string'||!value.title.trim()||value.title.trim().length>500||!Array.isArray(value.items)||
  value.items.length<1||value.items.length>100)throw Error('Import requires a title and 1 to 100 products.')
 for(const k of ['need','source','notes'])if(Object.hasOwn(value,k)&&value[k]!==null&&(typeof value[k]!=='string'||value[k].length>20000))throw Error('Invalid import text.')
 if(Object.hasOwn(value,'clear_missing_choice')&&typeof value.clear_missing_choice!=='boolean')throw Error('Invalid choice decision.')
 const ids=new Set<string>()
 for(const item of value.items){
  if(!object(item)||Object.keys(item).some(k=>!importItemFields.includes(k))||!isId(item.id)||
   typeof item.name!=='string'||!item.name.trim()||item.name.trim().length>500||ids.has(item.id.toLowerCase()))throw Error('Each product needs a unique UUID and name.')
  ids.add(item.id.toLowerCase())
  for(const [k,v] of Object.entries(item)){
   if(numeric.includes(k)&&v!==null){
    if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e12||['quality','rating'].includes(k)&&v>5||
     ['warranty_months','review_count'].includes(k)&&(!Number.isInteger(v)||v>2147483647))throw Error('Invalid product number.')
   }
   if(text.includes(k)){
    if(v!==null&&(typeof v!=='string'||v.length>20000)||k==='currency'&&(typeof v!=='string'||!(/^[A-Z]{3}$/).test(v)))throw Error('Invalid product text.')
    if(['image_url','url'].includes(k)&&v!==null&&(typeof v!=='string'||v.length>2048||!(/^https?:\/\/[^\s]+$/).test(v)))throw Error('Only HTTP(S) product links are accepted.')
   }
   if(['pros','cons'].includes(k)&&(!Array.isArray(v)||v.length>64||v.some(x=>typeof x!=='string'||x.length>2000)))throw Error('Invalid product list.')
   if(k==='extra'&&(!object(v)||Object.keys(v).length>64||Object.entries(v).some(([key,x])=>!key.length||key.length>64||object(x)||Array.isArray(x)||JSON.stringify(x).length>2000)))throw Error('Invalid extra data.')
  }
 }
 // Leave space for PostgreSQL jsonb punctuation; server's independent 256 KiB
 // canonical-byte limit remains authoritative, with no partial write on refusal.
 if(new TextEncoder().encode(JSON.stringify(value)).length>240*1024)throw Error('Import is too large.')
 return canonical({...value,items:value.items.map(i=>({...i,id:i.id.toLowerCase()}))}) as ImportDocument
}
export function createComparisonImports({client,storage,requestId}:{client:RpcClient;storage:Storage;requestId:()=>string}){
 let owner:string|null=null,epoch=0
 const prefix='rm-comparison-import-v1:',running=new Map<string,Promise<ImportedComparison>>(),listeners=new Set<()=>void>()
 const notify=()=>{for(const fn of listeners)fn()}
 const context=():ActorContext=>({owner,epoch})
 const assertContext=(c:ActorContext)=>{if(!owner||c.owner!==owner||c.epoch!==epoch)throw Error('Account changed. The original import stays saved.')}
 const key=(p:ImportIntent)=>prefix+p.owner+':'+p.comparisonId
 function parse(raw:string):ImportIntent{
  if(raw.length>300000)throw Error('Saved import needs review.')
  const p=JSON.parse(raw) as ImportIntent
  if(p?.version!==1||!isId(p.owner)||!isId(p.comparisonId)||!isId(p.requestId)||
   p.taskId!==null&&!isId(p.taskId)||p.expectedRevision!==null&&!revision(p.expectedRevision)||p.expectedRevision===null&&p.taskId===null)
   throw Error('Saved import needs review.')
  return {...p,document:normalizeImport(p.document)}
 }
 function check(p:ImportIntent){assertContext({owner:p.owner,epoch});parse(JSON.stringify(p))}
 function snapshot(data:unknown,actor:ActorContext,target:string):ImportState{
  if(!object(data)||!revision(data.revision))throw Error('Import result was not confirmed.')
  const result=comparisonSnapshot(data.comparison,data.items,actor.owner!)
  if(result.comparison.id!==target)throw Error('Import result was not confirmed.')
  return {...result,revision:data.revision as string,context:actor}
 }
 const list=()=>{
  const found:ImportIntent[]=[];if(!owner)return found
  for(let i=0;i<storage.length;i++){
   const name=storage.key(i);if(!name?.startsWith(prefix+owner+':'))continue
   const raw=storage.getItem(name);if(!raw)continue
   const p=parse(raw);check(p);if(key(p)!==name)throw Error('Saved import owner/key mismatch.');found.push(p)
  }
  return found
 }
 async function preview(comparisonId:string){
  if(!isId(comparisonId))throw Error('Choose an existing comparison.')
  const actor=context();assertContext(actor)
  const {data,error}=await client.rpc('ga_roadmap_preview_import',{p_comparison_id:comparisonId})
  assertContext(actor);if(error)throw Error('Current import target could not be loaded. Nothing was sent.')
  return snapshot(data,actor,comparisonId)
 }
 function prepare(input:Omit<ImportIntent,'version'|'owner'|'requestId'>){
  if(!owner)throw Error('Sign in before importing.')
  const p:ImportIntent={...input,version:1,owner,requestId:requestId(),document:normalizeImport(input.document)};check(p)
  const raw=storage.getItem(key(p))
  if(raw){
   const previous=parse(raw);check(previous)
   if(key(previous)!==key(p)||!same({...previous,requestId:p.requestId},p))throw Error('An import is already waiting. Review its saved retry first.')
   return previous
  }
  storage.setItem(key(p),JSON.stringify(p));notify();return p
 }
 function run(p:ImportIntent):Promise<ImportedComparison>{
  try{check(p);const saved=storage.getItem(key(p));if(!saved||!same(parse(saved),p))throw Error('Saved import changed. Review before retrying.')}catch(e){return Promise.reject(e)}
  const name=key(p),inflight=running.get(name);if(inflight)return inflight
  const actor=context()
  const work=(async()=>{
   const raw=storage.getItem(name);if(!raw||!same(parse(raw),p))throw Error('Saved import changed. Review before retrying.')
   const {data,error}=await client.rpc('ga_roadmap_import_comparison',{
    p_comparison_id:p.comparisonId,p_task_id:p.taskId,p_expected_revision:p.expectedRevision,p_document:p.document,p_request_id:p.requestId,
   })
   assertContext(actor)
   if(error){
    if(error.code==='40001')throw Error('The study changed elsewhere. Your original import stays saved; review current data before replacing it.')
    if(error.code==='42501')throw Error('Access denied or imports paused. Your original import stays saved.')
    throw Error('Import was not confirmed. Your original import stays saved.')
   }
   if(!object(data)||data.request_id!==p.requestId||typeof data.replayed!=='boolean')throw Error('Import was not confirmed.')
   const result=snapshot(data,actor,p.comparisonId)
   if(storage.getItem(name)!==raw)throw Error('A newer saved import exists. Refresh before continuing.')
   storage.removeItem(name);notify();return {...result,requestId:p.requestId}
  })()
  running.set(name,work);notify();void work.finally(()=>{if(running.get(name)===work)running.delete(name);notify()}).catch(()=>{})
  return work
 }
 return {preview,prepare,run,list,notify,context,assertContext,
  bind(next:string|null){if(next!==owner){owner=next;epoch++;notify()}},
  busy:()=>running.size>0,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  discard(p:ImportIntent){check(p);if(running.has(key(p)))throw Error('Wait for the import to finish.')
   const raw=storage.getItem(key(p));if(raw&&parse(raw).requestId===p.requestId)storage.removeItem(key(p));notify()},
 }
}
