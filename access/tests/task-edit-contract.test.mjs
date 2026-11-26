import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTaskEdits} from '../staging/task-edit-contract.ts';
const id=n=>'d0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
const row={id:id(3),parent_id:null,title:'Saved title',done:true,kind:'task',position:0,expanded:true,tags:['daily-routine'],streak:4,streak_day:'2026-11-26',created_at:'2026-11-25T00:00:00Z',updated_at:'2026-11-27T00:00:00Z'};
function setup(client,storage=memory()){
 let n=10;const edits=createTaskEdits({client,storage,requestId:()=>id(n++)});edits.bind(id(1));
 return {edits,storage,make:()=>edits.prepare([{id:id(3),expectedUpdatedAt:'2026-11-25T00:00:00Z',patch:{title:'Saved title'}}])};
}
const reply=p=>({error:null,data:{request_id:p.requestId,replayed:false,tasks:[{...row}]}});
test('failed, denied and uncertain saves keep exact original edits across reload until explicit acknowledgement',async()=>{
 const calls=[];let p;
 const a=setup({rpc:async(name,args)=>{calls.push({name,args});return {error:{code:'42501'}}}});p=a.make();
 await assert.rejects(()=>a.edits.run(p),/stay saved/);assert.deepEqual(a.edits.list(),[p]);
 const b=setup({rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:null}}},a.storage);
 await assert.rejects(()=>b.edits.run(p),/not confirmed/);
 const c=setup({rpc:async(name,args)=>{calls.push({name,args});return reply(p)}},a.storage);
 const result=await c.edits.run(c.edits.list()[0]);assert.deepEqual(c.edits.list(),[p]);
 c.edits.acknowledge(result);assert.deepEqual(c.edits.list(),[]);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1],calls[2]);
});
test('duplicate saves share one call; different drafts cannot replace pending work',async()=>{
 let finish,calls=0;const s=setup({rpc:()=>{calls++;return new Promise(r=>finish=r)}}),p=s.make();
 const a=s.edits.run(p),b=s.edits.run(p);assert.equal(calls,1);assert.deepEqual(s.make(),p);
 assert.throws(()=>s.edits.prepare([{...p.tasks[0],patch:{title:'Different'}}]),/waiting/);assert.throws(()=>s.edits.discard(p),/Wait/);
 finish(reply(p));const result=await a;assert.equal(result,await b);s.edits.acknowledge(result);
});
test('stale versions stay saved; a replay returns newer state without resending a changed version',async()=>{
 let p,conflict=true;const s=setup({rpc:async()=>{if(conflict)return {error:{code:'40001'}};const r=reply(p);r.data.replayed=true;r.data.tasks[0].title='Newer title';return r}});p=s.make();
 await assert.rejects(()=>s.edits.run(p),/task changed/);assert.deepEqual(s.edits.list(),[p]);
 conflict=false;const result=await s.edits.run(p);assert.equal(result.tasks[0].title,'Newer title');s.edits.acknowledge(result);
});
test('late responses and receipt cleanup cannot cross A to B to A',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.make(),pending=s.edits.run(p);
 s.edits.bind(id(2));assert.deepEqual(s.edits.list(),[]);await assert.rejects(()=>s.edits.run(p),/Account changed/);
 s.edits.bind(id(1));await assert.rejects(()=>s.edits.run(p),/Wait/);
 finish(reply(p));await assert.rejects(pending,/Account changed/);assert.deepEqual(s.edits.list(),[p]);
});
test('storage quota failure sends nothing; malformed owner storage remains available for review',async()=>{
 let calls=0;const storage=memory(),set=storage.setItem;storage.setItem=()=>{throw Error('quota')};
 const s=setup({rpc:async()=>{calls++}},storage);assert.throws(()=>s.make(),/quota/);assert.equal(calls,0);storage.setItem=set;
 const p=s.make();storage.setItem(storage.key(0),JSON.stringify({...p,owner:id(2)}));assert.throws(()=>s.edits.list(),/Account changed/);
 await assert.rejects(()=>s.edits.run(p));assert.equal(calls,0);assert.ok(storage.getItem(storage.key(0)));
});
test('invalid, foreign, duplicate, incomplete or unchanged first acknowledgements cannot clear work',async()=>{
 for(const change of [r=>r.data.tasks=[],r=>r.data.tasks.push(r.data.tasks[0]),r=>r.data.tasks[0].user_id=id(2),r=>r.data.tasks[0].id=id(9),
  r=>r.data.tasks[0].updated_at='bad',r=>delete r.data.tasks[0].streak,r=>r.data.tasks[0].title='Old title',r=>r.data.tasks[0].updated_at='2026-11-25T00:00:00Z']){
  let p;const s=setup({rpc:async()=>{const r=reply(p);change(r);return r}});p=s.make();await assert.rejects(()=>s.edits.run(p),/not confirmed/);assert.deepEqual(s.edits.list(),[p]);
 }
});
test('newer cross-tab work survives response, acknowledgement and stale discard',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.make(),pending=s.edits.run(p),next={...p,requestId:id(99)};
 s.storage.setItem(s.storage.key(0),JSON.stringify(next));finish(reply(p));await assert.rejects(pending,/Newer saved/);assert.deepEqual(s.edits.list(),[next]);
 const b=setup({rpc:async()=>reply(next)},s.storage),result=await b.edits.run(next);b.storage.setItem(b.storage.key(0),JSON.stringify(p));
 assert.throws(()=>b.edits.acknowledge(result),/changed/);b.edits.discard(next);assert.deepEqual(b.edits.list(),[p]);
});
test('forged receipts and failed storage cleanup keep retry; caller mutations are detected',async()=>{
 let p;const s=setup({rpc:async()=>reply(p)});p=s.make();const result=await s.edits.run(p);
 assert.throws(()=>s.edits.acknowledge({...result}),/changed/);s.storage.removeItem=()=>{throw Error('Storage unavailable')};
 assert.throws(()=>s.edits.acknowledge(result),/Storage unavailable/);assert.deepEqual(s.edits.list(),[p]);
 p.tasks[0].patch.title='Mutated after saving';await assert.rejects(()=>s.edits.run(p),/changed/);
});
test('field, record-count and UTF-8 byte limits apply before persistence',()=>{
 const s=setup({rpc:async()=>{throw Error('must not send')}}),base={id:id(3),expectedUpdatedAt:'2026-11-25T00:00:00Z',patch:{title:'Name'}};
 for(const patch of [{title:'あ'.repeat(1366)},{tags:['あ'.repeat(27)]},{done:false},{tags:['wf']},{tags:['x','x']},{expanded:null}])
  assert.throws(()=>s.edits.prepare([{...base,patch}]),/Invalid/);
 for(const n of [0,101])assert.throws(()=>s.edits.prepare(Array.from({length:n},(_,i)=>({...base,id:id(100+i)}))),/Invalid/);
 assert.throws(()=>s.edits.prepare(Array.from({length:20},(_,i)=>({...base,id:id(100+i),patch:{title:'あ'.repeat(1000)}}))),/oversized/);
 assert.deepEqual(s.edits.list(),[]);
 const input={...base,patch:{title:'Original'}};const p=s.edits.prepare([input]);input.patch.title='Caller change';assert.equal(p.tasks[0].patch.title,'Original');
});
