import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
async function fixture(work){
 const path=root+'mirrors-test.html';await writeFile(path,`<div id="root"></div><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {useStore} from '/src/store/useStore.ts';import {supabase} from '/src/lib/supabase.ts';
 import {MirrorRecovery} from '/src/store/MirrorRecovery.tsx';import {mirrors} from '/src/store/mirror-sync.ts';
 import {onTask,hubAddrOf,rmIdOf} from '/src/lib/rmHub.ts';
 await supabase.auth.getSession();const id=n=>'f8000000-0000-4000-8000-'+String(n).padStart(12,'0');mirrors.bind(id(1));
 const personal={id:id(7),parent_id:null,title:'Personal task',tags:[],done:false,kind:'task',position:0,expanded:true,streak:3,streak_day:null,created_at:'2026-11-26T00:00:00Z',updated_at:'2026-11-26T00:00:00Z'};
 const history={sessions:[{id:id(8),feedback:{keep:'proof'},verification:'app'}],log:[{id:id(9),notes:'Keep 日本語 notes'}]};
 useStore.setState({tree:[personal],...history,loading:false,initialized:true});localStorage.setItem('offline-pack','keep-pack');localStorage.setItem('rm-ak-pending-done','legacy-keep');
 window.event={address:{board_id:'board/a',item_key:'study:日本語',sub_id:'task',extra:{keep:'exact'}},payload:{title:'Keep 日本語 <script>text<'+'/script>',done:true},seq:18};
 window.calls=[];window.mode='lost';window.state=()=>useStore.getState();window.pending=()=>mirrors.list();window.pair=()=>hubAddrOf(id(3));window.lookup=a=>rmIdOf(a);
 window.switchAccount=()=>mirrors.bind(id(2));window.receipts=JSON.parse(localStorage.getItem('fixture-mirror-receipts')||'{}');
 const commit=args=>{
  let r=window.receipts[args.p_seq];if(!r){r={seq:args.p_seq,address:args.p_address,last_seq:args.p_seq,replayed:false,task_id:id(3),source_deleted:false,suppressed:false,
   tasks:[{...personal,id:id(3),title:args.p_payload.title,done:true,tags:['wf','lang'],streak:0}]};window.receipts[args.p_seq]=r;localStorage.setItem('fixture-mirror-receipts',JSON.stringify(window.receipts))}
  return {error:null,data:structuredClone(r)};
 };
 supabase.auth.getSession=async()=>({data:{session:{user:{id:id(1)},access_token:'synthetic-account-a-token'}},error:null});
 const rpc=async(name,args)=>{window.calls.push({name,args:structuredClone(args)});if(name!=='ga_roadmap_receive_task')throw Error('Unexpected RPC '+name);
  if(window.mode==='hold')return new Promise(resolve=>window.finish=()=>resolve(commit(args)));
  const r=commit(args);return window.mode==='lost'?{error:{code:'504'},data:null}:r;
 };
 supabase.rpc=(name,args)=>{const result=rpc(name,args);return {then:result.then.bind(result),setHeader:()=>result}};
 window.deliver=()=>onTask(window.event.address,window.event.payload,window.event.seq).then(id=>({id}),e=>({error:e.message}));
 createRoot(document.getElementById('root')).render(React.createElement(MirrorRecovery));window.ready=true;
 </script>`);
 let server,browser;try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/mirrors-test.html');await page.waitForFunction(()=>window.ready===true);await work(page);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}
}
test('actual mirror handler recovers lost response across reload without duplicate tasks, lost history or offline packs',async()=>fixture(async page=>{
 const before=await page.evaluate(()=>({personal:window.state().tree[0],sessions:window.state().sessions,log:window.state().log}));
 assert.match((await page.evaluate(()=>window.deliver())).error,/not confirmed/);await page.getByRole('button',{name:'Retry mirror delivery',exact:true}).waitFor();
 const first=await page.evaluate(()=>window.calls[0]);await page.reload();await page.waitForFunction(()=>window.ready===true);await page.evaluate(()=>window.mode='ok');
 await page.getByRole('button',{name:'Retry mirror delivery',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);assert.deepEqual(await page.evaluate(()=>window.calls[0]),first);
 assert.deepEqual(await page.evaluate(()=>({personal:window.state().tree[0],sessions:window.state().sessions,log:window.state().log})),before);
 assert.equal(await page.evaluate(()=>window.state().tree.length),2);const pair=await page.evaluate(()=>window.pair());assert.deepEqual(pair,await page.evaluate(()=>window.event.address));
 await page.evaluate(()=>window.deliver());assert.equal(await page.evaluate(()=>window.state().tree.length),2);assert.equal(await page.evaluate(()=>Object.keys(window.receipts).length),1);
 assert.equal(await page.evaluate(()=>localStorage.getItem('offline-pack')),'keep-pack');assert.equal(await page.evaluate(()=>localStorage.getItem('rm-ak-pending-done')),'legacy-keep');
}));
test('account switches clear in-memory pair lookups and late responses retain only the original owner retry',async()=>fixture(async page=>{
 await page.evaluate(()=>window.mode='ok');await page.evaluate(()=>window.deliver());assert.ok(await page.evaluate(()=>window.pair()));
 await page.evaluate(()=>{window.event.seq=19;window.mode='hold';window.flight=window.deliver()});await page.waitForFunction(()=>!!window.finish);
 const before=await page.evaluate(()=>window.state().tree);await page.evaluate(()=>{window.switchAccount();window.finish()});assert.match((await page.evaluate(()=>window.flight)).error,/Account changed/);
 assert.deepEqual(await page.evaluate(()=>window.state().tree),before);assert.equal(await page.evaluate(()=>window.pair()),null);assert.equal(await page.evaluate(()=>window.pending().length),0);
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rm-mirror-v1:')).length),1);
}));
test('newer local edits survive an in-flight mirror response and supplied markup stays text',async()=>fixture(async page=>{
 await page.evaluate(()=>window.mode='ok');await page.evaluate(()=>window.deliver());await page.evaluate(()=>{window.mode='hold';window.event.seq=19;window.flight=window.deliver()});await page.waitForFunction(()=>!!window.finish);
 await page.evaluate(()=>{window.state().tree.find(t=>t.tags.includes('wf')).expanded=false;window.finish()});assert.match((await page.evaluate(()=>window.flight)).error,/Newer local work/);
 assert.equal(await page.evaluate(()=>window.state().tree.find(t=>t.tags.includes('wf')).expanded),false);assert.equal(await page.evaluate(()=>window.pending().length),1);
 assert.equal(await page.locator('section script').count(),0);await page.getByText('Keep 日本語 <script>text</script>',{exact:true}).waitFor();
}));
