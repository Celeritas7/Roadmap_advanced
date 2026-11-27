import {test} from 'node:test';import assert from 'node:assert/strict';import {createMirrors,normalizeMirror,mirrorAddressKey} from '../staging/mirror-contract.ts';
const id=n=>'f8000000-0000-4000-8000-'+String(n).padStart(12,'0');
const event={seq:18,address:{board_id:'board',item_key:'study:日本語/Elite',sub_id:'task',extra:{keep:'exact'}},payload:{title:'Keep 日本語 <script>text</script>',done:false}};
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
const task={id:id(3),parent_id:null,title:event.payload.title,tags:['wf','lang'],done:false,kind:'task',position:0,expanded:true,streak:3,streak_day:null,created_at:'2026-11-26T00:00:00Z',updated_at:'2026-11-26T00:00:00Z'};
const response=()=>({error:null,data:{seq:18,address:event.address,replayed:false,last_seq:18,task_id:id(3),source_deleted:false,suppressed:false,tasks:[structuredClone(task)]}});
function setup(rpc,storage=memory()){const c=createMirrors({client:{rpc},storage});c.bind(id(1));return {c,storage,make:()=>c.prepare(event)}}
test('original mirror delivery persists before sending and survives lost response/reload',async()=>{
 const calls=[],s=setup(async(name,args)=>{calls.push({name,args});return {error:{code:'504'}}});const p=s.make();await assert.rejects(()=>s.c.run(p),/not confirmed/);
 const reloaded=setup(async(name,args)=>{calls.push({name,args});return response()},s.storage),r=await reloaded.c.run(reloaded.c.list()[0]);assert.deepEqual(calls[1],calls[0]);assert.deepEqual(r.event.address,event.address);
 reloaded.c.acknowledge(r);assert.equal(reloaded.c.list().length,0);
});
test('duplicate callbacks single-flight and a sequence cannot silently change payload or address',async()=>{
 let finish,calls=0;const s=setup(()=>{calls++;return new Promise(r=>finish=r)}),p=s.make(),a=s.c.run(p),b=s.c.run(p);
 assert.equal(a,b);assert.equal(calls,1);assert.throws(()=>s.c.prepare({...event,payload:{title:'Changed'}}),e=>e.code==='22023');finish(response());const r=await a;s.c.acknowledge(r);assert.equal(s.c.list().length,0);
});
test('late A→B→A responses never apply or erase the original saved delivery',async()=>{
 let finish;const s=setup(()=>new Promise(r=>finish=r)),p=s.make(),work=s.c.run(p);s.c.bind(id(2));assert.equal(s.c.list().length,0);s.c.bind(id(1));finish(response());await assert.rejects(work,/Account changed/);assert.deepEqual(s.c.list(),[p]);
});
test('foreign, malformed and stale acknowledgements retain pending delivery',async()=>{
 for(const mutate of [r=>r.data.tasks[0].user_id=id(2),r=>r.data.seq=17,r=>r.data.last_seq=17,r=>r.data.task_id=id(4),r=>r.data.address.extra='changed',r=>r.data.tasks.push({...task,id:id(4)}),r=>r.data.suppressed=true]){
  const s=setup(async()=>{const r=response();mutate(r);return r}),p=s.make();await assert.rejects(()=>s.c.run(p));assert.deepEqual(s.c.list(),[p]);
 }
});
test('cross-tab changes, forged confirmations and independent slots cannot clear newer work',async()=>{
 let finish;const s=setup(()=>new Promise(r=>finish=r)),p=s.make(),work=s.c.run(p);s.c.prepare({...event,seq:19});finish(response());const result=await work;
 assert.throws(()=>s.c.acknowledge({...result}),/changed/);s.c.acknowledge(result);assert.equal(s.c.list()[0].event.seq,19);
 const t=setup(async()=>response()),intent=t.make(),r=await t.c.run(intent);t.storage.setItem(t.storage.key(0),JSON.stringify({...intent,event:{...event,payload:{title:'Newer edit'}}}));
 assert.throws(()=>t.c.acknowledge(r),/changed/);assert.equal(t.c.list()[0].event.payload.title,'Newer edit');
});
test('quota/corrupt storage and invalid UTF-8 limits send nothing and keep offline/unscoped records',async()=>{
 let calls=0;const s=setup(async()=>{calls++});s.storage.setItem('offline-pack','Keep bytes');s.storage.setItem('rm-ak-pending-done','legacy owner unknown');const set=s.storage.setItem;
 s.storage.setItem=()=>{throw Error('quota')};assert.throws(s.make,/quota/);s.storage.setItem=set;const p=s.make();s.storage.setItem('rm-mirror-v1:'+p.owner+':18','corrupt');assert.throws(()=>s.c.list());await assert.rejects(()=>s.c.run(p));assert.equal(calls,0);
 assert.equal(s.storage.getItem('offline-pack'),'Keep bytes');assert.equal(s.storage.getItem('rm-ak-pending-done'),'legacy owner unknown');
 for(const bad of [null,{}, {...event,seq:1.5},{...event,seq:9007199254740992},{...event,address:{...event.address,sub_id:''}},
  {...event,payload:{title:'あ'.repeat(1366)}},{...event,payload:{title:'ok',del:'true'}},{...event,payload:{title:'ok',extra:undefined}},
  {...event,payload:{title:'ok',extra:Infinity}},{...event,address:{...event.address,extra:'あ'.repeat(1366)}}])assert.throws(()=>normalizeMirror(bad),e=>e.code==='22023');
 assert.equal(normalizeMirror({...event,payload:{title:'x'.repeat(4096)}}).payload.title.length,4096);
 assert.notEqual(mirrorAddressKey({board_id:'a/b',item_key:'c',sub_id:'d'}),mirrorAddressKey({board_id:'a',item_key:'b/c',sub_id:'d'}));
 assert.equal(mirrorAddressKey({x:{b:2,a:1}}),mirrorAddressKey({x:{a:1,b:2}}));
});
test('newest server rows and retained tombstones are accepted without historical replay',async()=>{
 for(const suppressed of [false,true]){const s=setup(async()=>{const r=response();r.data.last_seq=22;r.data.replayed=true;r.data.suppressed=suppressed;r.data.source_deleted=true;r.data.tasks=suppressed?[]:[{...task,title:'Newer title',tags:['wf','orphaned']}];return r});
  const r=await s.c.run(s.make());assert.equal(r.lastSeq,22);assert.equal(r.suppressed,suppressed);s.c.acknowledge(r);
 }
});
