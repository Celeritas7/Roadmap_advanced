import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
async function fixture(work){
 const path=root+'hub-account-test.html';await writeFile(path,`<div id="root"></div><script src="/akatsuki/akatsuki-client.js"></script><script src="/akatsuki/rm-adapter.js"></script><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';import {accountClient,accountScope,startAccountLeader} from '/src/store/hub-account.ts';
 import {openHubOutbox,createHubOutbox,OUTBOX_LIMITS} from '/src/store/hub-outbox.ts';
 import {hubAccounts,preparedHubClient,refreshHubQueue,hubQueueView} from '/src/store/hub-account-sync.ts';
 import {HubQueueRecovery} from '/src/store/HubQueueRecovery.tsx';import {supabase} from '/src/lib/supabase.ts';import {useStore} from '/src/store/useStore.ts';
 import {bootHub,stopHub,hubPlaces,hubWhere,hubTags,hubInstance,refreshPlaces} from '/src/lib/rmHub.ts';
 import {readCheckin,saveCheckin,readDevice,saveDevice,readStuck,saveStuck} from '/src/lib/suggester.ts';
 import {sessionActions} from '/src/store/studySessions.ts';import {completions} from '/src/store/completion-sync.ts';
 await supabase.auth.getSession();window.A='22000000-0000-4000-8000-000000000001';window.B='22000000-0000-4000-8000-000000000002';
 window.calls=[];window.mode='ok';window.events=[];window.messages=[];window.activate=owner=>{window.owner=owner;hubAccounts.bind(owner);sessionActions.bind(owner);completions.bind(owner)};window.activate(window.A);
 supabase.auth.getSession=async()=>({data:{session:{user:{id:window.owner},access_token:'synthetic:'+window.owner}},error:null});
 const respond=async(kind,args,filters,token)=>{
  window.calls.push({kind,args:structuredClone(args),token});
  if(kind==='akatsuki_publish'){
   if(window.mode==='contract')return {data:null,error:{code:'AK101'}};
   if(window.mode==='queued')return {data:{status:'queued'},error:null};
   const saved=JSON.parse(localStorage.getItem('fixture-hub-records')||'{}');const row={...args.p,user_id:token.slice('Bearer synthetic:'.length),seq:Object.keys(saved).length+1,status:'pending'};saved[JSON.stringify([row.user_id,row.idempotency_key])]=row;localStorage.setItem('fixture-hub-records',JSON.stringify(saved));
   if(window.mode==='lost')throw Error('lost');return {data:{seq:row.seq,status:'pending'},error:null};
  }
  if(kind==='akatsuki_requests'){const saved=JSON.parse(localStorage.getItem('fixture-hub-records')||'{}');const row=saved[JSON.stringify([filters.user_id,filters.idempotency_key])];return {data:row??null,error:null}}
  if(kind==='akatsuki_consume')return {data:window.events,error:null};
  if(kind==='akatsuki_places'&&window.mode==='holdPlaces')return new Promise(resolve=>window.finishPlaces=()=>resolve({data:[{id:'A-private-place'}],error:null}));
  return {data:[],error:null};
 };
 const builder=(kind,args)=>{let token='',signal,filters={};const q={setHeader(k,v){if(k==='Authorization')token=v;return q},abortSignal(v){signal=v;return q},select(){return q},eq(k,v){filters[k]=v;return q},is(){return q},order(){return q},in(){return q},match(v){Object.assign(filters,v);return q},maybeSingle(){return q},then(yes,no){return new Promise((resolve,reject)=>{const abort=()=>reject(Error('aborted'));if(signal?.aborted){abort();return}signal?.addEventListener('abort',abort,{once:true});Promise.resolve().then(()=>respond(kind,args,filters,token)).then(resolve,reject).finally(()=>signal?.removeEventListener('abort',abort))}).then(yes,no)}};return q};
 supabase.rpc=(kind,args)=>builder(kind,args);supabase.from=table=>builder(table,{});
 window.database=openHubOutbox();window.newClient=()=>{const scope=hubAccounts.scope(),client=accountClient(supabase,scope),queue=createHubOutbox(scope,'rm',window.database,client,navigator.locks);window.queue=queue;window.scope=scope;return {...client,__hubAccount:{scope,outbox:queue,startLeader:startAccountLeader,report:m=>window.messages.push(m)}}};
 window.makeHub=()=>window.hub=window.Akatsuki(window.newClient(),'rm');window.makeHub();
 window.input=key=>({to:'wf',kind:'task.done',addr:{id:key,nested:{label:'日本語'}},payload:{notes:'keep notes',at:'2026-11-28T00:00:00Z'},key});
 window.enqueue=key=>window.hub.publish(window.input(key));window.list=()=>window.queue.list();window.flush=()=>window.queue.flush();window.begin=()=>{window.stopListen=window.hub.listen({},25)};
 window.checkin=()=>({checkin:readCheckin(),device:readDevice(),stuck:readStuck()});window.saveContext=()=>{saveCheckin('mid','A mood');saveDevice('laptop');saveStuck(20)};
 window.boot=()=>bootHub(useStore);window.stopHub=stopHub;window.refreshPlaces=refreshPlaces;window.hubCaches=()=>({places:hubPlaces(),where:hubWhere(),tags:hubTags(),instance:!!hubInstance()});
 window.refreshQueue=refreshHubQueue;window.queueView=hubQueueView;window.prepared=preparedHubClient;
 useStore.setState({tree:[],sessions:[],loading:false,initialized:true});createRoot(document.getElementById('root')).render(React.createElement(HubQueueRecovery));window.ready=true;
 </script>`);
 let server,browser;const errors=[];try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const context=await browser.newContext(),url='http://127.0.0.1:'+server.httpServer.address().port+'/hub-account-test.html';
  await context.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  async function page(){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>window.ready).catch(e=>{throw Error(e.message+"; page errors: "+errors.join(" | "))});return p}
  await work(await page(),page);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}
}
test('real IndexedDB survives reload, isolates accounts, and atomically retains two-tab requests and conflicts',async()=>fixture(async(a,newPage)=>{
 await a.evaluate(()=>{localStorage.setItem('akatsuki_outbox_rm','legacy-outbox');localStorage.setItem('rm-ak-checkin','legacy-checkin');localStorage.setItem('offline-pack','keep pack');localStorage.setItem('notes','keep notes');window.saveContext()});
 const b=await newPage();await Promise.all([a.evaluate(()=>window.enqueue('one')),b.evaluate(()=>window.enqueue('two'))]);assert.equal((await a.evaluate(()=>window.list())).length,2);
 const conflict=await b.evaluate(async()=>{try{await window.hub.publish({...window.input('one'),payload:{notes:'overwrite'}})}catch(e){return e.message}});assert.match(conflict,/different saved data/);
 await a.reload();await a.waitForFunction(()=>window.ready);assert.equal((await a.evaluate(()=>window.list())).length,2);assert.equal((await a.evaluate(()=>window.checkin())).checkin.mood,'A mood');
 await a.evaluate(()=>{window.activate(window.B);window.makeHub()});assert.equal((await a.evaluate(()=>window.list())).length,0);assert.equal((await a.evaluate(()=>window.checkin())).checkin,null);
 await a.evaluate(()=>{window.activate(window.A);window.makeHub()});assert.equal((await a.evaluate(()=>window.checkin())).checkin.mood,'A mood');assert.equal(await a.evaluate(()=>localStorage.getItem('offline-pack')),'keep pack');assert.equal(await a.evaluate(()=>localStorage.getItem('akatsuki_outbox_rm')),'legacy-outbox');assert.equal(await a.evaluate(()=>localStorage.getItem('rm-ak-checkin')),'legacy-checkin');assert.equal(await a.evaluate(()=>localStorage.getItem('notes')),'keep notes');
 await Promise.all([a.evaluate(()=>window.flush()),b.evaluate(()=>window.flush())]);assert.equal(await a.evaluate(()=>window.calls.filter(c=>c.kind==='akatsuki_publish').length)+await b.evaluate(()=>window.calls.filter(c=>c.kind==='akatsuki_publish').length),2);assert.deepEqual((await a.evaluate(()=>window.list())).map(r=>r.state),['sent','sent']);
}));
test('aggregate UTF-8 storage bound preserves all oversized saved evidence and sends nothing',async()=>fixture(async page=>{
 await page.evaluate(async()=>{await window.enqueue('base');const base=(await window.list())[0];await new Promise((resolve,reject)=>{const r=indexedDB.open('rm-hub-outbox-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('requests','readwrite'),s=tx.objectStore('requests');for(let i=1;i<190;i++){const effect={...base.effect,idempotency_key:'large-'+i,payload:{notes:'日'.repeat(15800)}},row={...base,identity:JSON.stringify([window.A,'rm',effect.idempotency_key]),effect};delete row.order;s.add(row)}tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}})});
 assert.match(await page.evaluate(async()=>{try{await window.flush()}catch(e){return e.message}}),/exceeds review limits/);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='akatsuki_publish').length),0);
 assert.equal(await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('rm-hub-outbox-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('requests').objectStore('requests').count();q.onsuccess=()=>{db.close();resolve(q.result)}}})),190);
}));
test('offline, foreground and pagehide lifecycle pause and release leadership without losing work',async()=>fixture(async page=>{
 await page.evaluate(()=>window.begin());await page.waitForFunction(()=>window.calls.some(c=>c.kind==='akatsuki_consume'));await page.context().setOffline(true);await page.waitForFunction(async()=>(await navigator.locks.query()).held.length===0);
 await page.evaluate(()=>window.enqueue('offline'));assert.equal((await page.evaluate(()=>window.list()))[0].state,'pending');await page.context().setOffline(false);await page.waitForFunction(()=>window.calls.some(c=>c.kind==='akatsuki_publish'));
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForFunction(async()=>(await navigator.locks.query()).held.length===0);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForFunction(async()=>(await navigator.locks.query()).held.some(l=>l.name.startsWith('rm-hub-leader')));
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.waitForFunction(async()=>(await navigator.locks.query()).held.length===0);assert.equal(await page.evaluate(()=>window.scope.signal.aborted),true);
}));
test('lost publication reconciles without resending; contract blocks remain visible through reload',async()=>fixture(async page=>{
 await page.evaluate(async()=>{await window.enqueue('lost');window.mode='lost';await window.flush()});assert.equal((await page.evaluate(()=>window.list()))[0].state,'pending');
 await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>window.flush());assert.equal((await page.evaluate(()=>window.list()))[0].state,'sent');assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='akatsuki_publish').length),0);
 await page.evaluate(async()=>{await window.enqueue('blocked');window.mode='contract';await window.flush();await window.refreshQueue()});await page.getByText(/contract requires review \(AK101\)/).waitFor();
 await page.reload();await page.waitForFunction(()=>window.ready);await page.getByRole('button',{name:'Retry saved hub requests'}).click();await page.getByText(/contract requires review \(AK101\)/).waitFor();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='akatsuki_publish').length),0);
}));
test('copied consumer stops after account changes during a handler, with no old ack or second handler',async()=>fixture(async page=>{
 await page.evaluate(()=>{window.events=[{seq:1,kind:'test'},{seq:2,kind:'test'}];window.handled=[];window.flight=window.hub.consume({test:async r=>{window.handled.push(r.seq);await new Promise(resolve=>window.finish=resolve);return {addr:{id:'original'}}}}).catch(e=>e.message)});await page.waitForFunction(()=>!!window.finish);
 await page.evaluate(()=>{window.activate(window.B);window.activate(window.A);window.finish()});assert.match(await page.evaluate(()=>window.flight),/stopped/);assert.deepEqual(await page.evaluate(()=>window.handled),[1]);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='akatsuki_ack'||c.kind==='akatsuki_defer').length),0);
 const late=await page.evaluate(async()=>{try{await window.hub.ack(1)}catch(e){return e.message}});assert.match(late,/stopped/);
}));
test('real Web Locks chooses one leader, cancels waiters, releases on stop and removes poll listeners',async()=>fixture(async(a,newPage)=>{
 const b=await newPage();await a.evaluate(()=>window.begin());await a.waitForFunction(()=>window.calls.filter(c=>c.kind==='akatsuki_consume').length>=2);await b.evaluate(()=>window.begin());
 await b.waitForFunction(async()=>(await navigator.locks.query()).pending.some(l=>l.name.startsWith('rm-hub-leader')));assert.equal(await b.evaluate(()=>window.calls.filter(c=>c.kind==='akatsuki_consume').length),0);
 await a.evaluate(()=>window.scope.stop());await b.waitForFunction(()=>window.calls.filter(c=>c.kind==='akatsuki_consume').length>=2);const count=await a.evaluate(()=>window.calls.length);
 await a.evaluate(()=>{window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'))});await b.evaluate(()=>window.scope.stop());await b.waitForFunction(async()=>(await navigator.locks.query()).held.length===0);assert.equal(await a.evaluate(()=>window.calls.length),count);
 // A waiter that signs out never takes over after the previous leader exits.
 await a.evaluate(()=>{window.activate(window.B);window.activate(window.A);window.makeHub();window.begin()});await a.waitForFunction(async()=>(await navigator.locks.query()).held.some(l=>l.name.startsWith('rm-hub-leader')));
 await b.evaluate(()=>{window.activate(window.B);window.activate(window.A);window.makeHub();window.begin();window.scope.stop()});const before=await b.evaluate(()=>window.calls.length);await a.evaluate(()=>window.scope.stop());await a.waitForFunction(async()=>(await navigator.locks.query()).held.length===0);assert.equal(await b.evaluate(()=>window.calls.length),before);
}));
test('copied boot clears account caches, rejects late reads, and never starts legacy generation or banners',async()=>fixture(async page=>{
 await page.evaluate(()=>window.boot());await page.waitForFunction(()=>window.calls.some(c=>c.kind==='akatsuki_consume'));await page.evaluate(()=>{window.mode='holdPlaces';window.read=window.refreshPlaces()});await page.waitForFunction(()=>!!window.finishPlaces);
 await page.evaluate(()=>{window.activate(window.B);window.finishPlaces()});await page.evaluate(()=>window.read);assert.deepEqual(await page.evaluate(()=>window.hubCaches()),{places:[],where:{now:[],visits:[],at:0},tags:[],instance:false});
 assert.equal(await page.evaluate(()=>window.calls.some(c=>c.kind==='roadmap_suggestions'||c.kind==='akatsuki_state')),false);
}));
test('record-count, UTF-8 size and damaged storage limits refuse safely without clearing any queue',async()=>fixture(async page=>{
 const oversized=await page.evaluate(async()=>{try{await window.hub.publish({...window.input('big'),payload:{notes:'日'.repeat(17000)}})}catch(e){return e.message}});assert.match(oversized,/oversized/);assert.equal((await page.evaluate(()=>window.list())).length,0);
 // Seed the reviewed store directly to exercise count/aggregate limits without
 // a thousand sequential UI actions. This is synthetic evidence only.
 await page.evaluate(async()=>{await window.enqueue('base');const base=(await window.list())[0];await new Promise((resolve,reject)=>{const r=indexedDB.open('rm-hub-outbox-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('requests','readwrite'),s=tx.objectStore('requests');for(let i=1;i<1000;i++){const effect={...base.effect,idempotency_key:'n-'+i},row={...base,order:undefined,identity:JSON.stringify([window.A,'rm',effect.idempotency_key]),effect};delete row.order;s.add(row)}tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}})});
 assert.equal((await page.evaluate(()=>window.list())).length,1000);assert.match(await page.evaluate(async()=>{try{await window.enqueue('over-count')}catch(e){return e.message}}),/full/);assert.equal((await page.evaluate(()=>window.list())).length,1000);
 // One damaged row blocks reads/sends; recovery never silently replaces it.
 await page.evaluate(async()=>{await new Promise(resolve=>{const r=indexedDB.open('rm-hub-outbox-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('requests','readwrite'),s=tx.objectStore('requests'),q=s.get(1);q.onsuccess=()=>s.put({...q.result,state:'damaged'});tx.oncomplete=()=>{db.close();resolve()}}})});assert.match(await page.evaluate(async()=>{try{await window.flush()}catch(e){return e.message}}),/review/);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind==='akatsuki_publish').length),0);
}));
