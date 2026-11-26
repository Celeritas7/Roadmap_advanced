import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDailyLogs,normalizeLog} from '../staging/daily-log-contract.ts';
const id=n=>'e0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const entry={task_id:id(3),log_date:'2026-11-25',context:'@home',duration_minutes:35,notes:'Keep 日本語 <script>text</script>'};
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
function setup(client,storage=memory()){
 let n=10;const logs=createDailyLogs({client,storage,uuid:()=>id(n++)});logs.bind(id(1));return {logs,storage,make:()=>logs.prepare(entry)};
}
const reply=p=>({error:null,data:{request_id:p.requestId,replayed:false,entry:{...p.entry,id:p.entryId,created_at:'2026-11-26T00:00:00Z'}}});
test('denied, lost and uncertain log saves retain original identities, date and notes across reload',async()=>{
 const calls=[];const a=setup({rpc:async(name,args)=>{calls.push({name,args});return {error:{code:'42501'}}}}),p=a.make();
 await assert.rejects(()=>a.logs.run(p),/stays saved/);assert.deepEqual(a.logs.list(),[p]);
 const b=setup({rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:null}}},a.storage);await assert.rejects(()=>b.logs.run(p),/not confirmed/);
 const c=setup({rpc:async(name,args)=>{calls.push({name,args});return reply(p)}},a.storage);
 const result=await c.logs.run(c.logs.list()[0]);assert.deepEqual(c.logs.list(),[p]);c.logs.acknowledge(result);
 assert.deepEqual(c.logs.list(),[]);assert.equal(c.logs.confirmation(),result);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1],calls[2]);
 assert.equal(result.entry.log_date,'2026-11-25');assert.equal(result.entry.notes,entry.notes);
});
test('duplicate log submissions share one request; altered date, notes or duration cannot replace it',async()=>{
 let finish,calls=0;const s=setup({rpc:()=>{calls++;return new Promise(r=>finish=r)}}),p=s.make();
 const a=s.logs.run(p),b=s.logs.run(p);assert.equal(calls,1);assert.deepEqual(s.make(),p);
 for(const patch of [{log_date:'2026-11-26'},{notes:'A different draft'},{duration_minutes:36}])assert.throws(()=>s.logs.prepare({...entry,...patch}),/waiting/);
 assert.throws(()=>s.logs.discard(p),/Wait/);finish(reply(p));const result=await a;assert.equal(result,await b);s.logs.acknowledge(result);
});
test('replay returns current notes and an optional task cleared after deletion',async()=>{
 let p;const s=setup({rpc:async()=>{const r=reply(p);r.data.replayed=true;r.data.entry.notes='Newer notes';r.data.entry.task_id=null;return r}});p=s.make();
 const result=await s.logs.run(p);assert.equal(result.entry.notes,'Newer notes');assert.equal(result.entry.task_id,null);s.logs.acknowledge(result);
});
test('account changes reject late response and acknowledgement through A to B to A',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.make(),pending=s.logs.run(p);
 s.logs.bind(id(2));assert.deepEqual(s.logs.list(),[]);await assert.rejects(()=>s.logs.run(p),/Account changed/);
 s.logs.bind(id(1));await assert.rejects(()=>s.logs.run(p),/Wait/);finish(reply(p));await assert.rejects(pending,/Account changed/);assert.deepEqual(s.logs.list(),[p]);
 const other=setup({rpc:async()=>reply(p)},s.storage),result=await other.logs.run(p);other.logs.bind(id(2));other.logs.bind(id(1));assert.throws(()=>other.logs.acknowledge(result),/Account changed/);assert.equal(other.logs.confirmation(),null);
});
test('quota failure sends nothing; malformed or misowned storage remains for review',async()=>{
 let calls=0;const storage=memory(),set=storage.setItem;storage.setItem=()=>{throw Error('quota')};const s=setup({rpc:async()=>{calls++}},storage);
 assert.throws(()=>s.make(),/quota/);assert.equal(calls,0);storage.setItem=set;const p=s.make();
 for(const raw of ['broken',JSON.stringify({...p,owner:id(2)}),JSON.stringify({...p,entry:{...entry,owner:id(1)}})]){
  storage.setItem(storage.key(0),raw);assert.throws(()=>s.logs.list());await assert.rejects(()=>s.logs.run(p));assert.equal(calls,0);assert.equal(storage.getItem(storage.key(0)),raw);
 }
});
test('foreign, missing, mismatched and incomplete acknowledgements never consume a log retry',async()=>{
 for(const change of [r=>r.data.entry=null,r=>r.data.request_id=id(99),r=>r.data.entry.id=id(99),r=>r.data.entry.user_id=id(2),
  r=>r.data.entry.log_date='2026-11-26',r=>r.data.entry.notes='Wrong notes',r=>delete r.data.entry.context,r=>r.data.entry.created_at='bad',r=>r.data.entry.duration_minutes=1]){
  let p;const s=setup({rpc:async()=>{const r=reply(p);change(r);return r}});p=s.make();await assert.rejects(()=>s.logs.run(p));assert.deepEqual(s.logs.list(),[p]);assert.equal(s.logs.confirmation(),null);
 }
});
test('newer cross-tab requests survive older replies, acknowledgement and stale discard',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(r=>finish=r)}),p=s.make(),pending=s.logs.run(p),next={...p,requestId:id(99),entryId:id(98)};
 s.storage.setItem(s.storage.key(0),JSON.stringify(next));finish(reply(p));await assert.rejects(pending,/newer saved/);assert.deepEqual(s.logs.list(),[next]);
 const b=setup({rpc:async()=>reply(next)},s.storage),result=await b.logs.run(next);b.storage.setItem(b.storage.key(0),JSON.stringify(p));
 assert.throws(()=>b.logs.acknowledge(result),/changed/);b.logs.discard(next);assert.deepEqual(b.logs.list(),[p]);
});
test('forged receipts and failed cleanup do not claim confirmation; explicit discard is only local',async()=>{
 let p;const s=setup({rpc:async()=>reply(p)});p=s.make();const result=await s.logs.run(p);assert.throws(()=>s.logs.acknowledge({...result}),/changed/);
 const remove=s.storage.removeItem;s.storage.removeItem=()=>{throw Error('Storage unavailable')};assert.throws(()=>s.logs.acknowledge(result),/Storage unavailable/);assert.equal(s.logs.confirmation(),null);assert.deepEqual(s.logs.list(),[p]);
 s.storage.removeItem=remove;s.logs.discard(p);assert.deepEqual(s.logs.list(),[]);assert.equal(s.logs.confirmation(),null);
});
test('duration, date, field and UTF-8/JSON limits reject before storing; valid boundary values survive',()=>{
 const s=setup({rpc:async()=>{throw Error('must not send')}});
 for(const patch of [{log_date:'2026-02-30'},{log_date:'0000-01-01'},{duration_minutes:0},{duration_minutes:1441},{duration_minutes:1.5},
  {duration_minutes:'35'},{notes:'あ'.repeat(5462)},{context:'あ'.repeat(43)},{notes:[]},{user_id:id(2)},{task_id:'bad'}])assert.throws(()=>s.logs.prepare({...entry,...patch}));
 assert.throws(()=>s.logs.prepare({...entry,notes:'\n'.repeat(14000)}),/too large/);assert.deepEqual(s.logs.list(),[]);
 const boundary=s.logs.prepare({...entry,notes:'x'.repeat(16384),context:'x'.repeat(128),duration_minutes:1440});assert.equal(boundary.entry.notes.length,16384);
 assert.equal(normalizeLog({...entry,log_date:'2024-02-29'}).log_date,'2024-02-29');
});
test('caller changes cannot mutate the saved request or silently confirm a different entry',async()=>{
 const input={...entry},s=setup({rpc:async()=>{throw Error('must not send')}}),p=s.logs.prepare(input);input.notes='Changed outside';assert.equal(p.entry.notes,entry.notes);
 p.entry.notes='Mutated pending';await assert.rejects(()=>s.logs.run(p),/changed/);assert.equal(s.logs.list()[0].entry.notes,entry.notes);
});
