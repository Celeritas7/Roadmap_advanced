import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
async function fixture(work){const path=root+'consumer-protocol-test.html';await writeFile(path,`<div id="root"></div><script src="/akatsuki/akatsuki-client.js"></script><script src="/akatsuki/rm-adapter.js"></script><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';import {supabase} from '/src/lib/supabase.ts';import {useStore} from '/src/store/useStore.ts';
 import {onSession} from '/src/lib/rmHub.ts';import {onAnswer,attach} from '/src/lib/suggester.ts';
 import {suggestionAnswers} from '/src/store/suggestion-sync.ts';import {studyReports} from '/src/store/study-report-sync.ts';
 import {SuggestionRecovery} from '/src/store/SuggestionRecovery.tsx';import {StudyReportRecovery} from '/src/store/StudyReportRecovery.tsx';
 import {sessionActions} from '/src/store/studySessions.ts';
 await supabase.auth.getSession();const id=n=>'22000000-0000-4000-8000-'+String(n).padStart(12,'0'),actor=id(1);
 suggestionAnswers.bind(actor);studyReports.bind(actor);sessionActions.bind(actor);const answerContext=suggestionAnswers.context(),studyContext=studyReports.context();
 const task={id:id(3),kind:'task',title:'Keep notes',tags:[],done:false};useStore.setState({tree:[task],sessions:[],loading:false,initialized:true,hubRev:0});attach(useStore);
 const stamp='2026-11-28T01:00:00Z';window.kind='session.completed';window.mode='ok';window.calls=[];window.messages=[];
 const events={'session.completed':{seq:20,kind:'session.completed',from_app:'jlpt',to_app:'rm',payload:{task_id:task.id,day_key:'2026-11-28'}},
 'suggestion.answered':{seq:21,kind:'suggestion.answered',from_app:'wf',to_app:'rm',payload:{suggestion_id:'saved',action:'dismiss',reason:null,at:stamp}}};
 const row={id:'saved',user_id:actor,task:{board_id:'rm'},title:'Keep notes',rm_task_id:task.id,made_at:stamp,until:stamp,answer:'dismiss',answered_at:stamp,answer_app:'wf'};
 const session={id:id(4),task_id:task.id,day_key:'2026-11-28',source:'japanese-study-app-advanced',started_at:null,completed_at:stamp,duration_min:20,feedback:{mode:'goi'},verification:'app',created_at:stamp};
 window.acks=JSON.parse(localStorage.getItem('fixture-consumer-acks')||'{}');localStorage.setItem('offline-pack','keep');localStorage.setItem('notes','keep notes');
 const rpc=async(name,args)=>{
  window.calls.push({name,args:structuredClone(args)});
  if(name==='akatsuki_consume')return {error:null,data:window.extraEvents??(window.acks[events[window.kind].seq]?[]:[events[window.kind]])};
  if(name==='ga_roadmap_receive_study_event')return {error:null,data:{seq:20,kind:'session.completed',from_app:'jlpt',to_app:'rm',task_id:task.id,day_key:'2026-11-28',outcome:'reported',receipt_outcome:'reported',replayed:!!window.acks[20],session}};
  if(name==='ga_roadmap_receive_suggestion_event')return {error:null,data:{seq:21,kind:'suggestion.answered',from_app:'wf',to_app:'rm',request_id:args.p_request_id,receipt_id:args.p_request_id,replayed:false,outcome:'applied',effect:null,suggestion:row,answer:{...events['suggestion.answered'].payload,from_app:'wf',seq:21,day_key:args.p_day_key}}};
  if(name==='ga_roadmap_ack_consumer_event'){
   const kind=args.p_seq===20?'session.completed':'suggestion.answered';
   if(kind==='session.completed'&&!document.querySelector('output').textContent.includes('Sessions 1'))throw Error('Ack before rendered session');
   if(kind==='suggestion.answered'&&!document.querySelector('output').textContent.includes('Revision '+useStore.getState().hubRev)||kind==='suggestion.answered'&&useStore.getState().hubRev===0)throw Error('Ack before rendered answer');
   const prior=window.acks[args.p_seq];const result={seq:args.p_seq,kind,status:'delivered',replayed:!!prior,reply_seq:100+args.p_seq,reply:{protocol:'roadmap.consumer.v1',request_seq:args.p_seq,kind,status:kind==='session.completed'?'reported':'applied'}};
   window.acks[args.p_seq]=result;localStorage.setItem('fixture-consumer-acks',JSON.stringify(window.acks));
   if(window.mode==='holdAck')await new Promise(resolve=>window.finishAck=resolve);
   if(window.mode==='malformedAck')result.reply.request_seq=999;
   return window.mode==='lostAck'?{error:{code:'504'},data:null}:{error:null,data:result};
  }
  throw Error('Unexpected mutation '+name);
 };
 supabase.auth.getSession=async()=>({data:{session:{user:{id:actor},access_token:'synthetic-owner'}},error:null});
 supabase.rpc=(name,args)=>{const flight=rpc(name,args);return {then:flight.then.bind(flight),setHeader:()=>flight}};
 const scope={owner:actor,assert:()=>{suggestionAnswers.assertContext(answerContext);studyReports.assertContext(studyContext)}};
 const transport={rpc:supabase.rpc,__hubAccount:{scope,outbox:{app:'rm',flush:async()=>{}},report:()=>{},startLeader:(_scope,tick)=>{window.consume=()=>tick({assert:()=>scope.assert()});return ()=>{}}}};
 window.adapter=window.RmHub(transport,{onAnswer,onSession,log:(...args)=>window.messages.push(args)});window.adapter.start();
 window.pending=()=>window.kind==='session.completed'?studyReports.list():suggestionAnswers.list();
 window.switchAccount=()=>{suggestionAnswers.bind(id(2));studyReports.bind(id(2));suggestionAnswers.bind(actor);studyReports.bind(actor)};
 function Scene(){const sessions=useStore(s=>s.sessions),revision=useStore(s=>s.hubRev);return React.createElement(React.Fragment,{},React.createElement('output',{},'Sessions '+sessions.length+' Revision '+revision),React.createElement(StudyReportRecovery),React.createElement(SuggestionRecovery))}
 createRoot(document.getElementById('root')).render(React.createElement(Scene));window.ready=true;
 </script>`);let server,browser;try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/consumer-protocol-test.html');await page.waitForFunction(()=>window.ready);await page.locator('output').waitFor();await work(page);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}}
for(const kind of ['suggestion.answered','session.completed']){
 test(kind+': copied client/adapter render before exact ack, retain a lost ack across reload and clear only after retry',async()=>fixture(async page=>{
  await page.evaluate(kind=>{window.kind=kind;window.mode='lostAck'},kind);await page.evaluate(()=>window.consume());assert.equal(await page.evaluate(()=>window.pending().length),1);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='ga_roadmap_ack_consumer_event').length),1);
  await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(kind=>window.kind=kind,kind);
  await page.getByRole('button',{name:kind==='session.completed'?'Retry study report':'Retry suggestion answer',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='ga_roadmap_ack_consumer_event').length),1);await page.evaluate(()=>window.consume());
  assert.equal(await page.evaluate(()=>window.calls.some(c=>['akatsuki_ack','akatsuki_reply','akatsuki_defer'].includes(c.name))),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('offline-pack')),'keep');assert.equal(await page.evaluate(()=>localStorage.getItem('notes')),'keep notes');
 }));
 test(kind+': delayed A–B–A acknowledgement and mismatched reply retain original recovery',async()=>fixture(async page=>{
  await page.evaluate(kind=>{window.kind=kind;window.mode='holdAck';window.flight=window.consume().catch(e=>e.message)},kind);await page.waitForFunction(()=>!!window.finishAck);
  await page.evaluate(()=>{window.switchAccount();window.finishAck()});assert.match(await page.evaluate(()=>window.flight),/Account changed/);assert.equal(await page.evaluate(()=>window.pending().length),1);
  await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(kind=>{window.kind=kind;window.mode='malformedAck'},kind);
  await page.getByRole('button',{name:kind==='session.completed'?'Retry study report':'Retry suggestion answer',exact:true}).click();await page.getByText(/Hub acknowledgement was not confirmed/).waitFor();assert.equal(await page.evaluate(()=>window.pending().length),1);
 }));
}
