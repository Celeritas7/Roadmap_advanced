import {test} from 'node:test';import assert from 'node:assert/strict';
import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
const id=n=>'16000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function fixture(work,phone=false){
 const path=root+'structure-test.html';await writeFile(path,`<div id="root"></div><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';import {DndContext} from '@dnd-kit/core';
 import {InboxView} from '/src/features/inbox/InboxView.tsx';import {Group} from '/src/features/tree/Group.tsx';import {makeDragEnd} from '/src/features/tree/Tree.tsx';
 import {useStore} from '/src/store/useStore.ts';import {StructureRecovery} from '/src/store/StructureRecovery.tsx';
 import {sessionActions} from '/src/store/studySessions.ts';import {structures} from '/src/store/structure-sync.ts';import {supabase} from '/src/lib/supabase.ts';await supabase.auth.getSession();
 const id=n=>'16000000-0000-4000-8000-'+String(n).padStart(12,'0');structures.bind(id(1));sessionActions.bind(id(1));localStorage.setItem('rm-inbox-mode','list');
 const base={id:id(2),title:'Source folder',kind:'group',parent_id:null,tags:[],done:false,expanded:true,position:0,streak:0,streak_day:null,created_at:'2026-11-26T00:00:00Z',updated_at:'2026-11-26T00:00:00Z'};
 const task={...base,id:id(3),title:'Study 日本語',kind:'task',parent_id:base.id,tags:['parked'],done:true,streak:4};
 const child={...task,id:id(4),title:'Second task',position:1},dest={...base,id:id(5),title:'Destination',position:1};
 const history={log:[{id:id(6),task_id:task.id,notes:'Keep 日本語 notes'}],sessions:[{id:id(7),task_id:task.id,feedback:{keep:'proof'},verification:'app'}],comparisons:[{id:id(8),task_id:task.id,notes:'Keep comparison'}],resources:[{id:id(9),task_id:task.id,label:'Keep link',url:'https://example.invalid'}]};
 window.rows=JSON.parse(localStorage.getItem('fixture-structure-rows')||JSON.stringify([base,task,child,dest]));
 window.historyRows=JSON.parse(localStorage.getItem('fixture-structure-history')||JSON.stringify(history));
 window.receipts=JSON.parse(localStorage.getItem('fixture-structure-receipts')||'{}');window.calls=[];window.mode='deny';
 useStore.setState({tree:[...window.rows],...window.historyRows,loading:false,initialized:true});
 window.state=()=>useStore.getState();window.pending=()=>structures.list();
 window.reorder=()=>makeDragEnd(useStore.getState().tree,useStore.getState().reorderTask)({active:{id:task.id},over:{id:child.id}});
 window.move=()=>useStore.getState().updateTasks([task,child].map((t,i)=>({id:t.id,patch:{parent_id:dest.id,position:i}}))).then(()=>'',e=>e.message);
 window.editUnrelated=()=>useStore.setState(s=>({tree:s.tree.map(t=>t.id===dest.id?{...t,title:'Keep unrelated edit'}:t)}));
 window.editTarget=()=>useStore.setState(s=>({tree:s.tree.map(t=>t.id===task.id?{...t,title:'Keep newer local title'}:t)}));
 window.externalCommit=()=>{window.rows=window.rows.map(t=>t.id===task.id?{...t,title:'Keep newer local title'}:t);persist()};
 window.beginLegacy=()=>{
  supabase.from=()=>({update(){return this},eq(){return this},select(){return this},single(){return new Promise(resolve=>window.failLegacy=()=>resolve({error:{message:'Synthetic failure'}}))}});
  window.legacy=useStore.getState().toggleTask(task.id);
 };
 window.startLateRead=()=>{
  const snapshot=structuredClone(window.historyRows.sessions);
  supabase.from=()=>({select(){return this},eq(){return this},order(){return this},limit(){return new Promise(resolve=>window.finishLateRead=()=>resolve({data:snapshot,error:null}))}});
  window.lateRead=useStore.getState().refreshSessions();
 };
 window.tryToggle=async()=>{await useStore.getState().toggleTask(task.id);return useStore.getState().error};
 const persist=()=>{localStorage.setItem('fixture-structure-rows',JSON.stringify(window.rows));localStorage.setItem('fixture-structure-history',JSON.stringify(window.historyRows));localStorage.setItem('fixture-structure-receipts',JSON.stringify(window.receipts))};
 const success=args=>{
  const p=args.p_payload,replayed=!!window.receipts[args.p_request_id],ids=p.tasks.map(t=>t.id);
  if(!replayed){
   if(p.tasks.some(t=>{const r=window.rows.find(r=>r.id===t.id);return !r||r.updated_at!==t.expected_updated_at||r.title!==t.label}))return {error:{code:'40001'}};
   if(p.kind==='delete'){
    window.rows=window.rows.filter(t=>!ids.includes(t.id));for(const name of ['log','sessions','comparisons'])window.historyRows[name]=window.historyRows[name].map(t=>ids.includes(t.task_id)?{...t,task_id:null}:t);
    window.historyRows.resources=window.historyRows.resources.filter(r=>!ids.includes(r.task_id));
   }else{
    window.rows=window.rows.map(t=>{const target=p.tasks.find(r=>r.id===t.id);return target?{...t,parent_id:target.parent_id,position:target.position,updated_at:new Date().toISOString()}:t});
    if(p.folder)window.rows.push({...base,...p.folder,updated_at:new Date().toISOString()});
   }
   window.receipts[args.p_request_id]=true;persist();
  }
  if(p.folder)ids.push(p.folder.id);
  return {error:null,data:{request_id:args.p_request_id,replayed,kind:p.kind,tasks:p.kind==='move'?window.rows.filter(r=>ids.includes(r.id)):[],deleted_ids:p.kind==='delete'?ids:[]}};
 };
 supabase.rpc=async(name,args)=>{
  window.calls.push({name,args});if(name!=='ga_roadmap_structure')throw Error('Unexpected RPC '+name);
  if(window.mode==='deny')return {error:{code:'42501'}};
  if(window.mode==='hold')return new Promise(resolve=>window.finish=()=>resolve(success(args)));
  const result=success(args);return window.mode==='lost'?{error:{code:'504'}}:result;
 };
 supabase.from=()=>{throw Error('Structural action must not use direct writes')};
 function Scene(){const [show,setShow]=React.useState(true),rows=useStore(s=>s.tree);window.hideInbox=()=>setShow(false);window.showInbox=()=>setShow(true);
  const group=rows.find(t=>t.id===base.id);return React.createElement(React.Fragment,{},show&&React.createElement(InboxView),
   group&&React.createElement(DndContext,{},React.createElement(Group,{node:{...group,children:[]},depth:0,dim:new Set()})),React.createElement(StructureRecovery))}
 createRoot(document.getElementById('root')).render(React.createElement(Scene));window.ready=true;
 </script>`);
 let server,browser;try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/structure-test.html');await page.waitForFunction(()=>window.ready===true);
  await work(page);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}
}
const retry=page=>page.getByRole('button',{name:'Retry tree change',exact:true});
test('Inbox desktop new-folder move retains its name, retries once and preserves history and unrelated edits',async()=>fixture(async page=>{
 const history=await page.evaluate(()=>window.historyRows);
 await page.getByRole('combobox',{name:'Move to folder',exact:true}).first().selectOption('__new__');
 const input=page.getByRole('textbox',{name:'New folder name',exact:true});await input.fill('Keep 日本語 <script>folder</script>');await input.press('Tab');assert.equal(await input.inputValue(),'Keep 日本語 <script>folder</script>');
 await page.getByRole('button',{name:'Create & move',exact:true}).click();await retry(page).waitFor();await page.waitForFunction(()=>window.pending()[0]?.attempted===true);
 assert.equal(await input.inputValue(),'Keep 日本語 <script>folder</script>');assert.equal(await page.evaluate(()=>window.state().tree.length),4);
 const first=await page.evaluate(()=>window.calls[0]);await page.evaluate(()=>window.mode='lost');await retry(page).click();await page.waitForFunction(()=>window.rows.length===5);
 await page.reload();await page.waitForFunction(()=>window.ready===true);await page.evaluate(()=>{window.mode='success';window.editUnrelated()});await retry(page).click();await page.waitForFunction(()=>window.pending().length===0);
 assert.deepEqual(await page.evaluate(()=>window.calls[0]),first);assert.equal(await page.evaluate(()=>window.rows.length),5);
 assert.ok(await page.evaluate(()=>window.state().tree.some(t=>t.title==='Keep unrelated edit')));assert.deepEqual(await page.evaluate(()=>window.historyRows),history);
 assert.equal(await page.evaluate(()=>window.state().tree.find(t=>t.kind==='task').streak),4);
}));
test('reviewed deletion has a safe local cancel, never flushes on Inbox unmount, and keeps proof on uncertain retry',async()=>fixture(async page=>{
 const before=await page.evaluate(()=>({tree:window.state().tree,...window.historyRows}));
 await page.locator('[data-task="'+id(3)+'"] button').filter({hasText:/^Delete$/}).click();
 await page.getByRole('button',{name:'Confirm deletion',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.evaluate(()=>window.hideInbox());await page.waitForTimeout(5500);assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.getByRole('button',{name:'Cancel deletion',exact:true}).click();assert.deepEqual(await page.evaluate(()=>({tree:window.state().tree,...window.historyRows})),before);
 await page.getByRole('button',{name:'Delete group Source folder',exact:true}).click();await page.getByRole('button',{name:'Confirm deletion',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.pending()[0].payload.tasks.length),3);await page.evaluate(()=>window.mode='lost');await page.getByRole('button',{name:'Confirm deletion',exact:true}).click();
 await page.waitForFunction(()=>window.rows.length===1);assert.equal(await page.evaluate(()=>window.state().tree.length),4);assert.match(await page.evaluate(()=>window.tryToggle()),/saved tree change/);
 const first=await page.evaluate(()=>window.calls[0]);await page.reload();await page.waitForFunction(()=>window.ready===true);await page.evaluate(()=>window.mode='success');await retry(page).click();await page.waitForFunction(()=>window.pending().length===0);
 assert.deepEqual(await page.evaluate(()=>window.calls[0]),first);assert.equal(await page.evaluate(()=>window.state().tree.length),1);
 const after=await page.evaluate(()=>({log:window.state().log,sessions:window.state().sessions,comparisons:window.state().comparisons,resources:window.state().resources}));
 for(const name of ['log','sessions','comparisons'])assert.deepEqual(after[name],before[name].map(t=>({...t,task_id:null})));assert.deepEqual(after.resources,[]);
}));
test('actual reorder handler batches siblings, waits out legacy rollback and keeps a conflicting local title',async()=>fixture(async page=>{
 await page.evaluate(()=>window.beginLegacy());await page.waitForFunction(()=>typeof window.failLegacy==='function');assert.match(await page.evaluate(()=>window.move()),/Wait for the current/);
 assert.equal(await page.evaluate(()=>window.pending().length),0);await page.evaluate(async()=>{window.failLegacy();await window.legacy});
 const before=await page.evaluate(()=>window.state().tree);await page.evaluate(()=>window.reorder());await retry(page).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.state().tree),before);assert.equal(await page.evaluate(()=>window.calls[0].args.p_payload.tasks.length),2);
 await page.evaluate(()=>window.mode='hold');await retry(page).click();await page.waitForFunction(()=>typeof window.finish==='function');await page.evaluate(()=>{window.editTarget();window.finish()});
 await page.getByText(/Newer local work was kept/).waitFor();assert.equal(await page.evaluate(()=>window.pending().length),1);
 assert.ok(await page.evaluate(()=>window.state().tree.some(t=>t.title==='Keep newer local title')));
 await page.evaluate(()=>{window.externalCommit();window.mode='success'});await retry(page).click();await page.waitForFunction(()=>window.pending().length===0);
 assert.equal(await page.evaluate(()=>window.state().tree.find(t=>t.title==='Keep newer local title').position),1);
 await page.evaluate(()=>window.startLateRead());await page.waitForFunction(()=>typeof window.finishLateRead==='function');
 await page.getByRole('button',{name:'Delete group Source folder',exact:true}).click();await page.getByRole('button',{name:'Confirm deletion',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);
 await page.evaluate(async()=>{window.finishLateRead();await window.lateRead});assert.equal(await page.evaluate(()=>window.state().sessions[0].task_id),null);

}));
test('mobile folder form stays open after failure and closes only its confirmed move',async()=>fixture(async page=>{
 await page.locator('[data-task="'+id(3)+'"] .ib-c-row').click();await page.getByRole('button',{name:'Move to…',exact:true}).first().click();
 await page.getByRole('button',{name:/＋ New folder/}).click();const input=page.getByRole('textbox',{name:'New folder name',exact:true});await input.fill('Mobile folder');
 await page.getByRole('button',{name:'Create & move',exact:true}).click();await retry(page).waitFor();assert.equal(await input.inputValue(),'Mobile folder');
 await page.evaluate(()=>window.mode='success');await page.getByRole('button',{name:'Retry folder move',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);
 await input.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.rows.filter(r=>r.title==='Mobile folder').length),1);
} ,true));
