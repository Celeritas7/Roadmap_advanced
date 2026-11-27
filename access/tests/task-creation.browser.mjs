import {test} from 'node:test';import assert from 'node:assert/strict';
import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
const id=n=>'f0000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function fixture(work){
 const path=root+'task-creation-test.html';
 await writeFile(path,`<div id="root"></div><button id="outside">Outside the form</button><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';import {DndContext} from '@dnd-kit/core';
 import {Group} from '/src/features/tree/Group.tsx';import {CaptureSheet} from '/src/features/capture/CaptureSheet.tsx';
 import {useStore} from '/src/store/useStore.ts';import {TaskCreationRecovery} from '/src/store/TaskCreationRecovery.tsx';
 import {taskCreations,taskDraft,captureDraft} from '/src/store/task-creation-sync.ts';
 import {supabase} from '/src/lib/supabase.ts';await supabase.auth.getSession();
 const id=n=>'f0000000-0000-4000-8000-'+String(n).padStart(12,'0');taskCreations.bind(id(1));
 const base={id:id(3),title:'Synthetic parent',kind:'group',parent_id:null,tags:[],done:false,expanded:true,position:0,streak:0,streak_day:null,created_at:'2026-11-26T00:00:00Z',updated_at:'2026-11-26T00:00:00Z'};
 const old={...base,id:id(4),title:'Keep task',kind:'task',done:true,streak:4};
 const notes={id:id(5),notes:'Keep notes 日本語'},proof={id:id(6),feedback:{keep:'proof'}};
 window.rows=JSON.parse(localStorage.getItem('fixture-create-rows')||JSON.stringify([base,old]));
 window.receipts=JSON.parse(localStorage.getItem('fixture-create-receipts')||'{}');window.calls=[];window.mode='deny';
 useStore.setState({tree:[...window.rows],log:[notes],sessions:[proof],loading:false,initialized:true,captureOpen:false});
 window.state=()=>useStore.getState();window.pending=()=>taskCreations.list();window.openCapture=()=>useStore.setState({captureOpen:true});
 const persist=()=>{localStorage.setItem('fixture-create-rows',JSON.stringify(window.rows));localStorage.setItem('fixture-create-receipts',JSON.stringify(window.receipts))};
 const success=args=>{
  const replayed=!!window.receipts[args.p_request_id],p=args.p_payload;
  if(!replayed){
   const rows=[],ids=[];let root;
   const insert=(item,parent_id,kind='task')=>{const r={...base,...item,parent_id,kind,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};rows.push(r);return r};
   if(p.kind==='capture'){
    root=window.rows.find(r=>r.kind==='group'&&r.parent_id===null&&r.title==='Captured')||insert({id:crypto.randomUUID(),title:'Captured',tags:['inbox']},null,'group');ids.push(root.id);
   }
   for(const item of p.items){let parent=p.parent_id;
    if(p.kind==='capture'){
     const group=[...window.rows,...rows].find(r=>r.kind==='group'&&r.parent_id===root.id&&r.title===item.folder)||insert({id:crypto.randomUUID(),title:item.folder,tags:[]},root.id,'group');
     parent=group.id;if(!ids.includes(group.id))ids.push(group.id);
    }
    const {folder,...task}=item;insert(task,parent);ids.push(item.id);
   }
   window.rows.push(...rows);window.receipts[args.p_request_id]=ids;persist();
  }
  return {error:null,data:{request_id:args.p_request_id,replayed,tasks:window.rows.filter(t=>window.receipts[args.p_request_id].includes(t.id))}};
 };
 supabase.rpc=async(name,args)=>{
  window.calls.push({name,args});if(name!=='ga_roadmap_create_tasks')throw Error('Unexpected RPC '+name);
  if(window.mode==='deny')return {error:{code:'42501'}};
  if(window.mode==='hold')return new Promise(resolve=>window.finish=()=>resolve(success(args)));
  const result=success(args);return window.mode==='lost'?{error:{code:'504'}}:result;
 };
 supabase.from=()=>{throw Error('Creation must not fall back to direct table writes')};
 window.beginLegacyToggle=()=>{
  supabase.from=()=>({update(){return this},eq(){return this},select(){return this},single(){return new Promise(resolve=>window.failToggle=()=>resolve({error:{message:'Synthetic completion failure'}}))}});
  window.toggleWork=useStore.getState().toggleTask(old.id);
 };
 window.editUnrelated=()=>useStore.setState(s=>({tree:s.tree.map(t=>t.id===old.id?{...t,title:'Keep unrelated edit'}:t)}));
 window.editTarget=()=>{const p=taskCreations.list()[0],item=p.payload.items[0];useStore.setState(s=>({tree:[...s.tree.filter(t=>t.id!==item.id),{...base,...item,kind:'task',title:'Keep newer local title'}]}))};
 window.commitExternal=()=>{const p=taskCreations.list()[0];window.rows=window.rows.map(t=>t.id===p.payload.items[0].id?{...t,title:'Keep newer local title'}:t);persist()};
 window.pendingElsewhere=()=>taskCreations.prepare(captureDraft('Different tab capture'));
 window.directCreate=title=>useStore.getState().addTask(base.id,title).then(()=>'',e=>e.message);
 function Scene(){const rows=useStore(s=>s.tree),group=rows.find(t=>t.id===base.id);return React.createElement(React.Fragment,{},
  React.createElement(DndContext,{},React.createElement(Group,{node:{...group,children:[]},depth:0,dim:new Set()})),React.createElement(CaptureSheet),React.createElement(TaskCreationRecovery))}
 createRoot(document.getElementById('root')).render(React.createElement(Scene));window.ready=true;
 </script>`);
 let server,browser;
 try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/task-creation-test.html');await page.waitForFunction(()=>window.ready===true);
  await work(page);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}
}
const fill=async(page,title)=>{await page.getByRole('button',{name:'+ add task',exact:true}).click();await page.getByRole('textbox',{name:'New task name',exact:true}).fill(title)};
test('actual task form retains blur/failure drafts; exact retries preserve tree, logs and proof through reload and older rollback',async()=>fixture(async page=>{
 const retry=page.getByRole('button',{name:'Retry task creation',exact:true}),input=page.getByRole('textbox',{name:'New task name',exact:true});
 const title='Keep 日本語 <script>window.injected=true</script>';
 await fill(page,title);await page.getByRole('button',{name:'Outside the form'}).click();assert.equal(await input.inputValue(),title);
 await page.getByRole('button',{name:'Add task',exact:true}).click();await retry.waitFor();assert.equal(await input.inputValue(),title);
 const first=await page.evaluate(()=>window.calls[0]),history=await page.evaluate(()=>({log:window.state().log,sessions:window.state().sessions}));
 await page.evaluate(()=>window.mode='lost');await retry.click();await page.waitForFunction(()=>window.rows.length===3);
 assert.equal(await page.evaluate(()=>window.pending().length),1);await page.reload();await page.waitForFunction(()=>window.ready===true);await retry.waitFor();
 await page.evaluate(()=>{window.mode='success';window.editUnrelated()});await retry.click();await page.waitForFunction(()=>window.pending().length===0);
 assert.deepEqual((await page.evaluate(()=>window.calls[0])).args,first.args);assert.equal(await page.evaluate(()=>window.rows.length),3);
 assert.equal(await page.evaluate(()=>window.state().tree.find(t=>t.id===window.calls[0].args.p_payload.items[0].id).title),title);
 assert.ok(await page.evaluate(()=>window.state().tree.some(t=>t.title==='Keep unrelated edit')));assert.equal(await page.evaluate(()=>window.injected),undefined);
 await fill(page,'Wait for older completion');await page.evaluate(()=>window.beginLegacyToggle());await page.waitForFunction(()=>typeof window.failToggle==='function');
 const before=await page.evaluate(()=>window.calls.length);await page.getByRole('button',{name:'Add task',exact:true}).click();await retry.waitFor();
 assert.equal(await page.evaluate(()=>window.calls.length),before);await page.evaluate(async()=>{window.failToggle();await window.toggleWork});
 await retry.click();await page.waitForFunction(()=>window.pending().length===0);await page.getByRole('button',{name:'+ add task',exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>window.state().tree.some(t=>t.title==='Wait for older completion')));
 await fill(page,'Overlapping creation');await page.evaluate(()=>window.mode='hold');await page.getByRole('button',{name:'Add task',exact:true}).click();
 await page.waitForFunction(()=>typeof window.finish==='function');await page.evaluate(()=>{window.editTarget();window.finish()});
 await page.waitForFunction(()=>!document.querySelector('[aria-label="New task name"]').disabled||document.querySelector('[aria-label="New task draft"] [role="status"]'));
 assert.equal(await page.evaluate(()=>window.pending().length),1);assert.ok(await page.evaluate(()=>window.state().tree.some(t=>t.title==='Keep newer local title')));
 await page.evaluate(()=>{window.commitExternal();window.mode='success'});await retry.click();await page.waitForFunction(()=>window.pending().length===0);
 assert.equal(await page.evaluate(()=>window.state().tree.filter(t=>t.title==='Keep newer local title').length),1);
 assert.deepEqual(await page.evaluate(()=>({log:window.state().log,sessions:window.state().sessions})),history);
}));
test('capture saves a whole batch once, retains text after uncertain reload, and another tab cannot clear a separate draft',async()=>fixture(async page=>{
 const retry=page.getByRole('button',{name:'Retry task creation',exact:true});await page.evaluate(()=>window.openCapture());
 const input=page.getByRole('textbox',{name:'Capture a task',exact:true});await input.fill('buy paper!, study Japanese, buy pens');
 await page.getByRole('button',{name:'Add 3',exact:true}).click();await retry.waitFor();assert.equal(await input.inputValue(),'buy paper!, study Japanese, buy pens');
 const first=await page.evaluate(()=>window.calls[0]);assert.equal(first.args.p_payload.items.length,3);
 await page.evaluate(()=>window.mode='lost');await retry.click();await page.waitForFunction(()=>window.rows.length===8);
 await page.reload();await page.waitForFunction(()=>window.ready===true);await retry.waitFor();await page.evaluate(()=>window.mode='success');await retry.click();
 await page.waitForFunction(()=>window.pending().length===0);assert.deepEqual((await page.evaluate(()=>window.calls[0])).args,first.args);
 assert.equal(await page.evaluate(()=>window.state().tree.length),8);assert.equal(await page.evaluate(()=>window.rows.filter(t=>t.title==='Captured').length),1);
 assert.equal(await page.evaluate(()=>window.rows.filter(t=>t.title==='Shopping').length),1);
 await page.evaluate(()=>window.openCapture());await input.fill('Keep my separate draft');await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.evaluate(()=>{window.pendingElsewhere();window.openCapture()});assert.equal(await input.inputValue(),'Keep my separate draft');
 await page.getByRole('button',{name:'Add',exact:true}).click();await retry.click();await page.waitForFunction(()=>window.pending().length===0);
 assert.equal(await input.inputValue(),'Keep my separate draft');assert.equal(await input.isEnabled(),true);
 await page.getByRole('button',{name:'Add',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Capture a task"]').value==='');
 assert.equal(await page.evaluate(()=>window.rows.filter(t=>t.title==='Different tab capture').length),1);
 assert.equal(await page.evaluate(()=>window.rows.filter(t=>t.title==='Keep my separate draft').length),1);
 await input.fill('Next valid capture');await page.getByRole('button',{name:'Add',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Capture a task"]').value==='');
 assert.equal(await page.evaluate(()=>window.rows.filter(t=>t.title==='Next valid capture').length),1);
}));
