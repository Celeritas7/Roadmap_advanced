import {test} from 'node:test';import assert from 'node:assert/strict';import {createStudyReports} from '../staging/study-report-contract.ts';import {createSuggestionAnswers} from '../staging/suggestion-contract.ts';import {consumerAck} from './consumer-test-support.mjs';
const id=n=>'22000000-0000-4000-8000-'+String(n).padStart(12,'0'),stamp='2026-11-28T01:00:00Z';
function fixture(kind,ack){
 const entries=new Map(),storage={get length(){return entries.size},key:i=>[...entries.keys()][i],getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
 const calls=[],answer={suggestion_id:'one',action:'dismiss',reason:null,from_app:'wf',seq:21,day_key:'2026-11-28',at:stamp};
 const client={rpc:async(name,args)=>{calls.push({name,args});if(name==='ga_roadmap_ack_consumer_event')return ack(args);
  if(kind==='session.completed')return {error:null,data:{seq:20,kind,from_app:'jlpt',to_app:'rm',task_id:id(3),day_key:answer.day_key,replayed:true,outcome:'superseded',receipt_outcome:'reported',session:{id:id(4),task_id:id(3),day_key:answer.day_key,source:'japanese-study-app-advanced',started_at:null,completed_at:stamp,duration_min:25,feedback:{mode:'goi'},verification:'app',created_at:stamp}}};
  return {error:null,data:{seq:21,kind,from_app:'wf',to_app:'rm',answer,request_id:id(5),receipt_id:id(5),replayed:false,outcome:'applied',effect:null,suggestion:{id:'one',user_id:id(1),task:{},title:'Keep',rm_task_id:id(3),made_at:stamp,until:stamp,answer:'dismiss',answered_at:stamp,answer_app:'wf'}}};
 }};
 const c=kind==='session.completed'?createStudyReports({client,storage}):createSuggestionAnswers({client,storage,uuid:()=>id(5)});c.bind(id(1));
 const p=c.prepare(kind==='session.completed'?{seq:20,taskId:id(3),day:answer.day_key}:answer);return {c,p,calls,storage};
}
for(const kind of ['session.completed','suggestion.answered']){
 const seq=kind==='session.completed'?20:21,outcome=kind==='session.completed'?'reported':'applied';
 test(kind+': single-flight exact acknowledgement is mandatory and preserves a superseded original outcome',async()=>{
  let finish;const s=fixture(kind,()=>new Promise(resolve=>finish=resolve)),r=await s.c.run(s.p);assert.throws(()=>s.c.acknowledge(r),/Server acknowledgement/);
  const first=s.c.confirm(r),second=s.c.confirm(r);assert.equal(first,second);assert.deepEqual(s.calls.at(-1),{name:'ga_roadmap_ack_consumer_event',args:{p_seq:seq}});
  finish(consumerAck(seq,kind,outcome));await first;s.c.acknowledge(r);assert.equal(s.c.list().length,0);
 });
 test(kind+': lost, malformed, wrong-request and wrong-result replies cannot clear local recovery',async()=>{
  for(const change of [r=>{r.error={code:'504'}},r=>{r.data=null},r=>{r.data.seq++},r=>{r.data.reply.request_seq++},r=>{r.data.reply_seq=0},r=>{r.data.reply.status='unknown-outcome'},r=>{r.data.reply.protocol='legacy'}]){
   const s=fixture(kind,()=>{const ack=consumerAck(seq,kind,outcome);change(ack);return ack}),r=await s.c.run(s.p);
   await assert.rejects(()=>s.c.confirm(r),/not confirmed/);assert.throws(()=>s.c.acknowledge(r),/Server acknowledgement/);assert.deepEqual(s.c.list(),[s.p]);
  }
 });
 test(kind+': account epochs and saved-byte changes during acknowledgement preserve the original retry',async()=>{
  for(const mode of ['account','bytes']){
   let finish;const s=fixture(kind,()=>new Promise(resolve=>finish=resolve)),r=await s.c.run(s.p),flight=s.c.confirm(r);
   if(mode==='account'){s.c.bind(id(2));s.c.bind(id(1))}else{s.storage.setItem(s.storage.key(0),JSON.stringify(s.p)+' ')}
   finish(consumerAck(seq,kind,outcome));await assert.rejects(flight,/changed/);assert.equal(s.c.list().length,1);
  }
 });
}
