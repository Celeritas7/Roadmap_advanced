import type {RpcClient} from './session-contract.ts'
export type ResetTarget={id:string;expectedUpdatedAt:string}
export type ResetIntent={version:1;owner:string;requestId:string;day:string;timezone:string;tasks:ResetTarget[]}
export type ResetContext={owner:string|null;epoch:number}
export type ResetResult={context:ResetContext;requestId:string;tasks:Record<string,unknown>[]}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isId=(x:unknown):x is string=>typeof x==='string'&&uuid.test(x)
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const stamp=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x))
function valid(p:ResetIntent){
 if(p?.version!==1||!isId(p.owner)||!isId(p.requestId)||!/^\d{4}-\d{2}-\d{2}$/.test(p.day)||
  !Number.isFinite(Date.parse(p.day))||typeof p.timezone!=='string'||p.timezone.length>100||!Array.isArray(p.tasks)||p.tasks.length<1||p.tasks.length>100)return false
 try{new Intl.DateTimeFormat('en',{timeZone:p.timezone})}catch{return false}
 return p.tasks.every(t=>object(t)&&Object.keys(t).length===2&&isId(t.id)&&stamp(t.expectedUpdatedAt))&&new Set(p.tasks.map(t=>t.id)).size===p.tasks.length
}
export function createDailyResets({client,storage,requestId}:{client:RpcClient;storage:Storage;requestId:()=>string}){
 let owner:string|null=null,epoch=0,running:Promise<ResetResult>|null=null
 const listeners=new Set<()=>void>(),receipts=new WeakMap<ResetResult,{intent:ResetIntent;raw:string}>()
 const notify=()=>{for(const fn of listeners)fn()}
 const context=():ResetContext=>({owner,epoch})
 function assertContext(c:ResetContext){if(!owner||c.owner!==owner||c.epoch!==epoch)throw Error('Account changed. The original daily reset stays saved.')}
 const key=(actor:string)=>'rm-daily-reset-v1:'+actor
 const parse=(raw:string)=>{if(raw.length>32768)throw Error('Saved daily reset needs review.');const p=JSON.parse(raw) as ResetIntent;if(!valid(p))throw Error('Saved daily reset needs review.');return p}
 const list=()=>{if(!owner)return [];const raw=storage.getItem(key(owner));if(!raw)return [];const p=parse(raw);assertContext({owner:p.owner,epoch});return [p]}
 function prepare(tasks:ResetTarget[],day:string,timezone:string){
  if(!owner)throw Error('Sign in before resetting daily tasks.')
  const p:ResetIntent={version:1,owner,requestId:requestId(),day,timezone,tasks:[...tasks].sort((a,b)=>a.id.localeCompare(b.id))}
  if(!valid(p))throw Error('Invalid daily reset. Review current tasks.')
  const previous=list()[0]
  if(previous){if(JSON.stringify({...previous,requestId:p.requestId})!==JSON.stringify(p))throw Error('A daily reset is waiting. Review its original retry first.');return previous}
  storage.setItem(key(owner),JSON.stringify(p));notify();return p
 }
 function run(p:ResetIntent):Promise<ResetResult>{
  let raw:string
  try{assertContext({owner:p.owner,epoch});if(!valid(p))throw Error('Invalid daily reset.');raw=storage.getItem(key(p.owner))??'';
   if(JSON.stringify(parse(raw))!==JSON.stringify(p))throw Error('Saved daily reset changed.')
  }catch(e){return Promise.reject(e)}
  if(running)return running
  const actor=context()
  const work=(async()=>{
   const {data,error}=await client.rpc('ga_roadmap_reset_daily_tasks',{
    p_tasks:p.tasks.map(t=>({id:t.id,expected_updated_at:t.expectedUpdatedAt})),p_day_key:p.day,p_timezone:p.timezone,p_request_id:p.requestId,
   })
   assertContext(actor)
   if(error){
    if(error.code==='40001')throw Error('Daily tasks or the reset day changed. Review current tasks; the original reset stays saved.')
    if(error.code==='42501')throw Error('Access denied or daily resets paused. The original reset stays saved.')
    throw Error('Daily reset was not confirmed. The original reset stays saved.')
   }
   if(!object(data)||data.request_id!==p.requestId||data.day_key!==p.day||data.timezone!==p.timezone||typeof data.replayed!=='boolean'||!Array.isArray(data.tasks)||data.tasks.length!==p.tasks.length)
    throw Error('Daily reset was not confirmed.')
   const ids=new Set<string>()
   for(const row of data.tasks){if(!object(row)||!isId(row.id)||ids.has(row.id)||!p.tasks.some(t=>t.id===row.id)||
    typeof row.done!=='boolean'||!stamp(row.updated_at)||typeof row.title!=='string'||!Array.isArray(row.tags)||
    row.user_id!==undefined&&row.user_id!==p.owner)throw Error('Daily reset rows were not confirmed.');ids.add(row.id)}
   if(storage.getItem(key(p.owner))!==raw)throw Error('A newer saved daily reset exists. Review before continuing.')
   const result:ResetResult={context:actor,requestId:p.requestId,tasks:data.tasks};receipts.set(result,{intent:p,raw});return result
  })()
  running=work;notify();void work.finally(()=>{if(running===work)running=null;notify()}).catch(()=>{});return work
 }
 function acknowledge(result:ResetResult){
  assertContext(result.context);const receipt=receipts.get(result)
  if(!receipt||receipt.intent.requestId!==result.requestId||storage.getItem(key(receipt.intent.owner))!==receipt.raw)
   throw Error('Saved daily reset changed. Review before continuing.')
  storage.removeItem(key(receipt.intent.owner));receipts.delete(result);notify()
 }
 return {prepare,run,acknowledge,list,context,assertContext,notify,
  bind(next:string|null){if(next!==owner){owner=next;epoch++;notify()}},busy:()=>!!running,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  discard(p:ResetIntent){assertContext({owner:p.owner,epoch});if(running)throw Error('Wait for the current reset.');const old=list()[0];if(old?.requestId===p.requestId)storage.removeItem(key(p.owner));notify()},
 }
}
