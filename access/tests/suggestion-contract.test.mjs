import {test} from 'node:test';import assert from 'node:assert/strict';
import {consumerAck} from './consumer-test-support.mjs';
import {createSuggestionAnswers,normalizeAnswer} from '../staging/suggestion-contract.ts';
const id=n=>'f7000000-0000-4000-8000-'+String(n).padStart(12,'0');
const payload={suggestion_id:'sg-synthetic',action:'skip',reason:' Keep 日本語 <script>text</script> ',from_app:'wf',seq:25,day_key:'2026-11-27',at:'2026-11-27T01:00:00Z'};
const address={board_id:'board',item_key:'study:Japanese/Elite',sub_id:'task',extra:{keep:'exact'}};
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
function setup(rpc,storage=memory()) {let n=10;const answers=createSuggestionAnswers({client:{rpc:async(name,args)=>{if(name==='ga_roadmap_ack_consumer_event')return consumerAck(args.p_seq,'suggestion.answered','applied');return rpc(name,args)}},storage,uuid:()=>id(n++)});answers.bind(id(1));return {answers,storage,make:(p=payload)=>answers.prepare(p)}}
const response=p=>({error:null,data:{seq:p.payload.seq,kind:'suggestion.answered',from_app:p.payload.from_app,to_app:'rm',answer:p.payload,request_id:p.requestId,receipt_id:p.requestId,replayed:false,outcome:'applied',
 suggestion:{id:p.payload.suggestion_id,user_id:p.owner,task:address,title:'Keep task',rm_task_id:id(3),made_at:payload.at,until:'2026-11-28T00:00:00Z',answer:p.payload.action,answered_at:payload.at,answer_app:p.payload.from_app},
 effect:{from_app:'rm',to_app:'wf',kind:'task.skipped',src_addr:address,src_clock:null,idempotency_key:'rm:answer:'+p.requestId,
 payload:{...address,reason:p.payload.reason.trim(),at:payload.at,suggestion_id:p.payload.suggestion_id}}}});
const delivered={error:null,data:[{status:'pending',seq:99}]};
test('lost answer and publish replies survive reload with exactly the same request and address',async()=>{
 const calls=[];let p,mode='lost';const rpc=async(name,args)=>{calls.push({name,args:structuredClone(args)});if(['ga_roadmap_receive_suggestion_event','ga_roadmap_answer_local_suggestion'].includes(name))return mode==='lost'?{error:{code:'504'},data:null}:response(p);return mode==='publish-lost'?{error:{code:'504'},data:null}:delivered};
 const a=setup(rpc);p=a.make();await assert.rejects(()=>a.answers.run(p),/stays saved/);
 const b=setup(rpc,a.storage);mode='publish-lost';await assert.rejects(()=>b.answers.run(p),/not confirmed/);
 const firstPublish=calls.at(-1);mode='ok';const c=setup(rpc,a.storage),r=await c.answers.run(c.answers.list()[0]);
 assert.deepEqual(firstPublish,calls.at(-1));assert.deepEqual(calls[0],calls[1]);assert.deepEqual(firstPublish.args.p.src_addr,address);
 assert.equal(c.answers.list().length,1);await c.answers.confirm(r);c.answers.acknowledge(r);assert.deepEqual(c.answers.list(),[]);
});
test('native starts have no outgoing delivery; duplicate clicks wait for one confirmation',async()=>{
 let p,finish,calls=0;const s=setup(()=>{calls++;return new Promise(r=>finish=r)});p=s.make({...payload,action:'start',reason:null,seq:null,from_app:'rm'});
 const a=s.answers.run(p),b=s.answers.run(p);assert.equal(calls,1);const good=response({...p,payload:{...p.payload,reason:''}});good.data.effect=null;finish(good);const r=await a;assert.equal(r,await b);await s.answers.confirm(r);s.answers.acknowledge(r);
});
test('permanent contract and unresolved closed outcomes remain visible without repeat publishes',async()=>{
 for(const result of [{error:{code:'AK103',message:'different message'},data:null},{error:null,data:{seq:99,status:'closed',reply:{status:'unknown'}}}]){
  let p,calls=0;const s=setup(async name=>{calls++;return ['ga_roadmap_receive_suggestion_event','ga_roadmap_answer_local_suggestion'].includes(name)?response(p):result});p=s.make();
  await assert.rejects(()=>s.answers.run(p),/requires review/);assert.match(s.answers.list()[0].blocked,/AK103|AK202/);
  const c=setup(async()=>{calls++;throw Error('must not resend')},s.storage);await assert.rejects(()=>c.answers.run(c.answers.list()[0]),/requires review/);assert.equal(calls,2);
 }
});
test('queued, malformed, denied and empty acknowledgements never clear saved work',async()=>{
 for(const reply of [{data:{status:'queued',code:'AK301'},error:null},{data:{status:'pending'},error:null},{data:null,error:null},{data:null,error:{code:'42501'}}]){
  let p;const s=setup(async name=>['ga_roadmap_receive_suggestion_event','ga_roadmap_answer_local_suggestion'].includes(name)?response(p):reply);p=s.make();await assert.rejects(()=>s.answers.run(p),/not confirmed/);assert.equal(s.answers.list().length,1);
 }
 for(const modify of [r=>r.data.request_id=id(99),r=>r.data.suggestion.user_id=id(2),r=>r.data.suggestion.answer='dismiss',r=>r.data.effect.payload.extra={keep:'changed'},r=>r.data.effect.src_addr.board_id='rm']){
  let p;const s=setup(async()=>{const r=structuredClone(response(p));modify(r);return r});p=s.make();await assert.rejects(()=>s.answers.run(p));assert.equal(s.answers.list().length,1);
 }
});
test('a successful closed retry is final; it never invents another request key',async()=>{
 let p;const s=setup(async name=>['ga_roadmap_receive_suggestion_event','ga_roadmap_answer_local_suggestion'].includes(name)?response(p):{error:null,data:{seq:99,status:'closed',reply:{status:'applied'}}});p=s.make();const r=await s.answers.run(p);await s.answers.confirm(r);s.answers.acknowledge(r);assert.equal(s.answers.list().length,0);
});
test('account switch during the first or second request never applies or cleans up another account',async()=>{
 for(const stage of ['answer','publish']){
  let p,finish,started;const waiting=new Promise(r=>started=r);const s=setup(async name=>{
   if(stage==='answer'||name==='akatsuki_publish'){started();return new Promise(r=>finish=r)}return response(p)
  });p=s.make();const flight=s.answers.run(p);await waiting;s.answers.bind(id(2));assert.equal(s.answers.list().length,0);s.answers.bind(id(1));
  finish(stage==='answer'?response(p):delivered);await assert.rejects(flight,/Account changed/);assert.deepEqual(s.answers.list(),[p]);
 }
});
test('cross-tab slots, saved-byte checks and unforgeable acknowledgement preserve newer edits',async()=>{
 let p,finish;const s=setup(async name=>['ga_roadmap_receive_suggestion_event','ga_roadmap_answer_local_suggestion'].includes(name)?new Promise(r=>finish=r):delivered);p=s.make();const flight=s.answers.run(p);
 const other={...p,requestId:id(99),payload:{...p.payload,seq:26,suggestion_id:'other'}};s.storage.setItem('rm-suggestion-answer-v1:'+p.owner+':'+other.requestId,JSON.stringify(other));finish(response(p));
 const r=await flight;assert.throws(()=>s.answers.acknowledge({...r}),/changed/);await s.answers.confirm(r);s.answers.acknowledge(r);assert.deepEqual(s.answers.list(),[other]);
 const c=setup(async name=>['ga_roadmap_receive_suggestion_event','ga_roadmap_answer_local_suggestion'].includes(name)?response(other):delivered,s.storage),out=await c.answers.run(other);
 c.storage.setItem(c.storage.key(0),JSON.stringify({...other,payload:{...other.payload,reason:'Newer text'}}));assert.throws(()=>c.answers.acknowledge(out),/changed/);assert.equal(c.answers.list()[0].payload.reason,'Newer text');
});
test('quota, corrupt or misplaced saved data never sends and never clears legacy outboxes or offline packs',async()=>{
 let calls=0;const storage=memory();storage.setItem('akatsuki_outbox_rm','legacy');storage.setItem('offline-pack','keep');const s=setup(async()=>{calls++},storage),set=storage.setItem;
 storage.setItem=()=>{throw Error('quota')};assert.throws(()=>s.make(),/quota/);storage.setItem=set;const p=s.make();
 storage.setItem('rm-suggestion-answer-v1:'+p.owner+':'+p.requestId,'broken');assert.throws(()=>s.answers.list());await assert.rejects(()=>s.answers.run(p));assert.equal(calls,0);
 assert.equal(storage.getItem('akatsuki_outbox_rm'),'legacy');assert.equal(storage.getItem('offline-pack'),'keep');
});
test('malformed actions, field and UTF-8 boundaries fail before persistence',()=>{
 const s=setup(async()=>{throw Error('must not send')});for(const p of [null,{}, {...payload,action:'other'},{...payload,seq:1.5},{...payload,seq:0},{...payload,seq:9007199254740992},
  {...payload,reason:'あ'.repeat(1366)},{...payload,suggestion_id:'あ'.repeat(67)},{...payload,day_key:'2026-02-30'},{...payload,user_id:id(2)},{...payload,from_app:''}])assert.throws(()=>s.make(p));
 assert.equal(s.answers.list().length,0);assert.equal(normalizeAnswer({...payload,reason:'x'.repeat(4096)}).reason.length,4096);
 const p=s.make();assert.deepEqual(s.make({...payload,day_key:'2026-11-28'}),p);assert.throws(()=>s.make({...payload,action:'start'}),/waiting/);
});

test('reason whitespace is normalized before saving so multiline reasons have consistent delivery bytes',()=>{
 const s=setup(async()=>{throw Error('must not send')});const p=s.make({...payload,reason:'\n\t Keep 日本語 \n'});assert.equal(p.payload.reason,'Keep 日本語');assert.deepEqual(s.answers.list(),[p]);
});
