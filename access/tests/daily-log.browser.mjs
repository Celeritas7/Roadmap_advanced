import {test} from 'node:test';import assert from 'node:assert/strict';
import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
const id=n=>'e0000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function fixture(work){
 const path=root+'daily-log-test.html';
 await writeFile(path,`<div id="root"></div><button id="outside">Outside the form</button><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {useStore} from '/src/store/useStore.ts';import {TodaysLog} from '/src/features/log/TodaysLog.tsx';
 import {DailyLogRecovery} from '/src/store/DailyLogRecovery.tsx';import {dailyLogs,retryDailyLog} from '/src/store/daily-log-sync.ts';
 import {supabase} from '/src/lib/supabase.ts';await supabase.auth.getSession();
 const id=n=>'e0000000-0000-4000-8000-'+String(n).padStart(12,'0');dailyLogs.bind(id(1));
 const task={id:id(3),title:'Synthetic study task',done:true,kind:'task',tags:['daily-routine'],position:0,expanded:true,parent_id:null,streak:4,streak_day:'2026-11-25',created_at:'2026-11-25T00:00:00Z',updated_at:'2026-11-25T00:00:00Z'};
 const old={id:id(4),task_id:null,log_date:'2026-11-25',context:null,duration_minutes:20,notes:'Historical notes',created_at:'2026-11-25T00:00:00Z'};
 const proof={id:id(5),task_id:id(3),verification:'app',feedback:{keep:'proof'}};
 window.rows=JSON.parse(localStorage.getItem('fixture-log-rows')||JSON.stringify([old]));window.receipts=new Set(JSON.parse(localStorage.getItem('fixture-log-requests')||'[]'));
 window.calls=[];window.mode='deny';window.state=()=>useStore.getState();window.pending=()=>dailyLogs.list();
 useStore.setState({tree:[task],log:[...window.rows],sessions:[proof],loading:false,initialized:true});
 const persist=()=>{localStorage.setItem('fixture-log-rows',JSON.stringify(window.rows));localStorage.setItem('fixture-log-requests',JSON.stringify([...window.receipts]))};
 const success=args=>{
  const replayed=window.receipts.has(args.p_request_id);
  if(!replayed){window.rows.push({...args.p_entry,id:args.p_entry_id,created_at:new Date().toISOString()});window.receipts.add(args.p_request_id);persist()}
  return {error:null,data:{request_id:args.p_request_id,replayed,entry:window.rows.find(l=>l.id===args.p_entry_id)}};
 };
 supabase.rpc=async(name,args)=>{
  window.calls.push({name,args});if(name!=='ga_roadmap_add_log')throw Error('Unexpected RPC '+name);
  if(window.mode==='deny')return {error:{code:'42501'}};
  if(window.mode==='hold')return new Promise(resolve=>window.finishLog=()=>resolve(success(args)));
  const result=success(args);return window.mode==='lost'?{error:{code:'504'}}:result;
 };
 supabase.from=()=>{throw Error('Log creation must not fall back to direct table writes')};
 window.beginDelete=()=>{
  supabase.from=()=>({delete(){return this},eq(){return new Promise(resolve=>window.failDelete=()=>resolve({error:{message:'Synthetic delete failure'}}))}});
  window.deletion=useStore.getState().deleteLog(old.id).catch(e=>e.message);
 };
 window.rerender=()=>useStore.setState(s=>({log:[...s.log]}));
 window.addUnrelated=()=>useStore.setState(s=>({log:[...s.log,{...old,id:id(7),notes:'Keep unrelated local notes'}]}));
 window.changeTarget=()=>{const p=dailyLogs.list()[0];useStore.setState(s=>({log:[...s.log.filter(l=>l.id!==p.entryId),{...p.entry,id:p.entryId,created_at:new Date().toISOString(),notes:'Newer local notes'}]}))};
 window.commitExternal=()=>{const p=dailyLogs.list()[0];window.rows=window.rows.map(l=>l.id===p.entryId?{...l,notes:'Newer local notes'}:l);persist()};
 function Scene(){return React.createElement(React.Fragment,{},React.createElement(TodaysLog),React.createElement(DailyLogRecovery))}
 createRoot(document.getElementById('root')).render(React.createElement(Scene));window.ready=true;
 </script>`);
 let server,browser;
 try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const context=await browser.newContext({timezoneId:'Asia/Tokyo'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-25T14:59:50Z'));
  await page.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/daily-log-test.html');await page.waitForFunction(()=>window.ready===true);
  await work(page);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}
}
const fill=async(page,notes,minutes='35')=>{
 await page.getByRole('button',{name:'+ log something',exact:true}).click();
 await page.getByRole('combobox',{name:'Task',exact:true}).selectOption(id(3));
 await page.getByRole('spinbutton',{name:'Duration in minutes'}).fill(minutes);
 await page.getByRole('textbox',{name:'Notes',exact:true}).fill(notes);
};
test('daily log form keeps blur/failure drafts, original midnight date and exact lost-response retry after reload',async()=>fixture(async page=>{
 const retry=page.getByRole('button',{name:'Retry daily log',exact:true});
 const notes='Keep 日本語 <script>window.injected=true</script>';
 await fill(page,notes,'1.5');await page.getByRole('button',{name:'Log',exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.getByRole('spinbutton',{name:'Duration in minutes'}).fill('35');await page.getByRole('button',{name:'Outside the form'}).click();
 assert.equal(await page.getByRole('textbox',{name:'Notes',exact:true}).inputValue(),notes);
 await page.clock.setFixedTime(new Date('2026-11-25T15:01:00Z'));await page.evaluate(()=>window.rerender());
 assert.match(await page.locator('[aria-label="Daily log draft"]').textContent(),/Log date: 2026-11-25/);
 await page.getByRole('button',{name:'Log',exact:true}).click();await retry.waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Notes',exact:true}).inputValue(),notes);assert.equal(await page.evaluate(()=>window.state().log.length),1);
 const first=await page.evaluate(()=>window.calls[0]);assert.equal(first.name,'ga_roadmap_add_log');assert.equal(first.args.p_entry.log_date,'2026-11-25');
 const history=await page.evaluate(()=>({tree:window.state().tree,sessions:window.state().sessions}));
 await page.evaluate(()=>window.mode='lost');await retry.click();await page.waitForFunction(()=>window.rows.length===2);
 assert.equal(await page.evaluate(()=>window.pending().length),1);assert.deepEqual((await page.evaluate(()=>window.calls[1])).args,first.args);
 await page.reload();await page.waitForFunction(()=>window.ready===true);await retry.waitFor();
 assert.equal(await page.evaluate(()=>window.state().log.length),2);await page.evaluate(()=>window.mode='success');await retry.click();
 await page.waitForFunction(()=>window.pending().length===0);assert.deepEqual((await page.evaluate(()=>window.calls[0])).args,first.args);
 assert.equal(await page.evaluate(()=>window.rows.length),2);assert.equal(await page.evaluate(()=>window.state().log.length),2);
 assert.equal(await page.evaluate(()=>window.state().log.find(l=>l.id===window.calls[0].args.p_entry_id).notes),notes);
 assert.deepEqual(await page.evaluate(()=>({tree:window.state().tree,sessions:window.state().sessions})),history);
 assert.equal(await page.evaluate(()=>window.injected),undefined);
 assert.match(await page.locator('[aria-label="Daily log recovery"]').textContent(),/2026-11-25/);
 await page.getByRole('button',{name:'+ log something',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Notes',exact:true}).inputValue(),'');assert.match(await page.locator('[aria-label="Daily log draft"]').textContent(),/Log date: 2026-11-26/);
}));
test('successful recovery clears the failed form; old deletion rollback and overlapping local edits cannot erase a saved log',async()=>fixture(async page=>{
 const retry=page.getByRole('button',{name:'Retry daily log',exact:true});
 await fill(page,'First entry');await page.getByRole('button',{name:'Log',exact:true}).click();await retry.waitFor();
 await page.evaluate(()=>window.mode='success');await retry.click();await page.getByRole('button',{name:'+ log something',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.state().log.length),2);assert.equal(await page.evaluate(()=>window.pending().length),0);
 await fill(page,'Second entry','15');const before=await page.evaluate(()=>window.calls.length);
 await page.evaluate(()=>window.beginDelete());await page.waitForFunction(()=>typeof window.failDelete==='function');
 await page.getByRole('button',{name:'Log',exact:true}).click();await retry.waitFor();assert.equal(await page.evaluate(()=>window.calls.length),before);
 assert.equal(await page.evaluate(()=>window.pending()[0].entry.notes),'Second entry');
 await page.evaluate(async()=>{window.failDelete();await window.deletion});assert.equal(await page.evaluate(()=>window.state().log.length),2);
 await page.evaluate(()=>window.mode='hold');await retry.click();await page.waitForFunction(()=>typeof window.finishLog==='function');
 await page.evaluate(()=>{window.addUnrelated();window.finishLog()});await page.waitForFunction(()=>window.pending().length===0);
 assert.equal(await page.evaluate(()=>window.state().log.length),4);assert.ok(await page.evaluate(()=>window.state().log.some(l=>l.notes==='Keep unrelated local notes')));
 await page.getByRole('button',{name:'+ log something',exact:true}).waitFor();await fill(page,'Third entry','10');
 await page.getByRole('button',{name:'Log',exact:true}).click();await page.waitForFunction(()=>window.pending().length===1&&window.calls.at(-1).args.p_entry.notes==='Third entry');
 await page.evaluate(()=>{window.changeTarget();window.finishLog()});await page.waitForFunction(()=>!document.querySelector('.logcommit').disabled);
 assert.equal(await page.evaluate(()=>window.pending().length),1);assert.ok(await page.evaluate(()=>window.state().log.some(l=>l.notes==='Newer local notes')));
 await page.evaluate(()=>{window.commitExternal();window.mode='success'});await retry.click();await page.waitForFunction(()=>window.pending().length===0);
 assert.equal(await page.evaluate(()=>window.state().log.filter(l=>l.notes==='Newer local notes').length),1);
 assert.ok(await page.evaluate(()=>window.state().log.some(l=>l.notes==='Keep unrelated local notes')));
 assert.equal(await page.evaluate(()=>window.state().tree[0].streak),4);
}));
