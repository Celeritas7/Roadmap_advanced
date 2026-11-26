import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTaskCreations,creationDraft,normalizeCreation} from '../staging/task-creation-contract.ts';
const id=n=>'f0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const draft={kind:'task',parent_id:id(3),items:[{title:'Keep 日本語 <script>text</script>',tags:['home']}]};
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
function setup(client,storage=memory()){
 let n=10;const creates=createTaskCreations({client,storage,uuid:()=>id(n++)});creates.bind(id(1));return {creates,storage,make:()=>creates.prepare(draft)};
}
const row=(item,parent)=>({...item,parent_id:parent,kind:'task',done:false,expanded:true,position:0,streak:0,streak_day:null,created_at:'2026-11-26T00:00:00Z',updated_at:'2026-11-26T00:00:00Z'});
const reply=p=>({error:null,data:{request_id:p.requestId,replayed:false,tasks:p.payload.items.map(t=>row(t,p.payload.parent_id))}});
test('denied/lost creation preserves exact titles, tags, parent and identity across reload',async()=>{
 const calls=[];const a=setup({rpc:async(name,args)=>{calls.push({name,args});return {error:{code:'42501'}}}}),p=a.make();
 await assert.rejects(()=>a.creates.run(p),/stays saved/);assert.deepEqual(a.creates.list(),[p]);
 const b=setup({rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:null}}},a.storage);await assert.rejects(()=>b.creates.run(p),/not confirmed/);
 const c=setup({rpc:async(name,args)=>{calls.push({name,args});return reply(p)}},a.storage),result=await c.creates.run(c.creates.list()[0]);
 assert.deepEqual(c.creates.list(),[p]);c.creates.acknowledge(result);assert.deepEqual(c.creates.list(),[]);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1],calls[2]);
 assert.deepEqual(result.submitted,draft);assert.equal(result.tasks[0].title,draft.items[0].title);assert.equal(c.creates.confirmation(),result);
});
test('duplicate submissions share one request; another task or batch cannot replace an unresolved creation',async()=>{
 let finish,calls=0;const s=setup({rpc:()=>{calls++;return new Promise(r=>finish=r)}}),p=s.make(),a=s.creates.run(p),b=s.creates.run(p);
 assert.equal(calls,1);assert.deepEqual(s.make(),p);assert.throws(()=>s.creates.prepare({...draft,parent_id:null}),/waiting/);
 assert.throws(()=>s.creates.discard(p),/Wait/);finish(reply(p));const result=await a;assert.equal(result,await b);s.creates.acknowledge(result);
});
test('capture validates every task and its root/folder before confirmation; changed current rows are allowed only on replay',async()=>{
 let p;const capture={kind:'capture',text:'buy paper!, buy pens',items:[
  {title:'buy paper',tags:['parked','high'],folder:'Shopping'}, {title:'buy pens',tags:['parked'],folder:'Shopping'}]};
 const response=()=>({error:null,data:{request_id:p.requestId,replayed:false,tasks:[
  {...row({id:id(40),title:'Captured',tags:['inbox']},null),kind:'group'},
  {...row({id:id(41),title:'Shopping',tags:['shop']},id(40)),kind:'group'},
  ...p.payload.items.map(({folder:_,...t})=>row(t,id(41)))]}});
 let change=()=>{};const s=setup({rpc:async()=>{const r=response();change(r);return r}});p=s.creates.prepare(capture);
 for(const alter of [r=>r.data.tasks.pop(),r=>r.data.tasks.push(r.data.tasks[0]),r=>r.data.tasks[0].title='Wrong root',
  r=>r.data.tasks[1].parent_id=id(99),r=>r.data.tasks[2].title='Wrong task',r=>r.data.tasks[2].tags=[],r=>r.data.tasks[2].done=true]){
  change=alter;await assert.rejects(()=>s.creates.run(p));assert.equal(s.creates.list().length,1);
 }
 change=r=>{r.data.replayed=true;r.data.tasks[2].title='Later edit';r.data.tasks[2].parent_id=null};
 const result=await s.creates.run(p);assert.deepEqual(result.itemIds,p.payload.items.map(t=>t.id));assert.equal(result.tasks[2].title,'Later edit');assert.deepEqual(result.submitted,capture);s.creates.acknowledge(result);
});
test('account changes reject late responses and acknowledgement including A to B to A',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.make(),pending=s.creates.run(p);
 s.creates.bind(id(2));assert.deepEqual(s.creates.list(),[]);await assert.rejects(()=>s.creates.run(p),/Account changed/);
 s.creates.bind(id(1));await assert.rejects(()=>s.creates.run(p),/Wait/);finish(reply(p));await assert.rejects(pending,/Account changed/);
 assert.deepEqual(s.creates.list(),[p]);const b=setup({rpc:async()=>reply(p)},s.storage),r=await b.creates.run(p);
 b.creates.bind(id(2));b.creates.bind(id(1));assert.throws(()=>b.creates.acknowledge(r),/Account changed/);
});
test('quota and malformed/misowned storage send no request and preserve saved bytes',async()=>{
 let calls=0;const storage=memory(),set=storage.setItem;storage.setItem=()=>{throw Error('quota')};const s=setup({rpc:async()=>{calls++}},storage);
 assert.throws(()=>s.make(),/quota/);assert.equal(calls,0);storage.setItem=set;const p=s.make();
 for(const raw of ['broken',JSON.stringify({...p,owner:id(2)}),JSON.stringify({...p,payload:{...p.payload,user_id:id(1)}})]){
  storage.setItem(storage.key(0),raw);assert.throws(()=>s.creates.list());await assert.rejects(()=>s.creates.run(p));assert.equal(calls,0);assert.equal(storage.getItem(storage.key(0)),raw);
 }
});
test('missing, foreign or forged acknowledgements and failed cleanup never consume creation retries',async()=>{
 for(const change of [r=>r.data.tasks=[],r=>r.data.request_id=id(99),r=>r.data.tasks[0].id=id(99),r=>r.data.tasks[0].user_id=id(2),
  r=>r.data.tasks[0].title='Wrong title',r=>delete r.data.tasks[0].tags,r=>r.data.tasks[0].created_at='bad',r=>r.data.tasks[0].streak=2]){
  let p;const s=setup({rpc:async()=>{const r=reply(p);change(r);return r}});p=s.make();await assert.rejects(()=>s.creates.run(p));assert.deepEqual(s.creates.list(),[p]);
 }
 let p;const s=setup({rpc:async()=>reply(p)});p=s.make();const result=await s.creates.run(p);assert.throws(()=>s.creates.acknowledge({...result}),/changed/);
 const remove=s.storage.removeItem;s.storage.removeItem=()=>{throw Error('Storage unavailable')};assert.throws(()=>s.creates.acknowledge(result),/Storage unavailable/);
 assert.equal(s.creates.confirmation(),null);s.storage.removeItem=remove;s.creates.discard(p);assert.deepEqual(s.creates.list(),[]);
});
test('another tab keeps an independent retry slot and older cleanup never removes it',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.make(),pending=s.creates.run(p);
 const next={...p,requestId:id(99),payload:{...p.payload,items:[{...p.payload.items[0],id:id(98),title:'Different tab'}]}};
 const nextKey='rm-task-create-v1:'+id(1)+':'+id(99);s.storage.setItem(nextKey,JSON.stringify(next));
 finish(reply(p));const result=await pending;s.creates.acknowledge(result);assert.deepEqual(s.creates.list(),[next]);
 s.creates.discard(p);assert.deepEqual(s.creates.list(),[next]);
 const b=setup({rpc:async()=>reply(next)},s.storage),r=await b.creates.run(next);
 const changed={...next,payload:{...next.payload,items:[{...next.payload.items[0],title:'Newer saved draft'}]}};
 b.storage.setItem(nextKey,JSON.stringify(changed));assert.throws(()=>b.creates.acknowledge(r),/changed/);
 b.creates.discard(next);assert.deepEqual(b.creates.list(),[changed]);
});
test('count and UTF-8 limits reject before persisting; title and tag boundaries survive',()=>{
 const s=setup({rpc:async()=>{throw Error('must not send')}}),item=draft.items[0];
 for(const change of [{title:''},{title:'あ'.repeat(1366)},{title:[]},{tags:['wf']},{tags:['a','a']},{tags:['あ'.repeat(27)]},{done:true}])
  assert.throws(()=>s.creates.prepare({...draft,items:[{...item,...change}]}));
 assert.throws(()=>s.creates.prepare({...draft,user_id:id(2)}));assert.throws(()=>s.creates.prepare({...draft,items:[]}));
 for(const n of [0,33])assert.throws(()=>s.creates.prepare({kind:'capture',text:'test',items:Array.from({length:n},()=>({...item,tags:['parked'],folder:'Other'}))}));
 assert.throws(()=>s.creates.prepare({kind:'capture',text:'x'.repeat(32769),items:[{...item,tags:['parked'],folder:'Other'}]}));
 assert.throws(()=>s.creates.prepare({kind:'capture',text:'test',items:Array.from({length:32},()=>({title:'x'.repeat(4096),tags:['parked'],folder:'Other'}))}),/too large/);
 const full=setup({rpc:async()=>{throw Error('must not send')}}).creates.prepare({kind:'capture',text:'test',items:Array.from({length:32},(_,n)=>({title:'Item '+n,tags:['parked'],folder:'Other'}))});assert.equal(full.payload.items.length,32);
 assert.deepEqual(s.creates.list(),[]);const boundary=s.creates.prepare({...draft,items:[{title:'x'.repeat(4096),tags:['x'.repeat(80)]}]});assert.equal(boundary.payload.items[0].title.length,4096);
 assert.deepEqual(creationDraft(boundary.payload),normalizeCreation({...draft,items:[{title:'x'.repeat(4096),tags:['x'.repeat(80)]}]}));
});
test('caller mutation cannot change an in-flight request or forge confirmed task details',async()=>{
 let finish;const source=structuredClone(draft),s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.creates.prepare(source);
 source.items[0].tags.push('outside');assert.deepEqual(p.payload.items[0].tags,['home']);
 const good=structuredClone(p),flight=s.creates.run(p);p.payload.items[0].title='Mutated caller';finish(reply(good));const result=await flight;
 assert.equal(result.submitted.items[0].title,draft.items[0].title);result.tasks[0].title='Forged confirmation';assert.throws(()=>s.creates.acknowledge(result),/changed/);
 await assert.rejects(()=>s.creates.run(p),/changed/);assert.equal(s.creates.list()[0].payload.items[0].title,draft.items[0].title);
});
