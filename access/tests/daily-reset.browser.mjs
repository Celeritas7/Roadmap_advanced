import {test} from 'node:test';import assert from 'node:assert/strict';
import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
test('daily reset keeps failed checkboxes and history, retries once, and preserves edits made during confirmation',async()=>{
 const path=root+'daily-reset-test.html';
 await writeFile(path,`<div id="root"></div><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {useStore} from '/src/store/useStore.ts';import {DailyResetRecovery} from '/src/store/DailyResetRecovery.tsx';
 import {dailyResets,runDailyReset} from '/src/store/daily-reset-sync.ts';import {sessionActions} from '/src/store/studySessions.ts';
 import {supabase} from '/src/lib/supabase.ts';await supabase.auth.getSession();
 const id=n=>'c0000000-0000-4000-8000-'+String(n).padStart(12,'0');
 dailyResets.bind(id(1));sessionActions.bind(id(1));
 const task={id:id(3),title:'Daily task',done:true,kind:'task',tags:['daily-routine'],position:0,expanded:true,parent_id:null,streak:4,streak_day:'2000-01-01',created_at:'2000-01-01T00:00:00Z',updated_at:'2000-01-01T00:00:00Z'};
 const other={...task,id:id(4),title:'Other task',tags:[]};
 const proof={id:id(8),task_id:id(3),day_key:'2000-01-01',completed_at:'2000-01-01T00:00:00Z',verification:'app',feedback:{keep:'proof'}};
 window.seed=()=>{window.row={...task};useStore.setState({tree:[task,other],sessions:[proof],loading:false,initialized:true})};window.seed();
 window.calls=[];window.mode='deny';window.tick=runDailyReset;window.state=()=>useStore.getState();window.pending=()=>dailyResets.list();
 const success=args=>{window.row={...window.row,done:false,updated_at:new Date().toISOString()};return {error:null,data:{request_id:args.p_request_id,replayed:window.mode==='success',day_key:args.p_day_key,timezone:args.p_timezone,tasks:[window.row]}}};
 supabase.rpc=async(name,args)=>{window.calls.push({name,args});
  if(window.mode==='deny')return {error:{code:'42501'}};
  if(window.mode==='hold')return new Promise(resolve=>window.finishReset=()=>resolve(success(args)));
  return success(args);
 };
 supabase.from=()=>({update(patch){this.patch=patch;return this},eq(){return this},select(){return this},single(){return new Promise(resolve=>window.finishEdit=()=>{window.row={...window.row,...this.patch,updated_at:new Date().toISOString()};resolve({data:window.row,error:null})})}});
 window.editSelected=()=>{window.edit=useStore.getState().updateTask(id(3),{title:'Newer title edit'})};
 window.editOther=()=>useStore.setState(s=>({tree:s.tree.map(t=>t.id===id(4)?{...t,title:'Keep unrelated edit'}:t)}));
 function Scene(){const row=useStore(s=>s.tree[0]);return React.createElement('div',{},React.createElement('label',{},'Daily task',React.createElement('input',{type:'checkbox',checked:row.done,onChange:()=>void useStore.getState().toggleTask(row.id)})),React.createElement(DailyResetRecovery))}
 createRoot(document.getElementById('root')).render(React.createElement(Scene));window.ready=true;
 </script>`);
 let server,browser;
 try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const context=await browser.newContext({timezoneId:'Asia/Tokyo'}),page=await context.newPage();
  await page.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/daily-reset-test.html');await page.waitForFunction(()=>window.ready===true);
  const box=page.getByRole('checkbox',{name:'Daily task'}),retry=page.getByRole('button',{name:'Retry daily reset',exact:true});
  const history=await page.evaluate(()=>window.state().sessions);
  await page.evaluate(()=>window.tick());await retry.waitFor();assert.equal(await box.isChecked(),true);
  await page.evaluate(()=>window.tick());assert.equal(await page.evaluate(()=>window.calls.length),1);
  await box.click();assert.equal(await box.isChecked(),true);assert.equal(await page.evaluate(()=>window.calls.length),1);
  const first=await page.evaluate(()=>window.calls[0]);assert.equal(first.name,'ga_roadmap_reset_daily_tasks');
  await page.evaluate(()=>{window.editOther();window.mode='success'});await retry.click();
  await page.waitForFunction(()=>!window.state().tree[0].done);
  assert.deepEqual((await page.evaluate(()=>window.calls[1])).args,first.args);assert.equal(await page.evaluate(()=>window.pending().length),0);
  assert.equal(await page.evaluate(()=>window.state().tree[1].title),'Keep unrelated edit');assert.equal(await page.evaluate(()=>window.state().tree[0].streak),4);
  assert.deepEqual(await page.evaluate(()=>window.state().sessions),history);
  await page.evaluate(()=>{window.seed();window.mode='hold';window.resetRun=window.tick()});await page.waitForFunction(()=>typeof window.finishReset==='function');
  await page.evaluate(()=>window.editSelected());await page.waitForFunction(()=>typeof window.finishEdit==='function');
  await page.evaluate(async()=>{window.finishReset();await window.resetRun});
  assert.equal(await page.evaluate(()=>window.state().tree[0].title),'Newer title edit');assert.equal(await page.evaluate(()=>window.pending().length),1);
  assert.equal(await box.isChecked(),true);
  await page.evaluate(async()=>{window.finishEdit();await window.edit;window.mode='success'});await retry.click();
  await page.waitForFunction(()=>window.pending().length===0);
  assert.equal(await page.evaluate(()=>window.state().tree[0].title),'Newer title edit');assert.deepEqual(await page.evaluate(()=>window.state().sessions),history);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}
});
