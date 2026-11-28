import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFile,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
async function fixture(work){
 const path=root+'suggestions-test.html';await writeFile(path,`<div id="root"></div><script type="module">
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {useStore} from '/src/store/useStore.ts';import {supabase} from '/src/lib/supabase.ts';
 import {SuggestionRecovery} from '/src/store/SuggestionRecovery.tsx';import {suggestionAnswers} from '/src/store/suggestion-sync.ts';
 import {sessionActions} from '/src/store/studySessions.ts';import * as suggest from '/src/lib/suggester.ts';
 await supabase.auth.getSession();const id=n=>'f7000000-0000-4000-8000-'+String(n).padStart(12,'0');suggestionAnswers.bind(id(1));sessionActions.bind(id(1));
 const task={id:id(3),parent_id:null,title:'Keep task',tags:[],done:false,kind:'task',position:0,expanded:true,streak:3,streak_day:null,created_at:'2026-11-26T00:00:00Z',updated_at:'2026-11-26T00:00:00Z'};
 const history={sessions:[{id:id(7),task_id:id(3),feedback:{keep:'proof'},verification:'app'}],log:[{id:id(8),notes:'Keep 日本語 notes'}]};
 useStore.setState({tree:[task],...history,loading:false,initialized:true});suggest.attach(useStore);
 localStorage.setItem('offline-pack','keep-pack');localStorage.setItem('akatsuki_outbox_rm','legacy-keep');
 window.calls=[];window.mode='lost';window.publishMode='ok';window.readFail=false;window.docs=[];window.state=()=>useStore.getState();window.pending=()=>suggestionAnswers.list();
 window.switchAccount=()=>{suggestionAnswers.bind(id(2));sessionActions.bind(id(2))};
 window.suggestion=JSON.parse(localStorage.getItem('fixture-suggestion')||'null')||{id:'sg-synthetic',user_id:id(1),task:{board_id:'board',item_key:'study:日本語',sub_id:'sub',extra:{keep:'exact'}},rm_task_id:id(3),title:'Keep task',made_at:'2026-11-27T01:00:00Z',until:'2099-01-01T00:00:00Z',answer:null,answered_at:null,answer_app:null,missed:false,done_at:null,tone_step:0,say:'Keep',ctx:{}};
 window.receipts=JSON.parse(localStorage.getItem('fixture-answer-receipts')||'{}');
 const commit=args=>{
  let r=window.receipts[args.p_request_id];if(!r){const p=args.p_payload??{...window.input,from_app:'wf',seq:args.p_seq,day_key:args.p_day_key};window.suggestion={...window.suggestion,answer:p.action,answered_at:'2026-11-27T02:00:00Z',answer_app:p.from_app};
   r={seq:p.seq,kind:'suggestion.answered',from_app:'wf',to_app:'rm',answer:p,request_id:args.p_request_id,receipt_id:args.p_request_id,replayed:false,outcome:'applied',suggestion:window.suggestion,effect:p.action==='skip'?{
    from_app:'rm',to_app:'wf',kind:'task.skipped',src_clock:null,src_addr:window.suggestion.task,idempotency_key:'rm:answer:'+args.p_request_id,
    payload:{...window.suggestion.task,reason:p.reason.trim(),at:'2026-11-27T02:00:00Z',suggestion_id:p.suggestion_id}}:null};
   window.receipts[args.p_request_id]=r;localStorage.setItem('fixture-suggestion',JSON.stringify(window.suggestion));localStorage.setItem('fixture-answer-receipts',JSON.stringify(window.receipts));
  }return {error:null,data:structuredClone(r)};
 };
 const rpc=async(name,args)=>{
  window.calls.push({name,args:structuredClone(args)});
  if(name==='ga_roadmap_receive_suggestion_event'||name==='ga_roadmap_answer_local_suggestion'){
   if(window.mode==='hold')return new Promise(resolve=>window.finish=()=>resolve(commit(args)));
   const r=commit(args);return window.mode==='lost'?{error:{code:'504'},data:null}:r;
  }
  if(name==='ga_roadmap_ack_consumer_event')return {error:null,data:{seq:args.p_seq,kind:'suggestion.answered',status:'delivered',replayed:false,reply_seq:100,reply:{protocol:'roadmap.consumer.v1',request_seq:args.p_seq,kind:'suggestion.answered',status:'applied'}}};
  if(name==='akatsuki_publish')return window.publishMode==='contract'?{error:{code:'AK103'},data:null}:window.publishMode==='lost'?{error:{code:'504'},data:null}:{error:null,data:[{seq:99,status:'pending'}]};
  throw Error('Unexpected RPC '+name);
 };
 supabase.auth.getSession=async()=>({data:{session:{user:{id:id(1)},access_token:'synthetic-account-a-token'}},error:null});
 supabase.rpc=(name,args)=>{const result=rpc(name,args);return {then:result.then.bind(result),setHeader:()=>result}};
 supabase.from=table=>{const q={select(){return q},eq(){return q},order(){return q},or(){return q},gte(){return q},limit(){return table==='roadmap_study_sessions'?Promise.resolve(window.readFail?{error:{message:'Read failed'}}:{error:null,data:history.sessions}):q},
  maybeSingle:async()=>({error:null,data:window.suggestion}),then(resolve){return Promise.resolve({error:null,data:[]}).then(resolve)}};return q};
 window.answer=action=>{window.input={suggestion_id:'sg-synthetic',action,reason:action==='skip'?'Keep 日本語 <script>text<'+'/script>':null,at:'2026-11-27T01:00:00Z'};return suggest.onAnswer(window.input,'wf',25).then(()=>'',e=>e.message)};
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
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/suggestions-test.html');await page.waitForFunction(()=>window.ready===true);await work(page);assert.deepEqual(errors,[]);
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
 await page.evaluate(()=>{window.mode='hold';window.flight=window.answer('skip')});await page.waitForFunction(()=>!!window.finish);const revision=await page.evaluate(()=>window.state().hubRev);
 await page.evaluate(()=>{window.switchAccount();window.finish()});assert.match(await page.evaluate(()=>window.flight),/Account changed/);assert.equal(await page.evaluate(()=>window.state().hubRev),revision);assert.equal(await page.evaluate(()=>window.pending().length),0);
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('rm-suggestion-answer-v1:')).length),1);
}));
test('saved live suggestions retry publication with the same timestamp and address after a failed send',async()=>fixture(async page=>{
 await page.evaluate(()=>window.startLoop());await page.waitForFunction(()=>window.docs.length===1);await page.evaluate(()=>window.tick());await page.waitForFunction(()=>window.docs.length===2);
 assert.deepEqual(await page.evaluate(()=>window.docs[0]),await page.evaluate(()=>window.docs[1]));assert.equal(await page.evaluate(()=>window.docs[1].madeAt),'2026-11-27T01:00:00Z');
 assert.equal(await page.evaluate(()=>window.calls.length),0);
}));
