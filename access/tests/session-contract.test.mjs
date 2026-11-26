import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSessionActions} from '../staging/session-contract.ts';
const id=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
const memory=()=>{const m=new Map();return{get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
const reply=(p,done=p.done)=>({data:{request_id:p.requestId,task:{id:p.taskId,done,updated_at:'2026-11-26T00:00:00Z'},session:{id:id(99),task_id:p.taskId,day_key:p.day}},error:null});
function setup(client,storage=memory()) {
 let n=10,currentDay='2026-11-26';const actions=createSessionActions({client,storage,requestId:()=>id(n++),logicalDay:()=>currentDay});actions.bind(id(1));
 return {actions,storage,day:d=>currentDay=d,make:()=>actions.prepare('daily',id(3),{done:true,expectedUpdatedAt:'2026-11-25T00:00:00Z'})};
}
test('failed writes keep the original action and day across reload; confirmed retry removes only that action',async()=>{
 let calls=0,p;const s=setup({rpc:async()=>{calls++;return calls===1?{error:{code:'42501'}}:reply(p)}});
 p=s.make();await assert.rejects(()=>s.actions.run(p),/retry is still saved/);assert.deepEqual(s.actions.list(),[p]);
 s.day('2026-11-27');assert.deepEqual(s.make(),p);
 const again=setup({rpc:async(_name,args)=>{assert.equal(args.p_day_key,'2026-11-26');return reply(p)}},s.storage);
 assert.equal((await again.actions.run(again.make())).task.done,true);assert.deepEqual(again.actions.list(),[]);
});
test('unknown acknowledgement and repeated attempts use one persisted request and never duplicate concurrent calls',async()=>{
 let resolve,calls=0;const s=setup({rpc:()=>{calls++;return new Promise(r=>resolve=r)}});const p=s.make();
 const a=s.actions.run(p),b=s.actions.run(p);assert.equal(calls,1);resolve({data:null,error:null});
 await assert.rejects(a,/not confirmed/);await assert.rejects(b,/not confirmed/);assert.deepEqual(s.actions.list(),[p]);
});
test('start requires a returned UUID and retains the launch day without blocking the study destination',async()=>{
 let args;const s=setup({rpc:async(_name,a)=>{args=a;return {data:null,error:null}}});
 const p=s.actions.prepare('start',id(3));await assert.rejects(()=>s.actions.run(p),/not confirmed/);
 assert.equal(args.p_day_key,p.day);assert.equal(s.actions.list().length,1);
});
test('account switches prevent replay and suppress late acknowledgements without erasing original work',async()=>{
 let resolve;const s=setup({rpc:()=>new Promise(r=>resolve=r)});const p=s.make(),pending=s.actions.run(p);
 s.actions.bind(id(2));assert.deepEqual(s.actions.list(),[]);await assert.rejects(()=>s.actions.run(p),/Account changed/);
 s.actions.bind(id(1));resolve(reply(p));await assert.rejects(pending,/Account changed/);assert.deepEqual(s.actions.list(),[p]);
});
test('quota failure stops before any write; invalid stored payloads are never sent',async()=>{
 let calls=0;const storage=memory();storage.setItem=()=>{throw Error('quota')};const s=setup({rpc:async()=>{calls++}},storage);
 assert.throws(()=>s.make(),/quota/);assert.equal(calls,0);
 const other=setup({rpc:async()=>{calls++}});const p=other.make();other.storage.setItem(other.storage.key(0),JSON.stringify({...p,owner:id(2)}));
 assert.throws(()=>other.actions.list(),/Account changed/);await assert.rejects(()=>other.actions.run(p));assert.equal(calls,0);
});
test('a replay may return a newer undone task; the client must not restore its old intended value',async()=>{
 let p;const s=setup({rpc:async()=>reply(p,false)});p=s.make();assert.equal((await s.actions.run(p)).task.done,false);
});
