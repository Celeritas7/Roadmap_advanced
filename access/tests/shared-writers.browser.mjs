import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
async function fixture(work){const path=root+'shared-writer-test.html';await writeFile(path,`<div id="root"></div><script src="/akatsuki/akatsuki-client.js"></script><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';import {supabase} from '/src/lib/supabase.ts';
 import {hubAccounts,preparedHubClient} from '/src/store/hub-account-sync.ts';import {SharedWriteRecovery} from '/src/store/SharedWriteRecovery.tsx';
 await supabase.auth.getSession();window.A='23000000-0000-4000-8000-000000000001';window.B='23000000-0000-4000-8000-000000000002';window.owner=window.A;hubAccounts.bind(window.owner);
 window.calls=[];window.mode='ok';window.kind='document';window.changed=()=>{};
 const targets={document:{kind:'document',doc:'task_tags',path:'rm',key:'fixture/日本語'},place:{kind:'place',id:'fixture-cafe'}};
 const changes={document:{op:'put',value:{nested:{note:'My original draft'}}},place:{op:'create',label:'My original draft',class:'cafe',aliases:[],ord:100}};
 const load=()=>JSON.parse(localStorage.getItem('fixture-shared-server:'+window.owner)||'{"records":{},"receipts":{},"seq":0}');
 const save=s=>localStorage.setItem('fixture-shared-server:'+window.owner,JSON.stringify(s));
 const key=t=>JSON.stringify(t,Object.keys(t).sort()),revision=n=>String(n).padStart(32,'0');
 const snapshot=t=>{const s=load(),r=s.records[key(t)];return {protocol:'roadmap.shared.v1',owner:window.owner,target:t,revision:r?revision(r.seq):null,record:r??null}};
 function changeRecord(s,t,c){s.seq++;const old=s.records[key(t)];
  s.records[key(t)]=t.kind==='document'?{user_id:window.owner,doc:t.doc,path:t.path,item_key:t.key,owner_app:'rm',updated_by:'rm',seq:s.seq,value:c.value,deleted_at:null,updated_at:'2026-11-28T00:00:00Z'}:
   {user_id:window.owner,id:t.id,label:c.label,class:'cafe',aliases:[],ord:100,lat:35.9,lng:139.6,radius_m:80,retired_at:c.retired_at??old?.retired_at??null,seq:s.seq};save(s)
 }
 window.newer=label=>{const s=load(),t=targets[window.kind];changeRecord(s,t,{label,value:{nested:{note:label}},retired_at:window.kind==='place'?'2026-11-28T01:00:00Z':null})};
 const respond=async(name,args)=>{
  window.calls.push({name,args:structuredClone(args)});const t=args.p_target;
  if(name==='ga_roadmap_shared_read')return {data:snapshot(t),error:null};
  if(name!=='ga_roadmap_shared_write')throw Error('Unexpected shared mutation '+name);
  const s=load(),prior=s.receipts[args.p_request_id],r={protocol:'roadmap.shared.v1',owner:window.owner,target:t,request_id:args.p_request_id,expected_revision:args.p_expected_revision,change:args.p_change,replayed:!!prior,status:prior||snapshot(t).revision===args.p_expected_revision?'saved':'conflict'};
  if(r.status==='saved'){if(!prior){changeRecord(s,t,args.p_change);s.receipts[args.p_request_id]=revision(s.seq);save(s)}r.applied_revision=s.receipts[args.p_request_id]}
  r.current=snapshot(t);if(window.mode==='hold')await new Promise(resolve=>window.finish=resolve);if(window.mode==='bad')r.request_id=window.B;
  return window.mode==='lost'?{data:null,error:{code:'504'}}:{data:r,error:null}
 };
 supabase.auth.getSession=async()=>({data:{session:{user:{id:window.owner},access_token:'synthetic:'+window.owner}},error:null});
 supabase.rpc=(name,args)=>{const q={setHeader(){return q},abortSignal(){return q},then(yes,no){return respond(name,args).then(yes,no)}};return q};
 window.writer=()=>preparedHubClient().__hubAccount.shared;window.makeHub=()=>window.hub=window.Akatsuki(preparedHubClient(),'rm');window.makeHub();
 window.prepare=async()=>{const t=targets[window.kind],s=await window.hub.reviewShared(t);return window.hub.prepareShared(s,changes[window.kind])};
 window.pending=()=>window.writer().list();window.savedHistory=()=>window.writer().history();
 window.switchABA=()=>{hubAccounts.bind(window.B);hubAccounts.bind(window.A);window.makeHub()};
 const nativeSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){
  if(k.startsWith('rm-shared-write-v1:')){const slot=JSON.parse(v);if(slot.active===null&&slot.history.at(-1)?.resolution==='saved'&&!document.querySelector('[aria-label="Latest shared value"]')?.textContent.includes('Later shared value'))throw Error('Recovery cleared before latest value rendered')}
  return nativeSet.call(this,k,v)
 };
 localStorage.setItem('offline-pack','keep');localStorage.setItem('notes','keep notes');
 createRoot(document.getElementById('root')).render(React.createElement(SharedWriteRecovery));window.ready=true;
 </script>`);let server,browser;try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const context=await browser.newContext(),errors=[],url='http://127.0.0.1:'+server.httpServer.address().port+'/shared-writer-test.html';await context.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  async function newPage(){const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.addEventListener('error',e=>window.fixtureError=e.message);window.addEventListener('unhandledrejection',e=>window.fixtureError=String(e.reason))});await page.goto(url);await page.waitForFunction(()=>window.ready||window.fixtureError);assert.equal(await page.evaluate(()=>window.fixtureError),undefined,errors.join(' | '));return page}
  await work(await newPage(),newPage);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}}
for(const kind of ['document','place'])test(kind+': copied hub retains lost save across reload and renders current value before clearing recovery',async()=>fixture(async page=>{
 await page.evaluate(kind=>window.kind=kind,kind);await page.evaluate(()=>window.prepare());await page.evaluate(()=>window.mode='lost');await page.getByRole('button',{name:'Retry original shared draft',exact:true}).click();await page.getByText(/Shared save was not confirmed/).waitFor();
 assert.equal((await page.evaluate(()=>window.pending())).length,1);await page.evaluate(()=>window.newer('Later shared value'));await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(kind=>window.kind=kind,kind);
 await page.getByRole('button',{name:'Retry original shared draft',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);assert.match(await page.getByLabel('Latest shared value',{exact:true}).textContent(),/Later shared value/);
 assert.equal((await page.evaluate(()=>window.savedHistory()))[0].resolution,'saved');assert.equal(await page.evaluate(()=>localStorage.getItem('offline-pack')),'keep');assert.equal(await page.evaluate(()=>localStorage.getItem('notes')),'keep notes');
 if(kind==='place')assert.match(await page.getByLabel('Latest shared value',{exact:true}).textContent(),/2026-11-28T01:00:00Z/);
}));
test('shared conflict compares both values; reviewed rebase cannot overwrite a later edit and keeping current preserves draft history',async()=>fixture(async page=>{
 const original=await page.evaluate(()=>window.prepare());await page.evaluate(()=>window.newer('Someone else'));await page.getByRole('button',{name:'Retry original shared draft',exact:true}).click();await page.getByText(/A newer shared value was kept/).waitFor();
 assert.match(await page.getByLabel('Your saved draft').textContent(),/My original draft/);await page.evaluate(()=>window.newer('Later shared value'));await page.getByRole('button',{name:'Save draft against reviewed version',exact:true}).click();await page.getByText(/A newer shared value was kept/).waitFor();
 const pending=await page.evaluate(()=>window.pending());assert.equal(pending.length,1);assert.notEqual(pending[0].requestId,original.requestId);await page.getByRole('button',{name:'Keep latest value',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);
 assert.deepEqual((await page.evaluate(()=>window.savedHistory())).map(h=>h.resolution),['rebased','kept-current']);assert.equal((await page.evaluate(()=>window.savedHistory()))[0].intent.requestId,original.requestId);
}));
test('delayed A–B–A and malformed shared replies retain the original recovery without showing stale account data',async()=>fixture(async page=>{
 await page.evaluate(()=>window.prepare());await page.evaluate(()=>window.mode='hold');await page.getByRole('button',{name:'Retry original shared draft',exact:true}).click();await page.waitForFunction(()=>!!window.finish);
 await page.evaluate(()=>{window.switchABA();window.finish()});await page.getByText(/Account work stopped/).waitFor();assert.equal(await page.getByLabel('Latest shared value',{exact:true}).count(),0);assert.equal((await page.evaluate(()=>window.pending())).length,1);
 await page.evaluate(()=>window.mode='bad');await page.getByRole('button',{name:'Retry original shared draft',exact:true}).click();await page.getByText(/Shared save was not confirmed/).waitFor();assert.equal((await page.evaluate(()=>window.pending())).length,1);
}));
test('two browser tabs cannot replace a pending shared draft with a different version or nested value',async()=>fixture(async(a,newPage)=>{
 const b=await newPage();await a.evaluate(()=>window.prepare());
 const result=await b.evaluate(async()=>{try{const t={kind:'document',doc:'task_tags',path:'rm',key:'fixture/日本語'},s=await window.hub.reviewShared(t);await window.hub.prepareShared(s,{op:'put',value:{nested:{note:'Other tab'}}})}catch(e){return e.message}});
 assert.match(result,/Resolve the saved shared draft/);assert.equal((await a.evaluate(()=>window.pending()))[0].change.value.nested.note,'My original draft');assert.equal((await b.evaluate(()=>window.pending())).length,1);
}));
