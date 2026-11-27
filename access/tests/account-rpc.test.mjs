import {test} from 'node:test';import assert from 'node:assert/strict';import {accountRpc} from '../staging/account-rpc.ts';
test('saved answer RPC carries the captured account token even if the SDK default changes just before fetch',async()=>{
 let context={owner:'a',epoch:1},sdkToken='a-token',headers;
 const rpc=accountRpc({auth:{getSession:async()=>({data:{session:{user:{id:'a'},access_token:sdkToken}},error:null})},
  rpc:()=>{sdkToken='b-token';return {setHeader:(name,value)=>{headers={[name]:value};return Promise.resolve({data:'ok',error:null})}}}},()=>({...context}),c=>{if(c.owner!==context.owner||c.epoch!==context.epoch)throw Error('Account changed')});
 assert.deepEqual(await rpc.rpc('akatsuki_publish',{p:{reason:'Private A'}}),{data:'ok',error:null});assert.equal(sdkToken,'b-token');assert.deepEqual(headers,{Authorization:'Bearer a-token'});
});
test('account changes while reading the session and mismatched session owners send nothing',async()=>{
 for(const mode of ['epoch','owner','missing']){
  let context={owner:'a',epoch:1},calls=0;
  const rpc=accountRpc({auth:{getSession:async()=>{if(mode==='epoch')context={owner:'a',epoch:3};return {data:{session:mode==='missing'?null:{user:{id:mode==='owner'?'b':'a'},access_token:'synthetic'}},error:null}}},
   rpc:()=>{calls++;throw Error('must not send')}},()=>({...context}),c=>{if(c.owner!==context.owner||c.epoch!==context.epoch)throw Error('Account changed')});
  await assert.rejects(()=>rpc.rpc('akatsuki_publish',{p:{reason:'Private A'}}));assert.equal(calls,0);
 }
});
