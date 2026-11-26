import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createComparisonEdits} from '../staging/comparison-contract.ts';
const id=n=>'a0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const stamp='2026-11-25T00:00:00Z';
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
const reply=(p,weights={price:3})=>({error:null,data:{request_id:p.requestId,replayed:false,
 comparison:{id:p.comparisonId,title:'Comparison',updated_at:'2026-11-26T00:00:00Z',weights,chosen_item:null},items:[]}});
function setup(client,storage=memory()){
 let n=10;const edits=createComparisonEdits({client,storage,requestId:()=>id(n++)});edits.bind(id(1));
 return {edits,storage,make:()=>edits.prepare(id(3),stamp,{weights:{price:3}})};
}
test('denial and uncertain acknowledgements keep one exact original request across reload',async()=>{
 let p,calls=[];const s=setup({rpc:async(name,args)=>{calls.push({name,args});return {error:{code:'42501'}}}});
 p=s.make();await assert.rejects(()=>s.edits.run(p),/retry stays saved/);
 const again=setup({rpc:async(name,args)=>{calls.push({name,args});return reply(p)}},s.storage);
 assert.deepEqual(again.edits.list(),[p]);const result=await again.edits.run(again.edits.list()[0]);
 assert.deepEqual(calls[0],calls[1]);assert.equal(result.comparison.weights.price,3);assert.deepEqual(again.edits.list(),[]);
});
test('concurrent clicks share one request; null success never clears the saved retry',async()=>{
 let resolve,calls=0;const s=setup({rpc:()=>{calls++;return new Promise(r=>resolve=r)}}),p=s.make();
 const x=s.edits.run(p),y=s.edits.run(p);assert.equal(calls,1);
 resolve({data:null,error:null});await assert.rejects(x,/not confirmed/);await assert.rejects(y,/not confirmed/);
 assert.deepEqual(s.edits.list(),[p]);assert.equal(s.edits.busy(),false);
});
test('a different proposed edit cannot overwrite the first unresolved change',()=>{
 const s=setup({rpc:async()=>{throw Error('not called')}}),p=s.make();
 assert.throws(()=>s.edits.prepare(id(3),stamp,{chosen_item:id(4)}),/already waiting/);
 assert.deepEqual(s.edits.list(),[p]);assert.deepEqual(s.make(),p);
});
test('stale responses require review; replayed current values override the old intent',async()=>{
 let p,mode='stale';const s=setup({rpc:async()=>mode==='stale'?{error:{code:'40001'}}:reply(p,{price:1})});p=s.make();
 await assert.rejects(()=>s.edits.run(p),/changed elsewhere/);assert.deepEqual(s.edits.list(),[p]);
 mode='current';assert.equal((await s.edits.run(p)).comparison.weights.price,1);
});
test('account switches suppress late replies and preserve the original account pending edit',async()=>{
 let resolve;const s=setup({rpc:()=>new Promise(r=>resolve=r)}),p=s.make(),promise=s.edits.run(p);
 s.edits.bind(id(2));assert.deepEqual(s.edits.list(),[]);await assert.rejects(()=>s.edits.run(p),/Account changed/);
 s.edits.bind(id(1));resolve(reply(p));await assert.rejects(promise,/Account changed/);assert.deepEqual(s.edits.list(),[p]);
});
test('quota and malformed owned storage prevent transmission without deleting saved data',async()=>{
 let calls=0;const store=memory(),set=store.setItem;store.setItem=()=>{throw Error('quota')};
 const s=setup({rpc:async()=>{calls++;return {data:null,error:null}}},store);
 assert.throws(()=>s.make(),/quota/);assert.equal(calls,0);store.setItem=set;
 const p=s.make(),key=store.key(0);store.setItem(key,JSON.stringify({...p,owner:id(2)}));
 assert.throws(()=>s.edits.list(),/Account changed/);await assert.rejects(()=>s.edits.run(p));
 assert.ok(store.getItem(key));assert.equal(calls,0);
});
test('newer work from another tab is never removed or returned as the older result',async()=>{
 let resolve;const s=setup({rpc:()=>new Promise(r=>resolve=r)}),p=s.make(),promise=s.edits.run(p);
 const newer={...p,requestId:id(99),patch:{weights:{price:1}}};s.storage.setItem(s.storage.key(0),JSON.stringify(newer));
 resolve(reply(p));await assert.rejects(promise,/newer saved/);assert.deepEqual(s.edits.list(),[newer]);
});
test('mismatched acknowledgement, foreign product rows and foreign owner fields fail closed',async()=>{
 for(const change of [
  r=>r.data.request_id=id(99),
  r=>r.data.comparison.user_id=id(2),
  r=>r.data.comparison.chosen_item=id(8),
  r=>r.data.items=[{id:id(8),name:'Foreign',comparison_id:id(99)}],
 ]){
  let p;const s=setup({rpc:async()=>{const r=reply(p);change(r);return r}});p=s.make();
  await assert.rejects(()=>s.edits.run(p),/not confirmed/);assert.deepEqual(s.edits.list(),[p]);
 }
});
test('discard is explicit and cannot clear an in-flight or newer request',async()=>{
 let resolve;const s=setup({rpc:()=>new Promise(r=>resolve=r)}),p=s.make(),promise=s.edits.run(p);
 assert.throws(()=>s.edits.discard(p),/Wait/);resolve({error:{code:'42501'}});await assert.rejects(promise);
 const next={...p,requestId:id(88)};s.storage.setItem(s.storage.key(0),JSON.stringify(next));
 s.edits.discard(p);assert.deepEqual(s.edits.list(),[next]);s.edits.discard(next);assert.deepEqual(s.edits.list(),[]);
});
