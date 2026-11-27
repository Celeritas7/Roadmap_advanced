import type {RpcClient} from './session-contract.ts'
import type {TaskRow} from './task-edit-contract.ts'
import {mirrorAddressKey} from './mirror-contract.ts'
export type CompletionIntent={version:1;owner:string;requestId:string;taskId:string;suggestionId:string|null;blocked?:string}
export type CompletionContext={owner:string|null;epoch:number}
export type CompletionState='unpublished'|'pending'|'applied'|'already'|'unknown'|'stale'|'superseded'|'removed'
export type CompletionResult={context:CompletionContext;requestId:string;receiptId:string;taskId:string;state:CompletionState;replySeq:number;tasks:TaskRow[];suggestion:{id:string;task_id:string;done_at:string|null}|null}
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)
const bytes=(x:string)=>new TextEncoder().encode(x).length
const stamp=(x:unknown)=>typeof x==='string'&&Number.isFinite(Date.parse(x))
const integer=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0
const same=(a:unknown,b:unknown)=>mirrorAddressKey(a)===mirrorAddressKey(b)
export const completionTerminal=(state:CompletionState)=>!['unpublished','pending'].includes(state)
function validRow(r:unknown,owner:string):r is TaskRow{return object(r)&&uuid(r.id)&&(r.parent_id===null||uuid(r.parent_id))&&typeof r.title==='string'&&r.kind==='task'&&
 typeof r.done==='boolean'&&typeof r.expanded==='boolean'&&Number.isInteger(r.position)&&Number.isInteger(r.streak)&&(r.streak_day===null||typeof r.streak_day==='string')&&
 Array.isArray(r.tags)&&r.tags.every(x=>typeof x==='string')&&stamp(r.created_at)&&stamp(r.updated_at)&&(r.user_id===undefined||r.user_id===owner)}
export function createCompletions({client,storage,uuid:makeId}:{client:RpcClient;storage:Storage;uuid:()=>string}){
 let owner:string|null=null,epoch=0,running:{key:string;promise:Promise<CompletionResult>}|null=null
 const listeners=new Set<()=>void>(),proofs=new WeakMap<CompletionResult,{raw:string;result:string}>()
 const notify=()=>{for(const f of listeners)f()},context=():CompletionContext=>({owner,epoch})
 function assertContext(c:CompletionContext){if(!owner||c.owner!==owner||c.epoch!==epoch)throw Error('Account changed. The original completion stays saved.')}
 const prefix=(o:string)=>'rm-completion-v1:'+o+':',key=(p:CompletionIntent)=>prefix(p.owner)+p.taskId
 function parse(raw:string):CompletionIntent{
  if(bytes(raw)>2048)throw Error('Saved completion needs review.')
  const p=JSON.parse(raw)
  if(!object(p)||p.version!==1||!uuid(p.owner)||!uuid(p.requestId)||!uuid(p.taskId)||p.suggestionId!==null&&(typeof p.suggestionId!=='string'||!p.suggestionId||bytes(p.suggestionId)>200)||
   p.blocked!==undefined&&(typeof p.blocked!=='string'||!/^AK(?:1\d\d|201)$/.test(p.blocked))||Object.keys(p).some(k=>!['version','owner','requestId','taskId','suggestionId','blocked'].includes(k)))throw Error('Saved completion needs review.')
  return p as CompletionIntent
 }
 const list=()=>{if(!owner)return [];const out:CompletionIntent[]=[]
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(prefix(owner)))continue;const raw=storage.getItem(k);if(raw===null)continue;const p=parse(raw)
   if(p.owner!==owner||key(p)!==k)throw Error('Saved completion identity needs review.');out.push(p)}return out.sort((a,b)=>a.requestId.localeCompare(b.requestId))
 }
 function prepare(taskId:string,suggestionId:string|null=null){assertContext(context());const prior=list().find(p=>p.taskId===taskId);if(prior)return prior
  const p:CompletionIntent={version:1,owner:owner!,requestId:makeId(),taskId,suggestionId},raw=JSON.stringify(p);parse(raw);storage.setItem(key(p),raw);notify();return p
 }
 async function discover(){
  const actor=context();assertContext(actor);list();const {data,error}=await client.rpc('ga_roadmap_done_recovery',{});assertContext(actor)
  if(error)throw Error('Completion recovery is unavailable. Saved requests are retained.')
  if(!Array.isArray(data)||data.length>100||data.some(p=>!object(p)||!uuid(p.request_id)||!uuid(p.task_id)||p.suggestion_id!==null&&(typeof p.suggestion_id!=='string'||!p.suggestion_id||bytes(p.suggestion_id)>200)))throw Error('Completion recovery was not confirmed.')
  // First recover replies in server reply_seq order. Do not reorder them by request UUID.
  const pending:CompletionIntent[]=[]
  for(const row of data){assertContext(actor);if(pending.some(p=>p.taskId===row.task_id))continue;let p=list().find(p=>p.taskId===row.task_id)
   if(!p){p={version:1,owner:actor.owner!,requestId:row.request_id,taskId:row.task_id,suggestionId:row.suggestion_id};const raw=JSON.stringify(p);parse(raw);storage.setItem(key(p),raw)}pending.push(p)
  }
  notify();return [...pending,...list().filter(p=>!pending.some(x=>x.taskId===p.taskId))]
 }
 function run(intent:CompletionIntent,allowPublish=true):Promise<CompletionResult>{
  let p:CompletionIntent,raw:string
  try{assertContext({...context(),owner:intent.owner});raw=storage.getItem(key(intent))??'';p=parse(raw);if(!same(p,intent))throw Error('Saved completion changed.')}
  catch(e){return Promise.reject(e)}
  const actor=context(),flight=actor.epoch+':'+p.requestId+':'+allowPublish
  if(running)return running.key===flight?running.promise:Promise.reject(Error('Wait for the current completion request.'))
  const current=()=>{assertContext(actor);if(storage.getItem(key(p))!==raw)throw Error('Newer saved completion exists. Review before continuing.')}
  const work=(async()=>{
   const prepared=await client.rpc('ga_roadmap_prepare_done',{p_task_id:p.taskId,p_request_id:p.requestId,p_suggestion_id:p.suggestionId});current()
   if(prepared.error)throw Error(prepared.error.code==='42501'?'Completion access is paused or requires review. Original request stays saved.':'Completion preparation was not confirmed. Original request stays saved.')
   const d=prepared.data
   if(!object(d)||d.requested_id!==p.requestId||!uuid(d.request_id)||d.task_id!==p.taskId||typeof d.closed!=='boolean'||typeof d.publishable!=='boolean'||!object(d.effect))throw Error('Completion preparation was not confirmed.')
   const effect=d.effect
   if(effect.from_app!=='rm'||effect.to_app!=='wf'||effect.kind!=='task.done'||effect.src_clock!==null||effect.idempotency_key!=='rm:done:'+d.request_id||!object(effect.src_addr)||!object(effect.payload)||
    !['board_id','item_key','sub_id'].every(k=>typeof (effect.src_addr as Record<string,unknown>)[k]==='string'&&!!String((effect.src_addr as Record<string,unknown>)[k]).trim())||!stamp(effect.payload.at)||
    effect.payload.suggestion_id!==null&&(typeof effect.payload.suggestion_id!=='string'||bytes(effect.payload.suggestion_id)>200)||
    !same(effect.payload,{...effect.src_addr,at:effect.payload.at,suggestion_id:effect.payload.suggestion_id})||bytes(JSON.stringify(effect))>12288)throw Error('Completion publication was not confirmed.')
   const expectedSuggestion=effect.payload.suggestion_id
   const validate=(r:unknown)=>{
   if(!object(r)||r.request_id!==d.request_id||r.task_id!==p.taskId||!['unpublished','pending','applied','already','unknown','stale','superseded','removed'].includes(String(r.state))||
    !Array.isArray(r.tasks)||r.tasks.length>1||r.tasks.some(t=>!validRow(t,p.owner)||t.id!==p.taskId)||
    (['unpublished','pending'].includes(String(r.state))?r.reply_seq!==0||r.tasks.length!==0:!integer(r.reply_seq)))throw Error('Completion reply was not confirmed.')
   const suggestion=r.suggestion
   if(suggestion!==null&&(!object(suggestion)||typeof suggestion.id!=='string'||suggestion.id!==expectedSuggestion||suggestion.task_id!==p.taskId||suggestion.done_at!==null&&!stamp(suggestion.done_at)))throw Error('Completion suggestion was not confirmed.')
    return r
   }
   const reconcile=async()=>{const r=await client.rpc('ga_roadmap_reconcile_done',{p_request_id:d.request_id});current();if(r.error)throw Error('Completion reply requires review or retry. Original request stays saved.');return validate(r.data)}
   let response=await reconcile()
   if(object(response)&&response.state==='unpublished'&&allowPublish){
    if(p.blocked)throw Error('Hub contract requires review ('+p.blocked+'). Check replies without resending.')
    if(!d.publishable||d.closed)throw Error('Original task is unavailable for publication. Its saved request is retained.')
    const sent=await client.rpc('akatsuki_publish',{p:effect});current()
    if(sent.error&&/^AK(?:1\d\d|201)$/.test(sent.error.code??'')){
     storage.setItem(key(p),JSON.stringify({...p,blocked:sent.error.code}));notify();throw Error('Hub contract requires review ('+sent.error.code+'). Original completion stays saved.')
    }
    const acknowledgement=Array.isArray(sent.data)?sent.data[0]:sent.data
    if(sent.error||!object(acknowledgement)||!integer(acknowledgement.seq)||!['pending','skipped','closed'].includes(String(acknowledgement.status)))throw Error('Completion publication was not confirmed. Retry the original request.')
    response=await reconcile()
   }
   const r=response,suggestion=r.suggestion
   current();const result:CompletionResult={context:actor,requestId:p.requestId,receiptId:d.request_id,taskId:p.taskId,state:r.state as CompletionState,replySeq:r.reply_seq as number,tasks:r.tasks as TaskRow[],suggestion:suggestion as CompletionResult['suggestion']}
   proofs.set(result,{raw,result:JSON.stringify(result)});return result
  })()
  running={key:flight,promise:work};notify();void work.finally(()=>{if(running?.promise===work)running=null;notify()}).catch(()=>{});return work
 }
 function acknowledge(result:CompletionResult){assertContext(result.context);const proof=proofs.get(result),k=prefix(owner!)+result.taskId
  if(!completionTerminal(result.state)||!proof||JSON.stringify(result)!==proof.result||storage.getItem(k)!==proof.raw)throw Error('Completion is not confirmed or saved work changed.')
  storage.removeItem(k);proofs.delete(result);notify()
 }
 return {prepare,discover,run,acknowledge,list,context,assertContext,notify,busy:()=>!!running,
  bind(next:string|null){if(next!==owner){owner=next;epoch++;notify()}},subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}}
}
