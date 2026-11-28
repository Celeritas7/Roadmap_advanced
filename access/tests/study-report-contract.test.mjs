import {test} from 'node:test';import assert from 'node:assert/strict';import {consumerAck} from './consumer-test-support.mjs';
import {createStudyReports,studyEnvelope} from '../staging/study-report-contract.ts';
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
const event={seq:20,taskId:id(3),day:'2026-11-26'};
const reply=()=>({data:{kind:'session.completed',from_app:'jlpt',to_app:'rm',receipt_outcome:'reported',seq:20,task_id:id(3),day_key:event.day,replayed:false,outcome:'reported',session:{id:id(4),task_id:id(3),day_key:event.day,source:'japanese-study-app-advanced',started_at:null,completed_at:'2026-11-26T19:10:00Z',duration_min:20,feedback:{mode:'goi'},verification:'app',created_at:'2026-11-26T18:50:00Z'}},error:null});
function setup(client={rpc:async()=>reply()},storage=memory()){const reports=createStudyReports({client:{rpc:(name,args)=>name==='ga_roadmap_ack_consumer_event'?Promise.resolve(consumerAck(args.p_seq,'session.completed','reported')):client.rpc(name,args)},storage});reports.bind(id(1));return {reports,storage}}
test('study receipt sends only stored sequence, persists until applied and preserves unrelated data',async()=>{
 const calls=[],{reports:r,storage}=setup({rpc:async(name,args)=>{calls.push({name,args});return reply()}});storage.setItem('offline-pack','keep');storage.setItem('rm-handshake','legacy');
 const p=r.prepare(event),v=await r.run(p);assert.equal(r.list().length,1);assert.deepEqual(calls,[{name:'ga_roadmap_receive_study_event',args:{p_seq:20}}]);
 assert.throws(()=>r.acknowledge(structuredClone(v)),/changed/);await r.confirm(v);r.acknowledge(v);assert.deepEqual(r.list(),[]);assert.equal(storage.getItem('offline-pack'),'keep');assert.equal(storage.getItem('rm-handshake'),'legacy');
});
test('lost acknowledgement survives reload; empty or foreign confirmation never clears it',async()=>{
 const a=setup({rpc:async()=>({error:{code:'504'}})}),p=a.reports.prepare(event);await assert.rejects(()=>a.reports.run(p));
 const b=setup({rpc:async()=>reply()},a.storage);assert.deepEqual(b.reports.list(),[p]);const v=await b.reports.run(p);await b.reports.confirm(v);b.reports.acknowledge(v);
 for(const corrupt of [r=>r.data=null,r=>r.data.session.user_id=id(2),r=>r.data.day_key='2026-11-27',r=>r.data.session.task_id=id(2),r=>r.data.session.verification='manual']){
  const s=setup({rpc:async()=>{const r=reply();corrupt(r);return r}}),p=s.reports.prepare(event);await assert.rejects(()=>s.reports.run(p));assert.equal(s.reports.list().length,1);
 }
});
test('study A to B to A and competing saved bytes retain original recovery',async()=>{
 let finish;const s=setup({rpc:()=>new Promise(resolve=>finish=()=>resolve(reply()))}),p=s.reports.prepare(event),flight=s.reports.run(p);
 s.reports.bind(id(2));s.reports.bind(id(1));finish();await assert.rejects(()=>flight,/Account changed/);assert.deepEqual(s.reports.list(),[p]);
 const next=s.reports.run(p);s.storage.setItem('rm-study-report-v1:'+id(1)+':20',JSON.stringify(p)+' ');finish();await assert.rejects(()=>next,/Newer saved/);assert.equal(s.reports.list().length,1);
});
test('malformed days, alias fields, quota errors and inconsistent sequences fail before any RPC',()=>{
 for(const e of [{...event,day:'2026-02-30'},{...event,day:undefined},{...event,seq:0},{...event,payload:{}},{...event,taskId:'other'}])assert.throws(()=>studyEnvelope(e));
 const s=setup();s.reports.prepare(event);assert.throws(()=>s.reports.prepare({...event,day:'2026-11-27'}),/changed/);
 s.storage.setItem=()=>{throw Error('Quota exceeded')};assert.throws(()=>s.reports.prepare({...event,seq:21}),/Quota/);
});
