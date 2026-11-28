import {confirmConsumer} from './consumer-ack.ts'
import type {RpcClient} from './session-contract.ts'
import type {SuggestionRow} from '../lib/suggester.ts'
export type AnswerPayload={suggestion_id:string;action:'start'|'skip'|'dismiss';reason:string|null;from_app:string;seq:number|null;day_key:string;at:string|null}
export type AnswerIntent={version:1;owner:string;requestId:string;payload:AnswerPayload;blocked?:string}
export type AnswerContext={owner:string|null;epoch:number}
export type AnswerResult={context:AnswerContext;requestId:string;seq:number|null;row:SuggestionRow|null;outcome:'applied'|'already_answered'|'unknown'}
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)
const bytes=(x:string)=>new TextEncoder().encode(x).length
const integer=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0
const stamp=(x:unknown)=>typeof x==='string'&&Number.isFinite(Date.parse(x))
const same=(a:unknown,b:unknown):boolean=>{
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]))
 if(object(a)&&object(b))return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]))
 return a===b
}
export function normalizeAnswer(p:unknown):AnswerPayload{
 if(!object(p)||Object.keys(p).length!==7||typeof p.suggestion_id!=='string'||!p.suggestion_id||bytes(p.suggestion_id)>200||
  !['start','skip','dismiss'].includes(String(p.action))||p.reason!==null&&(typeof p.reason!=='string'||bytes(p.reason)>4096)||
  typeof p.from_app!=='string'||! /^[a-z][a-z0-9_-]{0,63}$/.test(p.from_app)||p.seq!==null&&!integer(p.seq)||
  typeof p.day_key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.day_key)||!Number.isFinite(Date.parse(p.day_key))||new Date(p.day_key).toISOString().slice(0,10)!==p.day_key||
  p.at!==null&&(typeof p.at!=='string'||bytes(p.at)>64))throw Object.assign(Error('Malformed suggestion answer. Nothing was sent.'),{code:'22023'})
 return {suggestion_id:p.suggestion_id,action:p.action as AnswerPayload['action'],reason:typeof p.reason==='string'?p.reason.trim()||null:null,from_app:p.from_app,seq:p.seq as number|null,day_key:p.day_key,at:p.at as string|null}
}
function parse(raw:string):AnswerIntent{
 if(bytes(raw)>12288)throw Error('Saved suggestion answer is too large. Review it before retrying.')
 const p=JSON.parse(raw)
 if(!object(p)||p.version!==1||!uuid(p.owner)||!uuid(p.requestId)||Object.keys(p).some(k=>!['version','owner','requestId','payload','blocked'].includes(k))||
  p.blocked!==undefined&&(typeof p.blocked!=='string'||!/^AK(?:1\d\d|202)$/.test(p.blocked)))throw Error('Saved suggestion answer needs review.')
 const payload=normalizeAnswer(p.payload);if(!same(payload,p.payload))throw Error('Saved suggestion answer needs review.')
 return {version:1,owner:p.owner,requestId:p.requestId,payload,...(p.blocked?{blocked:p.blocked as string}:{})}
}
export function createSuggestionAnswers({client,storage,uuid:makeId}:{client:RpcClient;storage:Storage;uuid:()=>string}){
 let owner:string|null=null,epoch=0,running:{key:string;promise:Promise<AnswerResult>}|null=null
 const listeners=new Set<()=>void>(),receipts=new WeakMap<AnswerResult,{raw:string;result:string;confirmed?:boolean;confirming?:Promise<void>}>()
 const notify=()=>{for(const fn of listeners)fn()},context=():AnswerContext=>({owner,epoch})
 function assertContext(c:AnswerContext){if(!owner||c.owner!==owner||c.epoch!==epoch)throw Error('Account changed. The original answer stays saved.')}
 const prefix=(actor:string)=>'rm-suggestion-answer-v1:'+actor+':',key=(p:AnswerIntent)=>prefix(p.owner)+p.requestId
 const list=()=>{
  if(!owner)return []
  const pending:AnswerIntent[]=[]
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(prefix(owner)))continue
   const raw=storage.getItem(k);if(raw===null)continue;const p=parse(raw)
   if(p.owner!==owner||k!==key(p))throw Error('Saved suggestion identity needs review.');pending.push(p)
  }
  return pending.sort((a,b)=>a.requestId.localeCompare(b.requestId))
 }
 function prepare(input:unknown){
  assertContext(context());const payload=normalizeAnswer(input)
  const prior=list().find(p=>payload.seq!==null?p.payload.seq===payload.seq:p.payload.seq===null&&p.payload.suggestion_id===payload.suggestion_id)
  if(prior){
   const {day_key:_,...old}=prior.payload,{day_key:__,...next}=payload
   // A replay keeps the first saved local day and request; never replaces a different answer.
   if(!same(old,next))throw Error('An answer is waiting. Review its original retry first.');return prior
  }
  const p:AnswerIntent={version:1,owner:owner!,requestId:makeId(),payload},raw=JSON.stringify(p);parse(raw);storage.setItem(key(p),raw);notify();return p
 }
 function run(intent:AnswerIntent):Promise<AnswerResult>{
  let p:AnswerIntent,raw:string
  try{assertContext({...context(),owner:intent.owner});raw=storage.getItem(key(intent))??'';p=parse(raw)
   if(!same(p,intent))throw Error('Saved answer changed.');if(p.blocked)throw Error('Hub contract requires review ('+p.blocked+'). This answer will not be resent automatically.')
  }catch(e){return Promise.reject(e)}
  const actor=context(),flight=actor.epoch+':'+p.requestId
  if(running)return running.key===flight?running.promise:Promise.reject(Error('Wait for the current suggestion answer.'))
  const current=()=>{assertContext(actor);if(storage.getItem(key(p))!==raw)throw Error('Newer saved answer exists. Review before continuing.')}
  const work=(async()=>{
   const {data,error}=await client.rpc(p.payload.seq===null?'ga_roadmap_answer_local_suggestion':'ga_roadmap_receive_suggestion_event',p.payload.seq===null?{p_payload:p.payload,p_request_id:p.requestId}:{p_seq:p.payload.seq,p_request_id:p.requestId,p_day_key:p.payload.day_key});current()
   if(error)throw Object.assign(Error(error.code==='42501'?'Access denied or saving paused. The answer stays saved.':error.code==='40001'?'Existing answer needs reconciliation. The answer stays saved.':'Answer was not confirmed. The original stays saved.'),{code:error.code})
   if(!object(data)||data.request_id!==p.requestId||!uuid(data.receipt_id)||typeof data.replayed!=='boolean'||(!data.replayed||p.payload.seq===null)&&data.receipt_id!==p.requestId||
    !['applied','already_answered','unknown'].includes(String(data.outcome)))throw Error('Answer acknowledgement was not confirmed.')
   if(p.payload.seq!==null&&(data.seq!==p.payload.seq||data.kind!=='suggestion.answered'||data.to_app!=='rm'||data.from_app!==p.payload.from_app||!same(data.answer,p.payload)))throw Error('Original suggestion event was not confirmed.')
   const row=data.suggestion
   if(row!==null&&(!object(row)||row.id!==p.payload.suggestion_id||row.user_id!==p.owner||!object(row.task)||typeof row.title!=='string'||
    !stamp(row.made_at)||!stamp(row.until)||row.rm_task_id!==null&&!uuid(row.rm_task_id)||row.answered_at!==null&&!stamp(row.answered_at)||
    ![null,'start','skip','dismiss'].includes(row.answer as string|null)))throw Error('Suggestion row was not confirmed.')
   if(!data.replayed&&data.outcome==='applied'&&(!object(row)||row.answer!==p.payload.action||!row.answered_at||row.answer_app!==p.payload.from_app))throw Error('Answer was not applied.')
   if(data.effect!==null){
    const effect=data.effect
    if(!object(effect)||effect.from_app!=='rm'||effect.to_app!=='wf'||effect.kind!=='task.skipped'||effect.src_clock!==null||
     effect.idempotency_key!=='rm:answer:'+data.receipt_id||!object(effect.src_addr)||!object(effect.payload)||
     !['board_id','item_key','sub_id'].every(k=>typeof (effect.src_addr as Record<string,unknown>)[k]==='string'&&!!(effect.src_addr as Record<string,unknown>)[k])||effect.src_addr.board_id==='rm'||
     data.outcome!=='applied'||p.payload.action!=='skip'||!p.payload.reason?.trim()||
     effect.payload.suggestion_id!==p.payload.suggestion_id||effect.payload.reason!==p.payload.reason.trim()||!stamp(effect.payload.at)||
     !same(effect.payload,{...effect.src_addr,reason:effect.payload.reason,at:effect.payload.at,suggestion_id:p.payload.suggestion_id})||
     bytes(JSON.stringify(effect))>12288)throw Error('Hub delivery was not confirmed.')
    current();const sent=await client.rpc('akatsuki_publish',{p:effect});current()
    const blocked=sent.error&&/^AK1\d\d$/.test(sent.error.code??'')?sent.error.code:null
    const result=Array.isArray(sent.data)?sent.data[0]:sent.data
    const closed=!sent.error&&object(result)&&result.status==='closed'&&(!object(result.reply)||!['applied','already'].includes(String(result.reply.status)))
    if(blocked||closed){storage.setItem(key(p),JSON.stringify({...p,blocked:blocked??'AK202'}));notify();throw Error('Hub contract requires review ('+(blocked??'AK202')+'). The saved answer is retained.')}
    if(sent.error||!object(result)||!integer(result.seq)||!['pending','skipped','closed'].includes(String(result.status)))throw Error('Hub delivery is not confirmed. Retry the original saved answer.')
   }
   current();const result:AnswerResult={context:actor,requestId:p.requestId,seq:p.payload.seq,row:row as SuggestionRow|null,outcome:data.outcome as AnswerResult['outcome']}
   receipts.set(result,{raw,result:JSON.stringify(result)});return result
  })()
  running={key:flight,promise:work};notify();void work.finally(()=>{if(running?.promise===work)running=null;notify()}).catch(()=>{});return work
 }
 function proofFor(result:AnswerResult){
  assertContext(result.context);const proof=receipts.get(result),k=prefix(owner!)+result.requestId
  if(!proof||JSON.stringify(result)!==proof.result||storage.getItem(k)!==proof.raw)throw Error('Saved answer changed. Review before continuing.')
  return {proof,k}
 }
 function confirm(result:AnswerResult):Promise<void>{
  let proof:ReturnType<typeof proofFor>['proof'];try{proof=proofFor(result).proof}catch(e){return Promise.reject(e)}
  if(result.seq===null||proof.confirmed)return Promise.resolve();if(proof.confirming)return proof.confirming
  const work=confirmConsumer(client,result.seq,'suggestion.answered',result.outcome,()=>{proofFor(result)}).then(()=>{proof.confirmed=true})
  proof.confirming=work;void work.finally(()=>{delete proof.confirming}).catch(()=>{});return work
 }
 function acknowledge(result:AnswerResult){const {proof,k}=proofFor(result)
  if(result.seq!==null&&!proof.confirmed)throw Error('Server acknowledgement is required. Original answer stays saved.')
  storage.removeItem(k);receipts.delete(result);notify()
 }
 return {prepare,run,confirm,acknowledge,list,context,assertContext,notify,busy:()=>!!running,
  bind(next:string|null){if(next!==owner){owner=next;epoch++;notify()}},
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}}
}
