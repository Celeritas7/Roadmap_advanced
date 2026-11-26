import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createComparisonImports,normalizeImport} from '../staging/comparison-import-contract.ts';
const id=n=>'b0000000-0000-4000-8000-'+String(n).padStart(12,'0'),revision='a'.repeat(64);
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
const doc=()=>({title:'Import 日本語',items:[{id:id(4),name:'Product',price:50}]});
const snapshot=(title='Current')=>({revision,comparison:{id:id(3),task_id:id(2),title,weights:{price:2},chosen_item:id(4),updated_at:'2026-11-27T00:00:00Z'},items:[{id:id(4),comparison_id:id(3),name:'Product'}]});
function setup(client,storage=memory()){
 let n=10;const imports=createComparisonImports({client,storage,requestId:()=>id(n++)});imports.bind(id(1));
 return {imports,storage,make:()=>imports.prepare({comparisonId:id(3),taskId:id(2),expectedRevision:revision,document:doc()})};
}
const reply=p=>({error:null,data:{...snapshot(),request_id:p.requestId,replayed:true}});
test('import denial and lost acknowledgement retain one original request across reload',async()=>{
 const calls=[];let p;const a=setup({rpc:async(n,args)=>{calls.push({n,args});return {error:{code:'42501'}}}});p=a.make();
 await assert.rejects(()=>a.imports.run(p),/stays saved/);assert.deepEqual(a.imports.list(),[p]);
 const b=setup({rpc:async(n,args)=>{calls.push({n,args});return {data:null,error:null}}},a.storage);
 await assert.rejects(()=>b.imports.run(b.imports.list()[0]),/not confirmed/);
 const c=setup({rpc:async(n,args)=>{calls.push({n,args});return reply(p)}},a.storage);
 assert.equal((await c.imports.run(c.imports.list()[0])).comparison.title,'Current');
 assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1],calls[2]);assert.deepEqual(c.imports.list(),[]);
});
test('repeated confirm shares one request and a different import cannot replace it',async()=>{
 let finish,calls=0;const s=setup({rpc:()=>{calls++;return new Promise(r=>finish=r)}}),p=s.make();
 const a=s.imports.run(p),b=s.imports.run(p);assert.equal(calls,1);assert.deepEqual(s.make(),p);
 assert.throws(()=>s.imports.prepare({...p,document:{...doc(),title:'Different'}}),/already waiting/);
 finish(reply(p));assert.deepEqual(await a,await b);
});
test('conflicts keep the original revision and current replay never reinstates the old import',async()=>{
 let p,fail=true;const s=setup({rpc:async()=>fail?{error:{code:'40001'}}:{error:null,data:{...reply(p).data,...snapshot('Newer saved edit')}}});p=s.make();
 await assert.rejects(()=>s.imports.run(p),/changed elsewhere/);assert.equal(s.imports.list()[0].expectedRevision,revision);
 fail=false;assert.equal((await s.imports.run(p)).comparison.title,'Newer saved edit');
});
test('preview and import late results are rejected across A to B to A',async()=>{
 for(const kind of ['preview','save']){
  let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.make();
  const promise=kind==='preview'?s.imports.preview(id(3)):s.imports.run(p);
  s.imports.bind(id(2));assert.deepEqual(s.imports.list(),[]);await assert.rejects(()=>s.imports.run(p),/Account changed/);
  s.imports.bind(id(1));finish(kind==='preview'?{data:snapshot(),error:null}:reply(p));await assert.rejects(promise,/Account changed/);
  assert.deepEqual(s.imports.list(),[p]);
 }
});
test('storage refusal stops transmission and a newer tab retry is not cleared',async()=>{
 let calls=0,finish;const storage=memory(),set=storage.setItem;storage.setItem=()=>{throw Error('quota')};
 const s=setup({rpc:()=>{calls++;return new Promise(r=>finish=r)}},storage);assert.throws(()=>s.make(),/quota/);assert.equal(calls,0);storage.setItem=set;
 const p=s.make(),promise=s.imports.run(p),newer={...p,requestId:id(88)};storage.setItem(storage.key(0),JSON.stringify(newer));
 finish(reply(p));await assert.rejects(promise,/newer saved/);assert.deepEqual(s.imports.list(),[newer]);
});
test('malformed or foreign saved imports and unconfirmed results leave storage intact',async()=>{
 for(const mutate of [r=>r.data.request_id=id(88),r=>r.data.revision=null,r=>r.data.comparison.user_id=id(2),r=>r.data.items[0].comparison_id=id(99)]){
  let p;const s=setup({rpc:async()=>{const r=reply(p);mutate(r);return r}});p=s.make();await assert.rejects(()=>s.imports.run(p),/not confirmed/);assert.deepEqual(s.imports.list(),[p]);
 }
 let called=false;const s=setup({rpc:async()=>{called=true}}),p=s.make();s.storage.setItem(s.storage.key(0),JSON.stringify({...p,owner:id(2)}));
 assert.throws(()=>s.imports.list(),/Account changed/);await assert.rejects(()=>s.imports.run(p));assert.equal(called,false);
});
test('discard never clears an inflight or newer request; cleanup failure keeps the original retry',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.make(),pending=s.imports.run(p);
 assert.throws(()=>s.imports.discard(p),/Wait/);s.storage.removeItem=()=>{throw Error('Storage unavailable')};finish(reply(p));
 await assert.rejects(pending,/Storage unavailable/);assert.deepEqual(s.imports.list(),[p]);
});
test('untrusted import schema rejects scripts, ownership fields, empty replacement and excessive data',()=>{
 for(const value of [
  {...doc(),items:[]},{...doc(),user_id:id(2)},{...doc(),weights:{}},
  {...doc(),items:[...doc().items,...doc().items]},
  {...doc(),items:Array.from({length:101},(_,n)=>({id:id(100+n),name:'N'}))},
  {...doc(),notes:'日'.repeat(90000)},
  ...[{url:'javascript:alert(1)'},{image_url:'data:image/svg+xml,x'},{rating:6},{price:-1},{review_count:1.1},
   {currency:null},{pros:[{}]},{extra:{html:{script:'x'}}},{user_id:id(2)}].map(v=>({...doc(),items:[{...doc().items[0],...v}]})),
 ])assert.throws(()=>normalizeImport(value));
 assert.equal(normalizeImport({...doc(),notes:'<script>text only</script>'}).notes,'<script>text only</script>');
});
