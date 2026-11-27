import {test} from 'node:test';import assert from 'node:assert/strict';import {createCompletions} from '../staging/completion-contract.ts';
const id=n=>'f9000000-0000-4000-8000-'+String(n).padStart(12,'0');
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
const address={board_id:'a',item_key:'study:日本語',sub_id:'task',extra:{keep:'exact'}};
const row={id:id(3),parent_id:null,title:'Keep notes',kind:'task',done:true,tags:['wf','lang'],expanded:true,position:0,streak:3,streak_day:null,created_at:'2026-11-27T00:00:00Z',updated_at:'2026-11-27T00:00:00Z'};
function setup(options={},storage=memory()){
 const calls=[];let published=false,state='unpublished',n=10;
 const prepared=args=>({requested_id:args.p_request_id,request_id:id(10),task_id:id(3),closed:false,publishable:true,effect:{from_app:'rm',to_app:'wf',kind:'task.done',src_clock:null,src_addr:address,
  idempotency_key:'rm:done:'+id(10),payload:{...address,at:'2026-11-27T00:00:00Z',suggestion_id:null}}});
 const response=()=>({request_id:id(10),task_id:id(3),state,reply_seq:['unpublished','pending'].includes(state)?0:30,tasks:['unpublished','pending'].includes(state)?[]:[structuredClone(row)],suggestion:null});
 const c=createCompletions({storage,uuid:()=>id(n++),client:{rpc:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});if(options.rpc){const custom=await options.rpc(name,args,{prepared,response});if(custom!==undefined)return custom}
  if(name==='ga_roadmap_prepare_done')return {error:null,data:prepared(args)};
  if(name==='ga_roadmap_reconcile_done')return {error:null,data:response()};
  if(name==='akatsuki_publish'){published=true;state='pending';return {error:null,data:[{seq:20,status:'pending'}]}};
  if(name==='ga_roadmap_done_recovery')return {error:null,data:[]};throw Error(name);
 }}});c.bind(id(1));return {c,storage,calls,make:()=>c.prepare(id(3)),state:s=>state=s,published:()=>published}
}
test('persist before publish; lost publication reply and reload check the saved request instead of sending twice',async()=>{
 let pub;const s=setup({rpc:async(name,args)=>{if(name==='akatsuki_publish'){pub=args.p;s.state('pending');return {error:{code:'504'}}}}}),p=s.make();
 assert.equal(s.storage.length,1);await assert.rejects(()=>s.c.run(p),/publication was not confirmed/);assert.equal(pub.idempotency_key,'rm:done:'+id(10));assert.deepEqual(pub.src_addr,address);
 const r=setup({},s.storage);r.state('pending');const pending=await r.c.run(r.c.list()[0]);assert.equal(pending.state,'pending');assert.equal(r.published(),false);assert.throws(()=>r.c.acknowledge(pending),/not confirmed/);
 r.state('applied');const confirmed=await r.c.run(r.c.list()[0],false);r.c.acknowledge(confirmed);assert.equal(r.c.list().length,0);assert.equal(r.published(),false);
});
test('a retry before hub acceptance republishes the exact stored effect, and a new completion gets a new request id',async()=>{
 const effects=[];const s=setup({rpc:async(name,args)=>{if(name==='akatsuki_publish'){effects.push(args.p);return {error:{code:'504'}}}}}),p=s.make();
 await assert.rejects(()=>s.c.run(p));await assert.rejects(()=>s.c.run(p));assert.deepEqual(effects[0],effects[1]);s.state('applied');s.c.acknowledge(await s.c.run(p));assert.notEqual(s.make().requestId,p.requestId);
});
test('contract errors block publication retries but still allow checking replies without resending',async()=>{
 for(const code of ['AK103','AK201']){const s=setup({rpc:async name=>name==='akatsuki_publish'?{error:{code}}:undefined}),p=s.make();await assert.rejects(()=>s.c.run(p),/contract requires review/);
  const saved=s.c.list()[0];assert.equal(saved.blocked,code);await assert.rejects(()=>s.c.run(saved),/contract requires review/);assert.equal(s.calls.filter(c=>c.name==='akatsuki_publish').length,1);
  assert.equal((await s.c.run(saved,false)).state,'unpublished');s.state('unknown');s.c.acknowledge(await s.c.run(saved,false));assert.equal(s.c.list().length,0);
 }
});
test('malformed and foreign replies cannot publish or clear recovery; queued results are not confirmation',async()=>{
 for(const mutate of [r=>r.request_id=id(99),r=>r.task_id=id(99),r=>r.reply_seq=2,r=>r.state='invented',r=>r.tasks=[{...row,user_id:id(2)}]]){
  const s=setup({rpc:async(name,args,base)=>{if(name==='ga_roadmap_reconcile_done'){const r=base.response();mutate(r);return {error:null,data:r}}}}),p=s.make();await assert.rejects(()=>s.c.run(p),/not confirmed/);assert.equal(s.published(),false);assert.equal(s.c.list().length,1);
 }
 const s=setup({rpc:async name=>name==='akatsuki_publish'?{error:null,data:[{seq:20,status:'queued'}]}:undefined});await assert.rejects(()=>s.c.run(s.make()),/not confirmed/);assert.equal(s.c.list().length,1);
});
test('account changes at prepare, publish or reconcile never clean up the original owner, including A→B→A',async()=>{
 for(const stage of ['ga_roadmap_prepare_done','akatsuki_publish','ga_roadmap_reconcile_done']){
  let finish,started;const ready=new Promise(r=>started=r);const s=setup({rpc:async(name,args,base)=>{if(name===stage){started();await new Promise(r=>finish=r);return {error:null,data:stage==='ga_roadmap_prepare_done'?base.prepared(args):stage==='ga_roadmap_reconcile_done'?base.response():[{seq:20,status:'pending'}]}}}}),p=s.make(),work=s.c.run(p);
  await ready;s.c.bind(id(2));assert.equal(s.c.list().length,0);s.c.bind(id(1));finish();await assert.rejects(work,/Account changed/);assert.deepEqual(s.c.list(),[p]);
 }
});
test('forged acknowledgements, quota failure and concurrent-tab changes retain recoverable data and legacy offline bytes',async()=>{
 const s=setup();s.storage.setItem('offline-pack','keep');s.storage.setItem('rm-ak-reply-seq','unowned');s.storage.setItem('rm-ak-pending-done','unowned');const set=s.storage.setItem;
 s.storage.setItem=()=>{throw Error('quota')};assert.throws(s.make,/quota/);assert.equal(s.calls.length,0);s.storage.setItem=set;
 const p=s.make();s.state('applied');const r=await s.c.run(p,false);assert.throws(()=>s.c.acknowledge({...r}),/changed/);
 s.storage.setItem('rm-completion-v1:'+p.owner+':'+p.taskId,JSON.stringify({...p,requestId:id(99)}));assert.throws(()=>s.c.acknowledge(r),/changed/);
 assert.equal(s.storage.getItem('offline-pack'),'keep');assert.equal(s.storage.getItem('rm-ak-reply-seq'),'unowned');assert.equal(s.storage.getItem('rm-ak-pending-done'),'unowned');
});
test('discovery preserves server reply order and original per-task slots without reading legacy cursors',async()=>{
 const s=setup({rpc:async name=>name==='ga_roadmap_done_recovery'?{error:null,data:[{request_id:id(40),task_id:id(4),suggestion_id:null},{request_id:id(20),task_id:id(3),suggestion_id:null}]}:undefined});const original=s.make(),pending=await s.c.discover();
 assert.deepEqual(pending.map(p=>p.taskId),[id(4),id(3)]);assert.equal(pending[1].requestId,original.requestId);assert.equal(s.calls.length,1);
});
test('corrupt storage and invalid identifiers fail before sending',async()=>{
 const s=setup();assert.throws(()=>s.c.prepare('bad'));assert.throws(()=>s.c.prepare(id(4),'あ'.repeat(67)));const p=s.make();s.storage.setItem('rm-completion-v1:'+p.owner+':'+p.taskId,'corrupt');
 assert.throws(()=>s.c.list());await assert.rejects(()=>s.c.run(p));await assert.rejects(()=>s.c.discover());assert.equal(s.calls.length,0);
});
