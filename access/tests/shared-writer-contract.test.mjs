import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHubAccounts} from '../staging/hub-account.ts';import {createSharedWriters} from '../staging/shared-writer-contract.ts';
const A='23000000-0000-4000-8000-000000000001',B='23000000-0000-4000-8000-000000000002',target={kind:'document',doc:'task_tags',path:'rm',key:'one/日本語'};
const rev=n=>String(n).padStart(32,'0'),intentId=n=>'23000000-0000-4000-8000-'+String(n+10).padStart(12,'0');
function fixture(){
 const values=new Map(),storage={get length(){return values.size},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},accounts=createHubAccounts();accounts.bind(A);
 let tail=Promise.resolve(),counter=0,revision=0,current=null,mode='ok',finish,mutate=x=>x;
 const locks={request:(_name,_opts,work)=>{const f=tail.then(work);tail=f.catch(()=>{});return f}},receipts=new Map(),calls=[];
 const snapshot=()=>({protocol:'roadmap.shared.v1',owner:A,target,revision:current?rev(revision):null,record:current?structuredClone(current):null});
 const setValue=value=>{revision++;current={user_id:A,doc:target.doc,path:target.path,item_key:target.key,owner_app:'rm',seq:revision,deleted_at:null,value}}
 const client={rpc:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});if(name==='ga_roadmap_shared_read')return {error:null,data:snapshot()};
  const prior=receipts.get(args.p_request_id),result={protocol:'roadmap.shared.v1',owner:A,request_id:args.p_request_id,target,expected_revision:args.p_expected_revision,change:args.p_change,replayed:!!prior,status:prior||snapshot().revision===args.p_expected_revision?'saved':'conflict'};
  if(result.status==='saved'){if(!prior){setValue(args.p_change.value);receipts.set(args.p_request_id,rev(revision))}result.applied_revision=receipts.get(args.p_request_id)}result.current=snapshot();
  if(mode==='hold')await new Promise(r=>finish=r);if(mode==='lost')return {error:{code:'504'},data:null};return {error:null,data:mutate(result)}
 }};
 const make=()=>createSharedWriters({scope:accounts.scope(),client,storage,locks,newId:()=>intentId(++counter)});
 const api=make();return {api,make,accounts,values,storage,client,calls,locks,setValue,snapshot,mode:x=>mode=x,finish:()=>finish(),mutate:x=>mutate=x};
}
async function prepared(f,value={nested:{keep:'draft'}}){return f.api.prepare(await f.api.read(target),{op:'put',value})}
test('shared draft is durable before send, exact confirmation is required, and resolving saves keeps history',async()=>{
 const f=fixture(),p=await prepared(f);assert.equal(f.calls.length,1);assert.deepEqual(f.api.list(),[p]);
 const r=await f.api.run(p);assert.equal(f.api.list().length,1);await assert.rejects(f.api.acknowledge({...r}),/confirmation/);
 await f.api.acknowledge(r);assert.equal(f.api.list().length,0);const slot=JSON.parse([...f.values.values()][0]);assert.deepEqual(slot.history[0].intent,p);assert.equal(slot.history[0].resolution,'saved');
});
test('lost reply survives reconstruction and replay preserves a newer server value',async()=>{
 const f=fixture(),p=await prepared(f);f.mode('lost');await assert.rejects(f.api.run(p),/not confirmed/);f.setValue({nested:{keep:'newer'}});f.mode('ok');
 const restarted=f.make(),r=await restarted.run(restarted.list()[0]);assert.equal(r.replayed,true);assert.equal(r.current.record.value.nested.keep,'newer');await restarted.acknowledge(r);assert.equal(restarted.list().length,0);
});
test('conflicts keep draft; explicit rebase records original request and cannot silently overwrite another later edit',async()=>{
 const f=fixture(),p=await prepared(f);f.setValue('someone else');const r=await f.api.run(p);assert.equal(r.status,'conflict');await assert.rejects(f.api.acknowledge(r),/conflict/);
 const latest=await f.api.read(target),next=await f.api.resolve(r,latest,true);assert.notEqual(next.requestId,p.requestId);assert.equal(next.expectedRevision,latest.revision);assert.deepEqual(next.change,p.change);
 assert.equal(JSON.parse([...f.values.values()][0]).history[0].intent.requestId,p.requestId);
 f.setValue('changed again');const again=await f.api.run(next);assert.equal(again.status,'conflict');assert.equal(f.snapshot().record.value,'changed again');assert.deepEqual(f.api.list(),[next]);
});
test('keeping current archives the conflicting draft without sending another mutation',async()=>{
 const f=fixture(),p=await prepared(f);f.setValue('new');const r=await f.api.run(p),before=f.calls.length;
 await f.api.resolve(r,r.current,false);assert.equal(f.api.list().length,0);assert.equal(f.calls.length,before);assert.deepEqual(JSON.parse([...f.values.values()][0]).history[0].intent,p);
});
test('read proof is bound to the account, exact snapshot and target; a changed snapshot cannot prepare a save',async()=>{
 const f=fixture(),s=await f.api.read(target);await assert.rejects(f.api.prepare({...s},{op:'put',value:1}),/review/);s.revision=rev(9);await assert.rejects(f.api.prepare(s,{op:'put',value:1}),/review/);assert.equal(f.api.list().length,0);
});
test('two controllers serialize preparation and identical target slots never lose an older pending draft',async()=>{
 const f=fixture(),b=f.make(),[aRead,bRead]=await Promise.all([f.api.read(target),b.read(target)]);
 const replies=await Promise.allSettled([f.api.prepare(aRead,{op:'put',value:'A'}),b.prepare(bRead,{op:'put',value:'B'})]);assert.equal(replies.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.api.list().length,1);assert.equal(f.calls.filter(c=>c.name==='ga_roadmap_shared_write').length,0);
});
test('retries single-flight and changed saved bytes during acknowledgement cannot be cleared',async()=>{
 const f=fixture(),p=await prepared(f);f.mode('hold');const flight=f.api.run(p);assert.equal(f.api.run(p),flight);await new Promise(setImmediate);
 const k=f.storage.key(0);f.storage.setItem(k,f.storage.getItem(k)+' ');f.finish();await assert.rejects(flight,/draft changed/);assert.equal(f.api.list().length,1);
});
test('A–B–A transition rejects the old response and retains account A history',async()=>{
 const f=fixture(),p=await prepared(f);f.mode('hold');const flight=f.api.run(p);await new Promise(setImmediate);f.accounts.bind(B);assert.equal(f.make().list().length,0);f.accounts.bind(A);f.finish();await assert.rejects(flight,/stopped/);assert.deepEqual(f.make().list(),[p]);
});
test('mismatched request, expected version, nested change, owner and invalid receipts cannot confirm',async()=>{
 for(const mutate of [r=>({...r,request_id:intentId(99)}),r=>({...r,expected_revision:rev(4)}),r=>({...r,change:{op:'put',value:{nested:{keep:'wrong'}}}}),r=>({...r,owner:B}),r=>({...r,applied_revision:null}),r=>({...r,current:{...r.current,record:{...r.current.record,user_id:B}}})]){
  const f=fixture(),p=await prepared(f);f.mutate(mutate);await assert.rejects(f.api.run(p));assert.deepEqual(f.api.list(),[p]);
 }
});
test('quota failures and absent Web Locks preserve pending drafts and never send unpersisted changes',async()=>{
 const f=fixture(),s=await f.api.read(target);f.storage.setItem=()=>{throw Error('quota')};await assert.rejects(f.api.prepare(s,{op:'put',value:1}),/quota/);assert.equal(f.calls.length,1);
 const paused=createSharedWriters({scope:f.accounts.scope(),client:f.client,storage:f.storage,locks:undefined});const read=await paused.read(target);assert.throws(()=>paused.prepare(read,{op:'put',value:1}),/Web Locks/);
});
test('invalid and non-JSON drafts are rejected before persistence or RPC; legacy storage remains untouched',async()=>{
 const f=fixture(),s=await f.api.read(target);f.storage.setItem('offline-pack','keep');f.storage.setItem('akatsuki_outbox_rm','legacy');
 for(const value of [{op:'put',value:undefined},{op:'put',value:NaN},{op:'put',value:'日'.repeat(12000)},{op:'remove',value:'extra'}])await assert.rejects(f.api.prepare(s,value));
 assert.equal(f.storage.getItem('offline-pack'),'keep');assert.equal(f.storage.getItem('akatsuki_outbox_rm'),'legacy');assert.equal(f.calls.length,1);
});
