import {confirmConsumer} from './consumer-ack.ts'
import type {RpcClient} from './session-contract.ts'
import type {SessionRow} from '../types.ts'
export type StudyEnvelope={seq:number;taskId:string;day:string}
export type StudyIntent={version:1;owner:string;event:StudyEnvelope}
export type StudyContext={owner:string|null;epoch:number}
export type StudyResult={context:StudyContext;event:StudyEnvelope;outcome:string;deliveryOutcome:string;session:SessionRow|null}
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)
const stamp=(x:unknown)=>typeof x==='string'&&Number.isFinite(Date.parse(x))
const day=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&stamp(x)&&new Date(x).toISOString().slice(0,10)===x
export function studyEnvelope(x:unknown):StudyEnvelope{
 if(!object(x)||Object.keys(x).length!==3||!Number.isSafeInteger(x.seq)||Number(x.seq)<1||!uuid(x.taskId)||!day(x.day))throw Object.assign(Error('Malformed study delivery.'),{code:'22023'})
 return {seq:Number(x.seq),taskId:x.taskId,day:x.day}
}
export function createStudyReports({client,storage}:{client:RpcClient;storage:Storage}){
 let owner:string|null=null,epoch=0,running:{key:string;promise:Promise<StudyResult>}|null=null
 const listeners=new Set<()=>void>(),receipts=new WeakMap<StudyResult,{raw:string;value:string;confirmed?:boolean;confirming?:Promise<void>}>()
 const notify=()=>{for(const fn of listeners)fn()},context=():StudyContext=>({owner,epoch})
 function assertContext(c:StudyContext){if(!owner||owner!==c.owner||epoch!==c.epoch)throw Error('Account changed. Original study delivery stays saved.')}
 const prefix=(o:string)=>'rm-study-report-v1:'+o+':',key=(p:StudyIntent)=>prefix(p.owner)+p.event.seq
 function parse(raw:string):StudyIntent{if(raw.length>1024)throw Error('Saved study delivery needs review.');const p=JSON.parse(raw)
  if(!object(p)||Object.keys(p).length!==3||p.version!==1||!uuid(p.owner))throw Error('Saved study delivery needs review.')
  return {version:1,owner:p.owner,event:studyEnvelope(p.event)}
 }
 const list=()=>{if(!owner)return [];const out:StudyIntent[]=[]
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(prefix(owner)))continue;const raw=storage.getItem(k);if(raw===null)continue
   const p=parse(raw);if(p.owner!==owner||key(p)!==k)throw Error('Saved study identity needs review.');out.push(p)}return out.sort((a,b)=>a.event.seq-b.event.seq)
 }
 function prepare(input:unknown){assertContext(context());const event=studyEnvelope(input),prior=list().find(p=>p.event.seq===event.seq)
  if(prior){if(JSON.stringify(prior.event)!==JSON.stringify(event))throw Error('Study sequence changed. Keep the original retry.');return prior}
  const p:StudyIntent={version:1,owner:owner!,event};storage.setItem(key(p),JSON.stringify(p));notify();return p
 }
 function run(intent:StudyIntent):Promise<StudyResult>{
  let raw:string,p:StudyIntent;try{assertContext({...context(),owner:intent.owner});raw=storage.getItem(key(intent))??'';p=parse(raw);if(JSON.stringify(p)!==JSON.stringify(intent))throw Error('Saved study delivery changed.')}catch(e){return Promise.reject(e)}
  const actor=context(),flight=actor.epoch+':'+p.event.seq
  if(running)return running.key===flight?running.promise:Promise.reject(Error('Wait for the current study delivery.'))
  const current=()=>{assertContext(actor);if(storage.getItem(key(p))!==raw)throw Error('Newer saved study delivery exists.')}
  const work=(async()=>{
   // The server reads the stored stream; no browser payload, source or verification is authoritative.
   const {data,error}=await client.rpc('ga_roadmap_receive_study_event',{p_seq:p.event.seq});current()
   if(error)throw Object.assign(Error(error.code==='42501'?'Study access is paused or caller review is required.':error.code==='40001'?'Study record or contract changed; review before retrying.':'Study delivery was not confirmed. Retry the original.'),{code:error.code})
   if(!object(data)||data.kind!=='session.completed'||data.from_app!=='jlpt'||data.to_app!=='rm'||!['reported','preserved','superseded'].includes(String(data.receipt_outcome))||data.seq!==p.event.seq||data.task_id!==p.event.taskId||data.day_key!==p.event.day||typeof data.replayed!=='boolean'||
    !['reported','preserved','superseded','removed'].includes(String(data.outcome)))throw Error('Study acknowledgement was not confirmed.')
   const s=data.session
   if(s===null?data.outcome!=='removed':!object(s)||!uuid(s.id)||s.task_id!==p.event.taskId||s.day_key!==p.event.day||
    s.user_id!==undefined&&s.user_id!==p.owner||typeof s.source!=='string'||!['manual','app','api'].includes(String(s.verification))||
    !(s.started_at===null||stamp(s.started_at))||!(s.completed_at===null||stamp(s.completed_at))||!stamp(s.created_at)||
    !(s.duration_min===null||Number.isInteger(s.duration_min))||!object(s.feedback)||
    data.outcome==='reported'&&(s.verification!=='app'||!s.completed_at||s.source!=='japanese-study-app-advanced'))throw Error('Study row was not confirmed.')
   current();const result:StudyResult={context:actor,event:p.event,outcome:String(data.outcome),deliveryOutcome:String(data.receipt_outcome),session:s as SessionRow|null};receipts.set(result,{raw,value:JSON.stringify(result)});return result
  })()
  running={key:flight,promise:work};notify();void work.finally(()=>{if(running?.promise===work)running=null;notify()}).catch(()=>{});return work
 }
 function proofFor(result:StudyResult){assertContext(result.context);const proof=receipts.get(result),k=prefix(owner!)+result.event.seq
  if(!proof||JSON.stringify(result)!==proof.value||storage.getItem(k)!==proof.raw)throw Error('Saved study delivery changed. Review before continuing.')
  return {proof,k}
 }
 function confirm(result:StudyResult):Promise<void>{
  let proof:ReturnType<typeof proofFor>['proof'];try{proof=proofFor(result).proof}catch(e){return Promise.reject(e)}
  if(proof.confirmed)return Promise.resolve();if(proof.confirming)return proof.confirming
  const work=confirmConsumer(client,result.event.seq,'session.completed',result.deliveryOutcome,()=>{proofFor(result)}).then(()=>{proof.confirmed=true})
  proof.confirming=work;void work.finally(()=>{delete proof.confirming}).catch(()=>{});return work
 }
 function acknowledge(result:StudyResult){const {proof,k}=proofFor(result)
  if(!proof.confirmed)throw Error('Server acknowledgement is required. Original study delivery stays saved.')
  storage.removeItem(k);receipts.delete(result);notify()
 }
 return {prepare,run,confirm,acknowledge,list,context,assertContext,notify,busy:()=>!!running,bind(next:string|null){if(next!==owner){owner=next;epoch++;notify()}},subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}}
}
