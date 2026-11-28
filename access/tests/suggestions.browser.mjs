import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
async function fixture(work){
 const path=root+'suggestions-test.html';await writeFile(path,`<div id="root"></div><script src="/akatsuki/akatsuki-client.js"></script><script src="/akatsuki/rm-adapter.js"></script><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {useStore} from '/src/store/useStore.ts';import {supabase} from '/src/lib/supabase.ts';
 import {SuggestionRecovery} from '/src/store/SuggestionRecovery.tsx';import {suggestionAnswers} from '/src/store/suggestion-sync.ts';
 import {sessionActions} from '/src/store/studySessions.ts';import * as suggest from '/src/lib/suggester.ts';
 await supabase.auth.getSession();const id=n=>'f7000000-0000-4000-8000-'+String(n).padStart(12,'0');suggestionAnswers.bind(id(1));sessionActions.bind(id(1));
 const task={id:id(3),parent_id:null,title:'Keep task',tags:[],done:false,kind:'task',position:0,expanded:true,streak:3,streak_day:null,created_at:'2026-11-26T00:00:00Z',updated_at:'2026-11-26T00:00:00Z'};
 const history={sessions:[{id:id(7),task_id:id(3),feedback:{keep:'proof'},verification:'app'}],log:[{id:id(8),notes:'Keep 日本語 notes'}]};
 useStore.setState({tree:[task],...history,loading:false,initialized:true});suggest.attach(useStore);
 localStorage.setItem('offline-pack','keep-pack');localStorage.setItem('akatsuki_outbox_rm','legacy-keep');
 window.eventSeq=25;window.calls=[];window.mode='lost';window.publishMode='ok';window.readFail=false;window.docs=[];window.state=()=>useStore.getState();window.pending=()=>suggestionAnswers.list();
 window.switchAccount=()=>{suggestionAnswers.bind(id(2));sessionActions.bind(id(2))};
 window.suggestion=JSON.parse(localStorage.getItem('fixture-suggestion')||'null')||{id:'sg-synthetic',user_id:id(1),task:{board_id:'board',item_key:'study:日本語',sub_id:'sub',extra:{keep:'exact'}},rm_task_id:id(3),title:'Keep task',made_at:'2026-11-27T01:00:00Z',until:'2099-01-01T00:00:00Z',answer:null,answered_at:null,answer_app:null,missed:false,done_at:null,tone_step:0,say:'Keep',ctx:{}};
 window.receipts=JSON.parse(localStorage.getItem('fixture-answer-receipts')||'{}');window.acked=JSON.parse(localStorage.getItem('fixture-ack')||'null');
 const commit=args=>{
  let r=window.receipts[args.p_request_id];if(!r){const p=args.p_payload??window.pending().find(p=>p.requestId===args.p_request_id).payload;window.suggestion={...window.suggestion,answer:p.action,answered_at:'2026-11-27T02:00:00Z',answer_app:p.from_app};
   r={seq:p.seq,normalized:p,request_id:args.p_request_id,receipt_id:args.p_request_id,replayed:false,outcome:'applied',suggestion:window.suggestion,effect:p.action==='skip'?{
    from_app:'rm',to_app:'wf',kind:'task.skipped',src_clock:null,src_addr:window.suggestion.task,idempotency_key:'rm:answer:'+args.p_request_id,
    payload:{...window.suggestion.task,reason:p.reason.trim(),at:'2026-11-27T02:00:00Z',suggestion_id:p.suggestion_id}}:null};
   window.receipts[args.p_request_id]=r;localStorage.setItem('fixture-suggestion',JSON.stringify(window.suggestion));localStorage.setItem('fixture-answer-receipts',JSON.stringify(window.receipts));
  }return {error:null,data:structuredClone(r)};
 };
 const rpc=async(name,args)=>{
  window.calls.push({name,args:structuredClone(args)});
  if(name==='ga_roadmap_receive_suggestion_event'||name==='ga_roadmap_answer_local_suggestion'){
   if(window.mode==='hold'){const result=commit(args);return new Promise(resolve=>window.finish=()=>resolve(result))}
   const r=commit(args);return window.mode==='lost'?{error:{code:'504'},data:null}:r;
  }
  if(name==='akatsuki_consume')return {error:null,data:window.acked?[]:[{seq:25,from_app:'wf',to_app:'rm',kind:'suggestion.answered',payload:{suggestion_id:'sg-synthetic',action:'skip',reason:'Keep 日本語',app:'wf',at:'2026-11-27T01:00:00Z'}}]};
  if(name==='ga_roadmap_ack_consumer_event'){
   if(!document.querySelector('output')?.textContent.match(/Revision [1-9]/))throw Error('Ack before rendered answer');
   const replayed=!!window.acked;window.acked={seq:args.p_seq,kind:'suggestion.answered',status:'delivered',outcome:'applied',replayed};localStorage.setItem('fixture-ack',JSON.stringify(window.acked));
   if(window.mode==='holdAck')await new Promise(resolve=>window.finishAck=resolve);
   return window.mode==='lostAck'?{error:{code:'504'},data:null}:{error:null,data:window.acked};
  }
  if(name==='akatsuki_publish')return window.publishMode==='contract'?{error:{code:'AK103'},data:null}:window.publishMode==='lost'?{error:{code:'504'},data:null}:{error:null,data:[{seq:99,status:'pending'}]};
  throw Error('Unexpected RPC '+name);
 };
 supabase.auth.getSession=async()=>({data:{session:{user:{id:id(1)},access_token:'synthetic-account-a-token'}},error:null});
 supabase.rpc=(name,args)=>{let pending;const run=()=>pending??=rpc(name,args);return {then:(...a)=>run().then(...a),setHeader:()=>run()}};
 supabase.from=table=>{const q={select(){return q},eq(){return q},order(){return q},or(){return q},gte(){return q},limit(){return table==='roadmap_study_sessions'?Promise.resolve(window.readFail?{error:{message:'Read failed'}}:{error:null,data:history.sessions}):q},
  maybeSingle:async()=>({error:null,data:window.suggestion}),then(resolve){return Promise.resolve({error:null,data:[]}).then(resolve)}};return q};
 const actor=suggestionAnswers.context(),scope={owner:id(1),assert:()=>suggestionAnswers.assertContext(actor)};
 const transport={rpc:supabase.rpc,__hubAccount:{scope,outbox:{app:'rm',flush:async()=>{}},startLeader:(_s,tick)=>{window.consume=()=>tick({assert:()=>scope.assert()});return ()=>{}},report:()=>{}}};
 window.adapter=window.RmHub(transport,{onAnswer:suggest.onAnswer});window.adapter.start();
 window.answer=action=>suggest.onAnswer({suggestion_id:'sg-synthetic',action,reason:action==='skip'?'Keep 日本語 <script>text<'+'/script>':null,at:'2026-11-27T01:00:00Z'},'wf',window.eventSeq).then(()=>'',e=>e.message);
 window.startLoop=()=>{const hub={tags:async()=>[],suggest:async row=>{window.docs.push(row);if(window.docs.length===1)throw Error('Lost publication');return true},clearSuggestion:async()=>{}};
  suggest.start(hub,{refresh:async()=>{}})};
 window.tick=()=>suggest.tick();
 function Scene(){const rev=useStore(s=>s.hubRev);return React.createElement(React.Fragment,{},React.createElement('button',{onClick:()=>void window.answer('skip')},'Skip suggestion'),React.createElement('output',{},'Revision '+rev),React.createElement(SuggestionRecovery))}
 createRoot(document.getElementById('root')).render(React.createElement(Scene));window.ready=true;
 </script>`);
 let server,browser;try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/suggestions-test.html');await page.waitForFunction(()=>window.ready===true);await page.locator('output').waitFor();await work(page);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}
}
test('actual suggestion handler and recovery UI preserve retries, text, proof and offline packs after lost replies',async()=>fixture(async page=>{
 const before=await page.evaluate(()=>({tree:window.state().tree,sessions:window.state().sessions,log:window.state().log}));
 await page.getByRole('button',{name:'Skip suggestion',exact:true}).click();const retry=()=>page.getByRole('button',{name:'Retry suggestion answer',exact:true});await retry().waitFor();await page.getByText(/Answer was not confirmed/).waitFor();
 const first=await page.evaluate(()=>window.calls[0]);await page.reload();await page.waitForFunction(()=>window.ready===true);
 await page.evaluate(()=>{window.mode='ok';window.publishMode='lost'});await retry().click();await page.getByText(/Hub delivery is not confirmed/).waitFor();const publish=await page.evaluate(()=>window.calls.at(-1));
 await page.evaluate(()=>window.publishMode='ok');await retry().click();await page.waitForFunction(()=>window.pending().length===0);
 assert.deepEqual(await page.evaluate(()=>window.calls[0]),first);assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name==='akatsuki_publish').at(-1)),publish);
 assert.deepEqual(await page.evaluate(()=>({tree:window.state().tree,sessions:window.state().sessions,log:window.state().log})),before);
 assert.equal(await page.evaluate(()=>Object.keys(window.receipts).length),1);assert.equal(await page.evaluate(()=>localStorage.getItem('offline-pack')),'keep-pack');assert.equal(await page.evaluate(()=>localStorage.getItem('akatsuki_outbox_rm')),'legacy-keep');
}));
test('session view failure keeps acknowledgement pending, and a late account response never updates the new view',async()=>fixture(async page=>{
 await page.evaluate(()=>{window.mode='ok';window.readFail=true});assert.match(await page.evaluate(()=>window.answer('start')),/Read failed/);assert.equal(await page.evaluate(()=>window.pending().length),1);
 await page.evaluate(()=>window.readFail=false);await page.getByRole('button',{name:'Retry suggestion answer',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);
 await page.evaluate(()=>{window.mode='hold';window.eventSeq++;window.flight=window.answer('skip')});await page.waitForFunction(()=>!!window.finish);const revision=await page.evaluate(()=>window.state().hubRev);
 await page.evaluate(()=>{window.switchAccount();window.finish()});assert.match(await page.evaluate(()=>window.flight),/Account changed/);assert.equal(await page.evaluate(()=>window.state().hubRev),revision);assert.equal(await page.evaluate(()=>window.pending().length),0);
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rm-suggestion-answer-v1:')).length),1);
}));
test('saved live suggestions retry publication with the same timestamp and address after a failed send',async()=>fixture(async page=>{
 await page.evaluate(()=>window.startLoop());await page.waitForFunction(()=>window.docs.length===1);await page.evaluate(()=>window.tick());await page.waitForFunction(()=>window.docs.length===2);
 assert.deepEqual(await page.evaluate(()=>window.docs[0]),await page.evaluate(()=>window.docs[1]));assert.equal(await page.evaluate(()=>window.docs[1].madeAt),'2026-11-27T01:00:00Z');
 assert.equal(await page.evaluate(()=>window.calls.length),0);
}));

test('real copied suggestion consumer keeps lost acknowledgement recovery and does not use legacy ack',async()=>fixture(async page=>{
 await page.evaluate(()=>window.mode='lostAck');await page.evaluate(()=>window.consume());assert.equal(await page.evaluate(()=>window.pending().length),1);await page.getByText(/Hub acknowledgement was not confirmed/).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.calls.map(c=>c.name)),['akatsuki_consume','ga_roadmap_receive_suggestion_event','akatsuki_publish','ga_roadmap_ack_consumer_event']);
 await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>window.mode='ok');await page.getByRole('button',{name:'Retry suggestion answer',exact:true}).click();await page.waitForFunction(()=>window.pending().length===0);
 assert.equal(await page.evaluate(()=>Object.keys(window.receipts).length),1);assert.equal(await page.evaluate(()=>window.calls.some(c=>['akatsuki_ack','akatsuki_reply','akatsuki_defer'].includes(c.name))),false);
}));
test('suggestion acknowledgement waits for follow-up publication and a late reply cannot clear another account',async()=>fixture(async page=>{
 await page.evaluate(()=>{window.mode='ok';window.publishMode='lost'});await page.evaluate(()=>window.consume());assert.equal(await page.evaluate(()=>window.pending().length),1);assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name==='ga_roadmap_ack_consumer_event')),false);
 await page.evaluate(()=>{window.mode='holdAck';window.publishMode='ok';window.flight=window.consume().catch(e=>e.message)});await page.waitForFunction(()=>!!window.finishAck);await page.evaluate(()=>{window.switchAccount();window.finishAck()});assert.match(await page.evaluate(()=>window.flight),/Account changed/);
 assert.equal(await page.evaluate(()=>window.pending().length),0);assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rm-suggestion-answer-v1:')).length),1);
}));
