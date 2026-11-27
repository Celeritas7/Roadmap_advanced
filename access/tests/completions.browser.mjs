import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
async function fixture(work){
 const path=root+'completion-test.html';await writeFile(path,`<div id="root"></div><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';import {useStore} from '/src/store/useStore.ts';import {supabase} from '/src/lib/supabase.ts';
 import {CompletionRecovery} from '/src/store/CompletionRecovery.tsx';import {completions} from '/src/store/completion-sync.ts';
 import {tickMirror,pollReplies} from '/src/lib/rmHub.ts';import * as suggest from '/src/lib/suggester.ts';
 await supabase.auth.getSession();const id=n=>'f9000000-0000-4000-8000-'+String(n).padStart(12,'0');completions.bind(id(1));suggest.attach(useStore);
 const row={id:id(3),parent_id:null,title:'Keep 日本語 <script>text<'+'/script>',kind:'task',done:false,tags:['wf','lang'],expanded:true,position:0,streak:3,streak_day:null,created_at:'2026-11-27T00:00:00Z',updated_at:'2026-11-27T00:00:00Z'};
 const history={log:[{id:id(7),notes:'Keep 日本語 notes'}],sessions:[{id:id(8),feedback:{keep:'proof'},verification:'app'}]};
 useStore.setState({tree:[row],...history,loading:false,initialized:true});
 localStorage.setItem('offline-pack','keep-pack');localStorage.setItem('rm-ak-pending-done','legacy-keep');localStorage.setItem('rm-ak-reply-seq','999999999');
 window.requests=JSON.parse(localStorage.getItem('fixture-done-requests')||'{}');window.mode='lost';window.reply='pending';window.calls=[];
 const save=()=>localStorage.setItem('fixture-done-requests',JSON.stringify(window.requests));
 window.state=()=>useStore.getState();window.pending=()=>completions.list();window.switchAccount=()=>completions.bind(id(2));
 const reply=request=>({request_id:request.id,task_id:id(3),state:request.published?window.reply:'unpublished',reply_seq:request.published&&window.reply!=='pending'?30:0,
  tasks:request.published&&window.reply!=='pending'?[{...row,done:true}]:[],suggestion:null});
 const rpc=async(name,args)=>{
  window.calls.push({name,args:structuredClone(args)});
  if(name==='ga_roadmap_prepare_done'){
   const r=window.requests[args.p_request_id]??={id:args.p_request_id,published:false};save();
   const address={board_id:'board/a',item_key:'study:日本語',sub_id:'task',extra:{keep:'exact'}};
   return {error:null,data:{requested_id:args.p_request_id,request_id:r.id,task_id:id(3),closed:r.published&&window.reply==='applied',publishable:true,effect:{from_app:'rm',to_app:'wf',kind:'task.done',src_clock:null,
    src_addr:address,idempotency_key:'rm:done:'+r.id,payload:{...address,at:'2026-11-27T00:00:00Z',suggestion_id:null}}}};
  }
  if(name==='akatsuki_publish'){
   if(window.mode==='contract')return {error:{code:'AK103'},data:null};const r=window.requests[args.p.idempotency_key.slice(8)];r.published=true;save();
   return window.mode==='lost'?{error:{code:'504'},data:null}:{error:null,data:[{seq:20,status:'pending'}]};
  }
  if(name==='ga_roadmap_reconcile_done'){
   const r=window.requests[args.p_request_id];if(window.mode==='hold'&&r.published)return new Promise(resolve=>window.finish=()=>resolve({error:null,data:reply(r)}));
   return {error:null,data:reply(r)};
  }
  if(name==='ga_roadmap_done_recovery')return {error:null,data:Object.values(window.requests).map(r=>({request_id:r.id,task_id:id(3),suggestion_id:null}))};
  throw Error('Unexpected RPC '+name);
 };
 supabase.auth.getSession=async()=>({data:{session:{user:{id:id(1)},access_token:'synthetic-account-a-token'}},error:null});
 supabase.rpc=(name,args)=>{const result=rpc(name,args);return {then:result.then.bind(result),setHeader:()=>result}};
 window.complete=()=>tickMirror(id(3)).then(()=>'',e=>e.message);window.poll=()=>pollReplies().then(()=>'',e=>e.message);
 function Scene(){const tree=useStore(s=>s.tree);return React.createElement(React.Fragment,{},React.createElement('button',{onClick:()=>void window.complete()},'Complete mirror'),
  React.createElement('output',{},tree[0].done?'Completed':'Open'),React.createElement(CompletionRecovery))}
 createRoot(document.getElementById('root')).render(React.createElement(Scene));window.ready=true;
 </script>`);
 let server,browser;try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/completion-test.html');await page.waitForFunction(()=>window.ready===true);await work(page);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}
}
test('actual completion handler and retry panel recover a lost publish response without duplicate send or early checkbox',async()=>fixture(async page=>{
 const history=await page.evaluate(()=>({sessions:window.state().sessions,log:window.state().log}));
 await page.getByRole('button',{name:'Complete mirror',exact:true}).click();await page.getByText(/publication was not confirmed/).waitFor();assert.equal(await page.locator('output').textContent(),'Open');
 const first=await page.evaluate(()=>window.calls.find(c=>c.name==='akatsuki_publish'));await page.reload();await page.waitForFunction(()=>window.ready===true);await page.evaluate(()=>window.mode='ok');
 await page.getByRole('button',{name:'Retry completion',exact:true}).click();await page.getByText(/Waiting for the source reply/).waitFor();assert.equal(await page.locator('output').textContent(),'Open');assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='akatsuki_publish').length),0);
 await page.evaluate(()=>window.reply='applied');await page.getByRole('button',{name:'Check completion replies',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);assert.equal(await page.locator('output').textContent(),'Completed');
 assert.equal(await page.evaluate(()=>Object.keys(window.requests).length),1);assert.ok(first.args.p.idempotency_key.startsWith('rm:done:'));assert.deepEqual(await page.evaluate(()=>({sessions:window.state().sessions,log:window.state().log})),history);
 for(const [key,value] of [['offline-pack','keep-pack'],['rm-ak-pending-done','legacy-keep'],['rm-ak-reply-seq','999999999']])assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),value);
}));
test('a reply arriving after account switch never checks the new view or clears the original recovery',async()=>fixture(async page=>{
 await page.evaluate(()=>{window.mode='hold';window.reply='applied';window.flight=window.complete()});await page.waitForFunction(()=>!!window.finish);
 await page.evaluate(()=>{window.switchAccount();window.finish()});assert.match(await page.evaluate(()=>window.flight),/Account changed/);assert.equal(await page.locator('output').textContent(),'Open');assert.equal(await page.evaluate(()=>window.pending().length),0);
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rm-completion-v1:')).length),1);
}));
test('contract blocks remain visible without republishing; a late response preserves newer local edits',async()=>fixture(async page=>{
 await page.evaluate(()=>window.mode='contract');assert.match(await page.evaluate(()=>window.complete()),/contract requires review/);await page.getByRole('button',{name:'Check saved reply',exact:true}).click();await page.getByText(/has not been published/).waitFor();
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='akatsuki_publish').length),1);
 await page.evaluate(()=>{Object.values(window.requests)[0].published=true;window.mode='hold';window.reply='applied';window.flight=window.poll()});await page.waitForFunction(()=>!!window.finish);
 await page.evaluate(()=>{window.state().tree[0].expanded=false;window.finish()});assert.match(await page.evaluate(()=>window.flight),/Newer local work/);assert.equal(await page.evaluate(()=>window.state().tree[0].expanded),false);assert.equal(await page.locator('output').textContent(),'Open');assert.equal(await page.evaluate(()=>window.pending().length),1);
}));
