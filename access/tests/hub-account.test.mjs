import {test} from 'node:test';import assert from 'node:assert/strict';
import {accountScope,accountClient,createHubAccounts,ownerStorage,startAccountLeader} from '../staging/hub-account.ts';
import {createHubOutbox,validateEffect,canonical} from '../staging/hub-outbox.ts';
const A='22000000-0000-4000-8000-000000000001',B='22000000-0000-4000-8000-000000000002';
const input=(key='request-1')=>({to:'wf',kind:'task.done',addr:{nested:{id:'original'}},payload:{at:'2026-11-28T00:00:00Z',notes:'keep 日本語'},key});
const effect=()=>({from_app:'rm',to_app:'wf',kind:'task.done',src_addr:{nested:{id:'original'}},src_clock:null,payload:{at:'2026-11-28T00:00:00Z',notes:'keep 日本語'},idempotency_key:'request-1'});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
function memory(){const rows=new Map();return {rows,
 async list(scope,app){scope.assert();return structuredClone([...rows.values()].filter(r=>r.owner===scope.owner&&r.app===app))},
 async add(scope,app,e){scope.assert();validateEffect(e,app);const identity=JSON.stringify([scope.owner,app,e.idempotency_key]),old=rows.get(identity);if(old){if(canonical(old.effect)!==canonical(e))throw Error('conflict');return structuredClone(old)}const r={identity,owner:scope.owner,app,effect:structuredClone(e),state:'pending',receipt:null,reason:null};rows.set(identity,r);return structuredClone(r)},
 async update(scope,old,patch){scope.assert();assert.equal(canonical(rows.get(old.identity)),canonical(old));const r={...old,...patch};rows.set(old.identity,r);return structuredClone(r)},
 }}
function fixture(){const scope=accountScope(A),store=memory(),requests=new Map(),calls=[];let mode='ok';
 const client={rpc:async(name,args)=>{calls.push({name,args});if(mode==='contract')return {error:{code:'AK101'}};if(mode==='auth')return {error:{code:'42501'}};if(mode==='queued')return {data:{status:'queued'}};requests.set(args.p.idempotency_key,{...structuredClone(args.p),user_id:A,seq:calls.length,status:'pending'});if(mode==='lost')throw Error('lost response');return {data:{seq:calls.length,status:'pending'}}},
 from:()=>{let key;const q={select:()=>q,eq:(name,value)=>{if(name==='idempotency_key')key=value;return q},maybeSingle:async()=>({data:requests.get(key)??null,error:null})};return q}};
 let last=Promise.resolve();const locks={request:(_name,_opts,work)=>{const run=last.then(work);last=run.catch(()=>{});return run}};
 const queue=createHubOutbox(scope,'rm',store,client,locks);return {scope,store,requests,calls,client,locks,queue,setMode:m=>{mode=m}};
}
test('scope stops once, runs late cleanup immediately, and A→B→A never revives an old scope',()=>{
 const accounts=createHubAccounts();accounts.bind(A);const a=accounts.scope();let cleaned=0;a.cleanup(()=>cleaned++);accounts.bind(A);assert.equal(accounts.scope(),a);accounts.bind(B);accounts.bind(A);a.cleanup(()=>cleaned++);a.stop();assert.equal(cleaned,2);assert.throws(()=>a.assert(),/stopped/);assert.notEqual(accounts.scope(),a);
});
test('owner-scoped context never adopts or clears legacy or another account data',()=>{
 const values=new Map([['rm-ak-checkin','legacy'],['offline-pack','unchanged']]);const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const accounts=createHubAccounts(),context=ownerStorage(storage,()=>accounts.scope());assert.equal(context.getItem('rm-ak-checkin'),null);assert.throws(()=>context.setItem('rm-ak-checkin','x'),/Sign in/);
 accounts.bind(A);context.setItem('rm-ak-checkin','A');accounts.bind(B);assert.equal(context.getItem('rm-ak-checkin'),null);context.setItem('rm-ak-checkin','B');accounts.bind(A);assert.equal(context.getItem('rm-ak-checkin'),'A');context.removeItem('rm-ak-checkin');assert.equal(values.get('rm-ak-checkin'),'legacy');assert.equal(values.get('offline-pack'),'unchanged');assert.equal(values.get('rm-hub-context-v1:'+B+':rm-ak-checkin'),'B');
});
test('lazy RPC and query builders capture original JWT and reject stale responses',async()=>{
 const scope=accountScope(A),seen=[];let finish;
 const builder={select(){return this},setHeader(k,v){seen.push([k,v]);return this},abortSignal(signal){seen.push(signal);return this},then(yes,no){return new Promise(resolve=>{finish=resolve}).then(yes,no)}};
 const base={auth:{getSession:async()=>({data:{session:{user:{id:A},access_token:'synthetic-a'}}})},rpc:()=>builder,from:()=>builder};
 const client=accountClient(base,scope),flight=Promise.resolve(client.from('owned').select('*'));await new Promise(setImmediate);assert.equal(seen[0][1],'Bearer synthetic-a');scope.stop();finish({data:['private-a']});await assert.rejects(flight,/stopped/);assert.throws(()=>client.rpc('write',{}),/stopped/);
});
test('account change during session lookup sends no old payload with a new token',async()=>{
 const scope=accountScope(A);let resolve,calls=0;const base={auth:{getSession:()=>new Promise(r=>{resolve=r})},rpc:()=>({setHeader(){calls++;return this},abortSignal(){return this},then(r){r({data:1})}}),from:()=>null};
 const result=Promise.resolve(accountClient(base,scope).rpc('write',{}));await new Promise(setImmediate);scope.stop();resolve({data:{session:{user:{id:B},access_token:'synthetic-b'}}});await assert.rejects(result,/stopped/);assert.equal(calls,0);
});
test('anonymous and foreign sessions cannot dispatch under a captured account',async()=>{
 for(const user of [{id:B},{id:A,is_anonymous:true}]){let sent=0;const scope=accountScope(A),b={setHeader(){sent++;return this},abortSignal(){return this},then(r){r({data:[]})}};const base={auth:{getSession:async()=>({data:{session:{user,access_token:'synthetic'}}})},rpc:()=>b,from:()=>b};await assert.rejects(Promise.resolve(accountClient(base,scope).rpc('write',{})),/original/);assert.equal(sent,0)}
});
test('queue persists exact request before sending, preserves nested JSON and idempotency conflicts',async()=>{
 const f=fixture(),p=input();assert.equal((await f.queue.publish(p)).status,'queued');assert.equal(f.calls.length,0);p.payload.notes='later';assert.equal((await f.queue.list())[0].effect.payload.notes,'keep 日本語');await assert.rejects(f.queue.publish({...input(),payload:{notes:'different'}}),/conflict/);await f.queue.flush();assert.equal(f.calls.length,1);assert.equal((await f.queue.list())[0].state,'sent');await f.queue.publish(input());await f.queue.flush();assert.equal(f.calls.length,1);
});
test('committed but lost reply recovers the original row without republishing',async()=>{
 const f=fixture();await f.queue.publish(input());f.setMode('lost');await f.queue.flush();assert.equal((await f.queue.list())[0].state,'pending');f.setMode('ok');await f.queue.flush();assert.equal(f.calls.length,1);assert.equal((await f.queue.list())[0].receipt.seq,1);
});
test('contract blocks and mismatched owned evidence stay visible and stop later effects',async()=>{
 const f=fixture();await f.queue.publish(input());await f.queue.publish(input('later'));f.setMode('contract');await f.queue.flush();await f.queue.flush();assert.equal(f.calls.length,1);assert.equal((await f.queue.list())[0].state,'blocked');assert.equal((await f.queue.list())[1].state,'pending');
 const g=fixture();await g.queue.publish(input());g.requests.set('request-1',{...effect(),user_id:B,seq:1,status:'pending'});await g.queue.flush();assert.equal(g.calls.length,0);assert.equal((await g.queue.list())[0].state,'blocked');
});
test('empty or queued response and auth refusals never confirm or remove saved work',async()=>{
 for(const mode of ['queued','auth']){const f=fixture();await f.queue.publish(input());f.setMode(mode);await f.queue.flush();assert.equal((await f.queue.list())[0].state,'pending');assert.equal((await f.queue.list()).length,1)}
});
test('different accounts see separate requests even with identical app/request keys',async()=>{
 const f=fixture(),b=createHubOutbox(accountScope(B),'rm',f.store,f.client,f.locks);await f.queue.publish(input());assert.equal((await b.list()).length,0);await b.publish(input());assert.equal((await f.queue.list()).length,1);assert.equal(f.store.rows.size,2);f.scope.stop();assert.throws(()=>f.queue.flush(),/stopped/);
});
test('storage refusal sends nothing and missing Web Locks pauses sending without losing work',async()=>{
 const f=fixture(),queue=createHubOutbox(f.scope,'rm',{...f.store,add:async()=>{throw Error('quota')}},f.client,f.locks);await assert.rejects(queue.publish(input()),/quota/);assert.equal(f.calls.length,0);
 const paused=createHubOutbox(f.scope,'rm',f.store,f.client,undefined);await paused.publish(input());await assert.rejects(paused.flush(),/Web Locks/);assert.equal((await paused.list()).length,1);assert.equal(f.calls.length,0);
});
test('explicit keys, UTF-8 byte bounds, plain finite JSON and depth are enforced before save',()=>{
 for(const change of [{idempotency_key:''},{payload:{v:'日'.repeat(17000)}},{payload:{n:NaN}},{payload:{d:undefined}},{to_app:''}])assert.throws(()=>validateEffect({...effect(),...change},'rm'));
 const e=effect();e.payload.deep=e;assert.throws(()=>validateEffect(e,'rm'),/deeply/);assert.doesNotThrow(()=>validateEffect(effect(),'rm'));
});
test('unsupported Web Locks pauses background work explicitly without invoking a tick',()=>{
 let ticks=0,message='';const stop=startAccountLeader(accountScope(A),async()=>{ticks++},m=>{message=m});stop();assert.equal(ticks,0);assert.match(message,/paused.*Web Locks/);
});
