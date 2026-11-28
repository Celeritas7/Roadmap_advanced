import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
async function fixture(work){const path=root+'study-report-test.html';await writeFile(path,`<div id="root"></div><script src="/akatsuki/akatsuki-client.js"></script><script src="/akatsuki/rm-adapter.js"></script><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';import {useStore} from '/src/store/useStore.ts';import {supabase} from '/src/lib/supabase.ts';
 import {onSession} from '/src/lib/rmHub.ts';import {studyReports} from '/src/store/study-report-sync.ts';import {StudyReportRecovery} from '/src/store/StudyReportRecovery.tsx';
 import {sessionActions} from '/src/store/studySessions.ts';
 const callerUrl='/caller-fixture/rmSession.js',helperUrl='/caller-fixture/study-caller.mjs';const {configureStudyFixture,rmInit,rmComplete,rmPending,rmRetry,rmReturn}=await import(/* @vite-ignore */ callerUrl);const {studyLaunchUrl}=await import(/* @vite-ignore */ helperUrl);
 await supabase.auth.getSession();const id=n=>'22000000-0000-4000-8000-'+String(n).padStart(12,'0');studyReports.bind(id(1));sessionActions.bind(id(1));
 const task={id:id(3),title:'Keep 日本語',kind:'task',tags:[],done:false};const history={id:id(9),task_id:null,feedback:{notes:'keep proof'},verification:'api'};
 useStore.setState({tree:[task],sessions:[history],log:[{notes:'keep notes'}],loading:false,initialized:true});localStorage.setItem('offline-pack','keep-pack');sessionStorage.setItem('rm-handshake','legacy-keep');
 window.event={seq:20,from_app:'jlpt',to_app:'rm',kind:'session.completed',payload:{task_id:id(3),day_key:'2026-11-26'}};window.mode='ok';window.acks=0;window.calls=[];window.acked=JSON.parse(localStorage.getItem('fixture-private-ack')||'null');
 window.hubRow=JSON.parse(localStorage.getItem('fixture-study-hub')||'null');const saveHub=()=>localStorage.setItem('fixture-study-hub',JSON.stringify(window.hubRow));
 window.state=()=>useStore.getState();window.pending=()=>studyReports.list();window.switchAccount=()=>studyReports.bind(id(2));
 const committed=()=>({error:null,data:{seq:20,task_id:id(3),day_key:'2026-11-26',replayed:false,outcome:'reported',session:{id:id(4),task_id:id(3),day_key:'2026-11-26',source:'japanese-study-app-advanced',started_at:'2026-11-26T18:50:00Z',completed_at:'2026-11-26T19:10:00Z',duration_min:20,feedback:{words:4,mode:'goi'},verification:'app',created_at:'2026-11-26T18:50:00Z'}}});
 const rpc=async(name,args)=>{window.calls.push({name,args:structuredClone(args)});
  if(name==='akatsuki_publish'){window.hubRow={...args.p,user_id:id(1),seq:20,status:'pending'};saveHub();return {data:{seq:20,status:'pending'},error:null}}
  if(name==='akatsuki_consume')return {data:window.acked?[]:[window.event],error:null};
  if(name==='ga_roadmap_consumer_status')return window.mode==='unverified'?{data:null,error:{code:'40001'}}:{data:window.acked??{seq:20,kind:'session.completed',status:'pending'},error:null};
  if(name==='ga_roadmap_ack_consumer_event'){
   if(document.querySelector('output')?.textContent!=='App-reported completion')throw Error('Ack before rendered report');
   const replayed=!!window.acked;window.acked={seq:args.p_seq,kind:'session.completed',status:'delivered',outcome:'reported',replayed};localStorage.setItem('fixture-private-ack',JSON.stringify(window.acked));window.acks++;
   if(window.hubRow){window.hubRow.status='delivered';saveHub()}
   if(window.mode==='holdAck')await new Promise(resolve=>window.finishAck=resolve);
   return window.mode==='lostAck'?{error:{code:'504'},data:null}:{error:null,data:window.acked};
  }
  if(name!=='ga_roadmap_receive_study_event')throw Error('Unexpected RPC '+name);
  if(window.mode==='hold')return new Promise(resolve=>window.resolveReport=()=>resolve(committed()));
  if(window.mode==='deny')return {data:null,error:{code:'42501'}};return window.mode==='lost'?{data:null,error:{code:'504'}}:committed();
 };
 supabase.auth.getSession=async()=>({data:{session:{user:{id:id(1)},access_token:'synthetic-owner-a-token'}},error:null});
 supabase.rpc=(name,args)=>{let pending;const run=()=>pending??=rpc(name,args);return {then:(...a)=>run().then(...a),setHeader:(_k,v)=>{window.calls.push({token:v});return run()}}};
 supabase.from=()=>{const q={select:()=>q,eq:()=>q,maybeSingle:()=>({setHeader:()=>Promise.resolve({data:window.hubRow,error:null})})};return q};
 window.beginRefresh=()=>{const saved=supabase.from;supabase.from=table=>{if(table!=='roadmap_study_sessions')return saved(table);const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>new Promise(resolve=>window.finishRefresh=()=>resolve({data:[history],error:null}))};return q};window.refreshFlight=useStore.getState().refreshSessions()};
 const actor=studyReports.context(),scope={owner:id(1),assert:()=>studyReports.assertContext(actor)};
 const transport={rpc:supabase.rpc,__hubAccount:{scope,outbox:{app:'rm',flush:async()=>{}},startLeader:(_s,tick)=>{window.consume=()=>tick({assert:()=>scope.assert()});return ()=>{}},report:()=>{}}};
 window.adapter=window.RmHub(transport,{onSession});const listen=window.adapter.hub.listen;
 window.adapter.hub.listen=handlers=>{window.sessionHandler=handlers['session.completed'];return listen(handlers)};window.adapter.start();
 window.deliver=async()=>{try{return await window.sessionHandler(window.event)}catch(e){return {error:e.message}}};
 window.time=Date.parse('2026-11-26T18:50:00Z');const caller=configureStudyFixture({client:supabase,storage:localStorage,clock:()=>window.time,notify:m=>window.callerMessage=m});caller.bind({owner:id(1),ownUser:id(5)});
 window.launch=studyLaunchUrl('https://celeritas7.github.io/Japanese_study_app_advanced/',id(3),'2026-11-26',id(1),id(6),'https://celeritas7.github.io/Roadmap_advanced/');
 window.initCaller=()=>rmInit(window.launch);window.completeCaller=()=>rmComplete({feedback:{mode:'goi',words:4,level:'N3'}});window.callerPending=rmPending;window.retryCaller=()=>rmRetry(rmPending()[0]);window.returnCaller=rmReturn;
 function Scene(){const sessions=useStore(s=>s.sessions);return React.createElement(React.Fragment,{},React.createElement('output',{},sessions.some(s=>s.task_id===id(3))?'App-reported completion':'No report'),React.createElement(StudyReportRecovery))}
 createRoot(document.getElementById('root')).render(React.createElement(Scene));window.ready=true;
 </script>`);let server,browser;try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/study-report-test.html');await page.waitForFunction(()=>window.ready===true);await page.locator('output').waitFor();await work(page);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}
}
test('copied session consumer defers lost replies, recovers after reload and acknowledges only applied state',async()=>fixture(async page=>{
 const before=await page.evaluate(()=>({tree:window.state().tree,old:window.state().sessions[0],log:window.state().log}));await page.evaluate(()=>window.mode='lost');assert.match((await page.evaluate(()=>window.deliver())).error,/not confirmed/);assert.equal(await page.evaluate(()=>window.acks),0);
 await page.reload();await page.waitForFunction(()=>window.ready===true);await page.getByRole('button',{name:'Retry study report',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);assert.equal(await page.locator('output').textContent(),'App-reported completion');await page.getByText(/not independently verified/).waitFor();
 await page.evaluate(()=>window.deliver());assert.equal(await page.evaluate(()=>window.acks),2);assert.equal(await page.evaluate(()=>window.state().sessions.length),2);assert.deepEqual(await page.evaluate(()=>({tree:window.state().tree,old:window.state().sessions[0],log:window.state().log})),before);
 assert.equal(await page.evaluate(()=>localStorage.getItem('offline-pack')),'keep-pack');assert.equal(await page.evaluate(()=>sessionStorage.getItem('rm-handshake')),'legacy-keep');assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name).map(c=>c.args)),[{p_seq:20},{p_seq:20},{p_seq:20},{p_seq:20}]);
}));
test('late report responses preserve account isolation and newer local study edits',async()=>fixture(async page=>{
 await page.evaluate(()=>{window.mode='hold';window.flight=window.deliver()});await page.waitForFunction(()=>!!window.resolveReport);await page.evaluate(()=>{window.state().sessions[0].feedback.notes='newer';window.resolveReport()});assert.match((await page.evaluate(()=>window.flight)).error,/Newer local work/);assert.equal(await page.evaluate(()=>window.acks),0);assert.equal(await page.evaluate(()=>window.state().sessions[0].feedback.notes),'newer');
 await page.evaluate(()=>{window.resolveReport=null;window.flight=window.deliver()});await page.waitForFunction(()=>!!window.resolveReport);await page.evaluate(()=>{window.switchAccount();window.resolveReport()});assert.match((await page.evaluate(()=>window.flight)).error,/Account changed/);assert.equal(await page.evaluate(()=>window.pending().length),0);assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rm-study-report-v1:')).length),1);
}));
test('prepared real JLPT module preserves launch time across 4 AM and waits for Roadmap confirmation',async()=>fixture(async page=>{
 await page.evaluate(()=>{window.initCaller();window.time+=20*60000;window.initCaller()});assert.equal(await page.evaluate(()=>window.completeCaller()),false);const p=(await page.evaluate(()=>window.callerPending()))[0];assert.equal(p.effect.payload.duration,20);assert.equal(p.effect.payload.day_key,'2026-11-26');assert.equal(await page.evaluate(()=>window.state().sessions.length),1);
 await page.evaluate(()=>window.deliver());assert.equal(await page.evaluate(()=>window.retryCaller()),true);assert.equal(await page.evaluate(()=>window.callerPending().length),0);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='akatsuki_publish').length),1);assert.equal(await page.evaluate(()=>sessionStorage.getItem('rm-handshake')),'legacy-keep');
 await page.evaluate(()=>window.event.from_app='unreviewed');assert.deepEqual(await page.evaluate(()=>window.deliver()),{reject:'unexpected study source'});
 await page.route('https://celeritas7.github.io/Roadmap_advanced/',r=>r.fulfill({status:200,contentType:'text/html',body:'Synthetic return'}));await page.evaluate(()=>window.returnCaller());await page.waitForURL('https://celeritas7.github.io/Roadmap_advanced/');
}));
test('a tab-return refresh started before the report cannot erase newly applied session evidence',async()=>fixture(async page=>{
 await page.evaluate(()=>window.beginRefresh());await page.waitForFunction(()=>!!window.finishRefresh);await page.evaluate(()=>window.deliver());assert.equal(await page.evaluate(()=>window.acks),1);
 await page.evaluate(()=>window.finishRefresh());await page.evaluate(()=>window.refreshFlight);assert.equal(await page.evaluate(()=>window.state().sessions.length),2);assert.equal(await page.locator('output').textContent(),'App-reported completion');
}));

test('real copied study consumer retains lost acknowledgements across reload and never calls legacy ack',async()=>fixture(async page=>{
 await page.evaluate(()=>window.mode='lostAck');await page.evaluate(()=>window.consume());assert.equal(await page.evaluate(()=>window.pending().length),1);await page.getByText(/Hub acknowledgement was not confirmed/).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name).map(c=>c.name)),['akatsuki_consume','ga_roadmap_receive_study_event','ga_roadmap_ack_consumer_event']);
 await page.reload();await page.waitForFunction(()=>window.ready);await page.getByRole('button',{name:'Retry study report',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);assert.equal(await page.evaluate(()=>window.state().sessions.length),2);assert.equal(await page.evaluate(()=>window.calls.some(c=>['akatsuki_ack','akatsuki_reply','akatsuki_defer'].includes(c.name))),false);
}));
test('committed but delayed study acknowledgement cannot clear another account',async()=>fixture(async page=>{
 await page.evaluate(()=>{window.mode='holdAck';window.flight=window.deliver()});await page.waitForFunction(()=>!!window.finishAck);await page.evaluate(()=>{window.switchAccount();window.finishAck()});assert.match((await page.evaluate(()=>window.flight)).error,/Account changed/);assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rm-study-report-v1:')).length),1);
}));
