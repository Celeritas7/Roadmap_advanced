import type {RpcClient} from './session-contract.ts'
export type LogEntry={task_id:string|null;log_date:string;context:string|null;duration_minutes:number;notes:string|null}
export type SavedLog=LogEntry & {id:string;created_at:string}
export type LogIntent={version:1;owner:string;requestId:string;entryId:string;entry:LogEntry}
export type LogContext={owner:string|null;epoch:number}
export type LogResult={context:LogContext;requestId:string;entry:SavedLog}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isId=(x:unknown):x is string=>typeof x==='string'&&uuid.test(x)
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const bytes=(x:string)=>new TextEncoder().encode(x).length
const stamp=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x))
function day(x:unknown):x is string{
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||x.startsWith('0000'))return false
 const parsed=new Date(x+'T00:00:00Z');return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===x
}
export function normalizeLog(input:unknown):LogEntry{
 if(!object(input)||Object.keys(input).some(k=>!['task_id','log_date','context','duration_minutes','notes'].includes(k)))throw Error('Invalid daily log fields.')
 const value={task_id:input.task_id??null,log_date:input.log_date,context:input.context??null,duration_minutes:input.duration_minutes,notes:input.notes??null}
 if(value.task_id!==null&&!isId(value.task_id)||!day(value.log_date)||!Number.isInteger(value.duration_minutes)||
  typeof value.duration_minutes!=='number'||value.duration_minutes<1||value.duration_minutes>1440||
  value.context!==null&&(typeof value.context!=='string'||bytes(value.context)>128)||
  value.notes!==null&&(typeof value.notes!=='string'||bytes(value.notes)>16384))throw Error('Review the log date, task, notes and whole-number duration (1–1440 minutes).')
 return value as LogEntry
}
function parse(raw:string):LogIntent{
 if(bytes(raw)>24576)throw Error('Saved daily log is too large. Review the original draft.')
 const p=JSON.parse(raw) as LogIntent
 if(!object(p)||Object.keys(p).length!==5||p.version!==1||!isId(p.owner)||!isId(p.requestId)||!isId(p.entryId)||!object(p.entry)||Object.keys(p.entry).length!==5)
  throw Error('Saved daily log needs review.')
 const entry=normalizeLog(p.entry)
 if(JSON.stringify(entry)!==JSON.stringify(p.entry))throw Error('Saved daily log needs review.')
 return {...p,entry}
}
function savedLog(value:unknown,owner:string):SavedLog{
 if(!object(value)||!isId(value.id)||!stamp(value.created_at)||value.user_id!==undefined&&value.user_id!==owner)throw Error('Daily log was not confirmed.')
 const entry=normalizeLog(Object.fromEntries(['task_id','log_date','context','duration_minutes','notes'].map(k=>[k,value[k]])))
 // Replays can contain later edits, but missing columns are not acknowledgements.
 if(!['task_id','log_date','context','duration_minutes','notes'].every(k=>Object.hasOwn(value,k)))throw Error('Daily log was not confirmed.')
 return {...entry,id:value.id,created_at:value.created_at as string}
}
export function createDailyLogs({client,storage,uuid:nextId}:{client:RpcClient;storage:Storage;uuid:()=>string}){
 let owner:string|null=null,epoch=0,running:{key:string;promise:Promise<LogResult>}|null=null,confirmed:LogResult|null=null
 const listeners=new Set<()=>void>(),receipts=new WeakMap<LogResult,{intent:LogIntent;raw:string}>()
 const notify=()=>{for(const fn of listeners)fn()}
 const context=():LogContext=>({owner,epoch})
 function assertContext(c:LogContext){if(!owner||c.owner!==owner||c.epoch!==epoch)throw Error('Account changed. The original daily log stays saved.')}
 const key=(actor:string)=>'rm-daily-log-v1:'+actor
 const list=()=>{if(!owner)return [];const raw=storage.getItem(key(owner));if(!raw)return [];const p=parse(raw);assertContext({owner:p.owner,epoch});return [p]}
 function prepare(input:unknown){
  if(!owner)throw Error('Sign in before saving a daily log.')
  const entry=normalizeLog(input),previous=list()[0]
  if(previous){if(JSON.stringify(previous.entry)!==JSON.stringify(entry))throw Error('A daily log is waiting. Review its original retry before logging another entry.');return previous}
  const p:LogIntent={version:1,owner,requestId:nextId(),entryId:nextId(),entry},raw=JSON.stringify(p)
  parse(raw);storage.setItem(key(owner),raw);notify();return p
 }
 function run(p:LogIntent):Promise<LogResult>{
  let raw:string
  try{assertContext({owner:p.owner,epoch});raw=storage.getItem(key(p.owner))??'';
   if(JSON.stringify(parse(raw))!==JSON.stringify(p))throw Error('Saved daily log changed.')
  }catch(e){return Promise.reject(e)}
  const actor=context(),flightKey=actor.epoch+':'+p.owner+':'+p.requestId
  if(running)return running.key===flightKey?running.promise:Promise.reject(Error('Wait for the current daily log.'))
  const work=(async()=>{
   const {data,error}=await client.rpc('ga_roadmap_add_log',{p_entry_id:p.entryId,p_entry:p.entry,p_request_id:p.requestId})
   assertContext(actor)
   if(error){
    if(error.code==='42501')throw Error('Access denied, task unavailable or saving paused. The original daily log stays saved.')
    if(error.code==='22023')throw Error('Daily log needs review. The original request stays saved.')
    throw Error('Daily log was not confirmed. The original request stays saved.')
   }
   if(!object(data)||data.request_id!==p.requestId||typeof data.replayed!=='boolean')throw Error('Daily log was not confirmed.')
   const entry=savedLog(data.entry,p.owner)
   if(entry.id!==p.entryId||!data.replayed&&Object.entries(p.entry).some(([k,v])=>entry[k as keyof LogEntry]!==v))throw Error('Daily log was not confirmed.')
   if(storage.getItem(key(p.owner))!==raw)throw Error('A newer saved daily log exists. Review before continuing.')
   const result:LogResult={context:actor,requestId:p.requestId,entry};receipts.set(result,{intent:p,raw});return result
  })()
  running={key:flightKey,promise:work};notify();void work.finally(()=>{if(running?.promise===work)running=null;notify()}).catch(()=>{});return work
 }
 function acknowledge(result:LogResult){
  assertContext(result.context);const receipt=receipts.get(result)
  if(!receipt||receipt.intent.requestId!==result.requestId||storage.getItem(key(receipt.intent.owner))!==receipt.raw)throw Error('Saved daily log changed. Review before continuing.')
  storage.removeItem(key(receipt.intent.owner));receipts.delete(result);confirmed=result;notify()
 }
 return {prepare,run,acknowledge,list,context,assertContext,notify,confirmation:()=>confirmed,
  bind(next:string|null){if(next!==owner){owner=next;epoch++;confirmed=null;notify()}},busy:()=>!!running,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  discard(p:LogIntent){assertContext({owner:p.owner,epoch});if(running)throw Error('Wait for the current daily log.');const old=list()[0];if(old?.requestId===p.requestId)storage.removeItem(key(p.owner));notify()},
 }
}
