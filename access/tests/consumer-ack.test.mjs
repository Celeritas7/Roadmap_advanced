import {test} from 'node:test';import assert from 'node:assert/strict';import {confirmConsumer} from '../staging/consumer-ack.ts';
test('checked consumer acknowledgement rejects another sequence/kind, missing proof and failed responses',async()=>{
 for(const kind of ['suggestion.answered','session.completed']){
  const result=()=>({error:null,data:{seq:42,kind,status:'delivered',outcome:kind==='suggestion.answered'?'applied':'reported',replayed:false}});
  for(const corrupt of [r=>r.error={code:'42501'},r=>r.data.seq=41,r=>r.data.kind='task.upsert',r=>r.data.status='pending',r=>delete r.data.replayed,r=>r.data.outcome='invented',r=>r.data=null]){
   await assert.rejects(()=>confirmConsumer({rpc:async()=>{const r=result();corrupt(r);return r}},42,kind,()=>{}),/not confirmed/);
  }
  let checks=0;await confirmConsumer({rpc:async(n,a)=>{assert.equal(n,'ga_roadmap_ack_consumer_event');assert.deepEqual(a,{p_seq:42});return result()}},42,kind,()=>checks++);assert.equal(checks,2);
 }
});
