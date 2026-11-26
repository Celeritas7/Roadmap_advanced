import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDailyResets} from '../staging/daily-reset-contract.ts';
import {dayKey} from '../../src/lib/dailyReset.ts';
const id=n=>'c0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
function setup(client,storage=memory()){
 let n=10;const resets=createDailyResets({client,storage,requestId:()=>id(n++)});resets.bind(id(1));
 return {resets,storage,make:()=>resets.prepare([{id:id(3),expectedUpdatedAt:'2026-11-25T00:00:00Z'}],'2026-11-27','Asia/Tokyo')};
}
const reply=(p,done=false)=>({error:null,data:{request_id:p.requestId,replayed:true,day_key:p.day,timezone:p.timezone,tasks:[{id:id(3),title:'Keep title',done,tags:['daily-routine'],streak:4,streak_day:'2026-11-26',updated_at:'2026-11-27T00:00:00Z'}]}});
test('reset denial and uncertain acknowledgement preserve an exact original-day retry across reload',async()=>{
 let p;const calls=[];const a=setup({rpc:async(name,args)=>{calls.push({name,args});return {error:{code:'42501'}}}});p=a.make();
 await assert.rejects(()=>a.resets.run(p),/stays saved/);assert.deepEqual(a.resets.list(),[p]);
 const b=setup({rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:null}}},a.storage);
 await assert.rejects(()=>b.resets.run(p),/not confirmed/);
 const c=setup({rpc:async(name,args)=>{calls.push({name,args});return reply(p)}},a.storage);
 const result=await c.resets.run(c.resets.list()[0]);assert.deepEqual(c.resets.list(),[p]);
 c.resets.acknowledge(result);assert.deepEqual(c.resets.list(),[]);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1],calls[2]);
});
test('duplicate reset attempts share one call; changed day or targets cannot silently replace the saved intent',async()=>{
 let finish,calls=0;const s=setup({rpc:()=>{calls++;return new Promise(r=>finish=r)}}),p=s.make();
 const a=s.resets.run(p),b=s.resets.run(p);assert.equal(calls,1);assert.deepEqual(s.make(),p);
 assert.throws(()=>s.resets.prepare(p.tasks,'2026-11-28',p.timezone),/waiting/);assert.throws(()=>s.resets.discard(p),/Wait/);
 finish(reply(p));const result=await a;assert.equal(result,await b);s.resets.acknowledge(result);
});
test('conflicts retain the old version; replay may return a newer completed task',async()=>{
 let p,conflict=true;const s=setup({rpc:async()=>conflict?{error:{code:'40001'}}:reply(p,true)});p=s.make();
 await assert.rejects(()=>s.resets.run(p),/reset day changed/);assert.deepEqual(s.resets.list(),[p]);
 conflict=false;const result=await s.resets.run(p);assert.equal(result.tasks[0].done,true);assert.equal(s.resets.list().length,1);
 s.resets.acknowledge(result);assert.equal(s.resets.list().length,0);
});
test('late reset responses and cleanup cannot cross A to B to A',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.make(),pending=s.resets.run(p);
 s.resets.bind(id(2));assert.deepEqual(s.resets.list(),[]);await assert.rejects(()=>s.resets.run(p),/Account changed/);
 s.resets.bind(id(1));finish(reply(p));await assert.rejects(pending,/Account changed/);assert.deepEqual(s.resets.list(),[p]);
});
test('quota failure prevents a request; malformed storage is kept for review',async()=>{
 let calls=0;const storage=memory(),set=storage.setItem;storage.setItem=()=>{throw Error('quota')};
 const s=setup({rpc:async()=>{calls++}},storage);assert.throws(()=>s.make(),/quota/);assert.equal(calls,0);storage.setItem=set;
 const p=s.make();storage.setItem(storage.key(0),JSON.stringify({...p,owner:id(2)}));assert.throws(()=>s.resets.list(),/Account changed/);
 await assert.rejects(()=>s.resets.run(p));assert.equal(calls,0);assert.ok(storage.getItem(storage.key(0)));
});
test('foreign, duplicate, missing and malformed acknowledgement rows never clear a pending reset',async()=>{
 for(const change of [r=>r.data.tasks=[],r=>r.data.tasks.push(r.data.tasks[0]),r=>r.data.tasks[0].user_id=id(2),r=>r.data.tasks[0].id=id(9),r=>r.data.tasks[0].updated_at='bad',r=>r.data.day_key='2026-11-28']){
  let p;const s=setup({rpc:async()=>{const r=reply(p);change(r);return r}});p=s.make();await assert.rejects(()=>s.resets.run(p),/not confirmed/);assert.deepEqual(s.resets.list(),[p]);
 }
});
test('a newer cross-tab reset is preserved both before response and before acknowledgement',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.make(),pending=s.resets.run(p),next={...p,requestId:id(99)};
 s.storage.setItem(s.storage.key(0),JSON.stringify(next));finish(reply(p));await assert.rejects(pending,/newer saved/);assert.deepEqual(s.resets.list(),[next]);
 const b=setup({rpc:async()=>reply(next)},s.storage),result=await b.resets.run(next);b.storage.setItem(b.storage.key(0),JSON.stringify(p));
 assert.throws(()=>b.resets.acknowledge(result),/changed/);assert.deepEqual(b.resets.list(),[p]);
});
test('acknowledgement requires this controller verified result and failed storage cleanup stays retryable',async()=>{
 let p;const s=setup({rpc:async()=>reply(p)});p=s.make();const result=await s.resets.run(p);
 assert.throws(()=>s.resets.acknowledge({...result}),/changed/);
 s.storage.removeItem=()=>{throw Error('Storage unavailable')};assert.throws(()=>s.resets.acknowledge(result),/Storage unavailable/);assert.deepEqual(s.resets.list(),[p]);
});
test('the existing four-hour logical-day boundary is preserved',()=>{
 const previous=process.env.TZ;try{process.env.TZ='Asia/Tokyo';
  assert.equal(dayKey(new Date('2026-11-27T03:59:59+09:00')),'2026-11-26');assert.equal(dayKey(new Date('2026-11-27T04:00:00+09:00')),'2026-11-27');
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
});
