import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
test('staged daily UI keeps failures retryable and confirms checkbox only after atomic acknowledgement',async()=>{
 const path=root+'recovery-test.html';
 await writeFile(path,`<div id="root"></div><script type="module">
 import React from 'react';
 import {createRoot} from 'react-dom/client';
 import {SessionRecovery} from '/src/store/SessionRecovery.tsx';
 import {useStore} from '/src/store/useStore.ts';
 import {sessionActions} from '/src/store/studySessions.ts';
 import {supabase} from '/src/lib/supabase.ts';
 await supabase.auth.getSession();
 const user='90000000-0000-4000-8000-000000000001',id='90000000-0000-4000-8000-000000000003';
 sessionActions.bind(user);
 const task={id,parent_id:null,title:'Synthetic daily task',kind:'task',done:false,tags:['daily-routine'],position:0,
  expanded:true,streak:0,streak_day:null,created_at:'2026-11-25T00:00:00Z',updated_at:'2026-11-25T00:00:00Z'};
 useStore.setState({tree:[task],sessions:[],loading:false,initialized:true});
 window.calls=[];window.mode='deny';
 supabase.rpc=async(name,args)=>{window.calls.push({name,args});
  if(window.mode==='deny')return {data:null,error:{code:'42501'}};
  return {error:null,data:{request_id:args.p_request_id,replayed:false,
   task:{...task,done:true,updated_at:'2026-11-26T00:00:00Z'},
   session:{id:'90000000-0000-4000-8000-000000000099',task_id:id,day_key:args.p_day_key,completed_at:'2026-11-26T00:00:00Z',verification:'manual'}}};
 };
 function Scene(){const done=useStore(s=>s.tree[0]?.done);return React.createElement('div',{},
  React.createElement('label',{},'Synthetic daily task',React.createElement('input',{type:'checkbox',checked:done,onChange:()=>void useStore.getState().toggleTask(id)})),
  React.createElement(SessionRecovery));}
 createRoot(document.getElementById('root')).render(React.createElement(Scene));window.ready=true;
 </script>`);
 let server,browser;
 try {
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});const page=await browser.newPage();
  await page.route('http://127.0.0.1:54321/**',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const port=server.httpServer.address().port;
  await page.goto('http://127.0.0.1:'+port+'/recovery-test.html');await page.waitForFunction(()=>window.ready===true);
  const box=page.getByRole('checkbox',{name:'Synthetic daily task'});await box.click();
  await page.getByRole('button',{name:'Retry saved action'}).waitFor();
  assert.equal(await box.isChecked(),false);
  assert.equal(await page.evaluate(()=>window.calls.length),1);
  const first=await page.evaluate(()=>window.calls[0]);
  assert.equal(first.name,'ga_roadmap_set_daily_task');
  await page.evaluate(()=>window.mode='success');await page.getByRole('button',{name:'Retry saved action'}).click();
  await page.waitForFunction(()=>document.querySelector('input').checked);
  assert.equal(await page.evaluate(()=>window.calls.length),2);
  assert.deepEqual((await page.evaluate(()=>window.calls[1])).args,first.args);
  assert.equal(await page.getByRole('button',{name:'Retry saved action'}).count(),0);
 } finally{await browser?.close();await server?.close();await rm(path,{force:true})}
});
