import {test} from 'node:test';import assert from 'node:assert/strict';
import {createStructures,normalizeStructure,structureDraft} from '../staging/structure-contract.ts';
const id=n=>'16000000-0000-4000-8000-'+String(n).padStart(12,'0'),stamp='2026-11-26T00:00:00Z';
const task={id:id(3),expected_updated_at:stamp,label:'Keep 日本語 <script>text</script>'};
const deletion={kind:'delete',tasks:[task]},move={kind:'move',tasks:[{...task,parent_id:id(4),position:2}]};
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
function setup(client,storage=memory()){let n=20;const actions=createStructures({client,storage,uuid:()=>id(n++)});actions.bind(id(1));return {actions,storage}}
const row=(t)=>({id:t.id,parent_id:t.parent_id??null,title:t.label??t.title,kind:t.label===undefined?'group':'task',position:t.position??0,done:true,expanded:true,tags:t.tags??[],streak:4,streak_day:null,created_at:stamp,updated_at:stamp});
const reply=(p,replayed=false)=>({error:null,data:{request_id:p.requestId,replayed,kind:p.payload.kind,
 tasks:p.payload.kind==='move'?[...p.payload.tasks.map(row),...(p.payload.folder?[row(p.payload.folder)]:[])]:[],deleted_ids:p.payload.kind==='delete'?p.payload.tasks.map(t=>t.id):[]}});
test('deletion is persisted for review without sending; cancel is a local undo',()=>{
 let calls=0;const s=setup({rpc:async()=>{calls++}}),p=s.actions.prepare(deletion);assert.equal(p.attempted,false);assert.equal(calls,0);
 assert.deepEqual(s.actions.list(),[p]);s.actions.discard(p);assert.deepEqual(s.actions.list(),[]);assert.equal(calls,0);
});
test('attempt state is durable before RPC; uncertain retry after reload uses the same request',async()=>{
 let p;const calls=[],s=setup({rpc:async(name,args)=>{assert.equal(s.actions.list()[0].attempted,true);calls.push({name,args});return {error:{code:'504'}}}});p=s.actions.prepare(deletion);
 await assert.rejects(()=>s.actions.run(p),/not confirmed/);const saved=s.actions.list()[0];assert.equal(saved.attempted,true);assert.deepEqual(saved.payload,deletion);
 const b=setup({rpc:async(name,args)=>{calls.push({name,args});return reply(saved,true)}},s.storage),result=await b.actions.run(saved);
 assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].name,'ga_roadmap_structure');assert.deepEqual(b.actions.list(),[saved]);b.actions.acknowledge(result);assert.deepEqual(b.actions.list(),[]);
});
test('duplicate requests share one flight; no other action can overwrite a pending request',async()=>{
 let finish,calls=0;const s=setup({rpc:()=>{calls++;return new Promise(r=>finish=r)}}),p=s.actions.prepare(move),a=s.actions.run(p),b=s.actions.run(p);
 assert.equal(calls,1);assert.throws(()=>s.actions.prepare(deletion),/waiting/);assert.throws(()=>s.actions.discard(s.actions.list()[0]),/Wait/);
 finish(reply(p));const r=await a;assert.equal(r,await b);s.actions.acknowledge(r);
});
test('new folder and moves keep one folder UUID across reload, retries and later server edits',async()=>{
 const draft={kind:'move',folder:{id:'$new',title:'New 日本語 folder',parent_id:null,tags:[]},tasks:[{...task,parent_id:'$new',position:0}]};
 let p;const s=setup({rpc:async()=>{const r=reply(p,true);r.data.tasks[0].title='Later edit';return r}});p=s.actions.prepare(draft);
 assert.deepEqual(structureDraft(p.payload),draft);assert.equal(p.payload.tasks[0].parent_id,p.payload.folder.id);
 const b=setup({rpc:async()=>reply(p)},s.storage);assert.deepEqual(b.actions.prepare(draft),p);
 const r=await s.actions.run(p);assert.equal(r.tasks[0].title,'Later edit');assert.deepEqual(r.submitted,draft);s.actions.acknowledge(r);assert.equal(s.actions.confirmation(),r);
});
test('account A to B to A rejects late responses and old acknowledgements',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.actions.prepare(move),flight=s.actions.run(p);
 s.actions.bind(id(2));assert.deepEqual(s.actions.list(),[]);await assert.rejects(()=>s.actions.run(p),/Account changed/);s.actions.bind(id(1));
 await assert.rejects(()=>s.actions.run(s.actions.list()[0]),/Wait/);finish(reply(p));await assert.rejects(flight,/Account changed/);
 const b=setup({rpc:async()=>reply(p)},s.storage),r=await b.actions.run(b.actions.list()[0]);b.actions.bind(id(2));b.actions.bind(id(1));assert.throws(()=>b.actions.acknowledge(r),/Account changed/);
});
test('quota, malformed bytes and changed intent block sending and preserve recovery evidence',async()=>{
 let calls=0;const s=setup({rpc:async()=>{calls++}}),p=s.actions.prepare(deletion),key=s.storage.key(0),raw=s.storage.getItem(key),set=s.storage.setItem;
 s.storage.setItem=()=>{throw Error('quota')};await assert.rejects(()=>s.actions.run(p),/quota/);assert.equal(calls,0);assert.equal(s.storage.getItem(key),raw);s.storage.setItem=set;
 for(const bad of ['broken',JSON.stringify({...p,owner:id(2)}),JSON.stringify({...p,payload:{...p.payload,extra:true}})]){
  s.storage.setItem(key,bad);assert.throws(()=>s.actions.list());await assert.rejects(()=>s.actions.run(p));assert.equal(calls,0);assert.equal(s.storage.getItem(key),bad);
 }
});
test('missing, foreign, mismatched or forged acknowledgements do not consume retries',async()=>{
 for(const change of [r=>r.data.request_id=id(90),r=>r.data.kind='delete',r=>r.data.tasks=[],r=>r.data.tasks[0].user_id=id(2),r=>r.data.tasks[0].title='Wrong',r=>r.data.tasks[0].parent_id=null,r=>r.data.tasks[0].position=99,r=>r.data.tasks[0].updated_at='bad']){
  let p;const s=setup({rpc:async()=>{const r=reply(p);change(r);return r}});p=s.actions.prepare(move);await assert.rejects(()=>s.actions.run(p));assert.equal(s.actions.list().length,1);
 }
 let p;const s=setup({rpc:async()=>reply(p)});p=s.actions.prepare(deletion);const r=await s.actions.run(p);assert.throws(()=>s.actions.acknowledge({...r}),/changed/);
 r.deletedIds.push(id(98));assert.throws(()=>s.actions.acknowledge(r),/changed/);assert.equal(s.actions.list().length,1);
});
test('another tab retains its request and modified bytes defeat old cleanup',async()=>{
 let p;const s=setup({rpc:async()=>reply(p)});p=s.actions.prepare(move);const r=await s.actions.run(p),other={...p,requestId:id(90),payload:deletion};
 const key='rm-structure-v1:'+id(1)+':'+id(90);s.storage.setItem(key,JSON.stringify(other));s.actions.acknowledge(r);assert.deepEqual(s.actions.list(),[other]);
 const b=setup({rpc:async()=>reply(other)},s.storage),r2=await b.actions.run(other);const changed={...other,attempted:true,payload:{...deletion,tasks:[{...task,label:'Other draft'}]}};
 s.storage.setItem(key,JSON.stringify(changed));assert.throws(()=>b.actions.acknowledge(r2),/changed/);assert.throws(()=>b.actions.discard(other),/changed/);assert.deepEqual(b.actions.list(),[changed]);
});
test('count and UTF-8 byte limits reject whole requests without truncating any tasks',()=>{
 const s=setup({rpc:async()=>{throw Error('no send')}});
 for(const p of [{kind:'delete',tasks:[]},{...move,user_id:id(1)},{...move,tasks:[move.tasks[0],move.tasks[0]]},
  ...[{label:'あ'.repeat(1366)},{position:-1},{position:1.5},{parent_id:undefined},{done:true}].map(x=>({...move,tasks:[{...move.tasks[0],...x}]})),
  {...deletion,tasks:Array.from({length:101},(_,n)=>({...task,id:id(100+n)}))},
  {...deletion,tasks:Array.from({length:100},(_,n)=>({...task,id:id(100+n),label:'あ'.repeat(1000)}))}])assert.throws(()=>s.actions.prepare(p));
 assert.deepEqual(s.actions.list(),[]);const p=s.actions.prepare({...deletion,tasks:Array.from({length:100},(_,n)=>({...task,id:id(100+n)}))});assert.equal(p.payload.tasks.length,100);
 assert.equal(normalizeStructure({...deletion,tasks:[{...task,label:'x'.repeat(4096)}]}).tasks[0].label.length,4096);
});
