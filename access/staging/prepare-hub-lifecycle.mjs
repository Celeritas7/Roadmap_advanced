import {readFile,writeFile,cp} from 'node:fs/promises';import {join} from 'node:path';
const replace=(text,old,next)=>{if(text.split(old).length!==2)throw Error('Hub lifecycle source drift: '+old.slice(0,65));return text.replace(old,next)};
export async function prepareHubLifecycle(stage){
 for(const file of ['hub-account.ts','hub-outbox.ts','hub-account-sync.ts','HubQueueRecovery.tsx','shared-writer-contract.ts','SharedWriteRecovery.tsx'])await cp(new URL('./'+file,import.meta.url),join(stage,'src/store',file));
 const clientPath=join(stage,'public/akatsuki/akatsuki-client.js');let client=await readFile(clientPath,'utf8');
 client='/* Account-bound staging copy. Durable publication is separate from target\n * application. Remaining shared hub protocol contracts still require review. */\n'+client.slice(client.indexOf('(function ()'));
 client=client.replace(/  \/\/ R022 \(WF v98 ask\): refusals[^\n]+\n/,'');
 const start=client.indexOf('    const OUTBOX'),end=client.indexOf('    async function rpc',start);
 if(start<0||end<0)throw Error('Hub client source drift');
 client=client.slice(0,start)+`    const account=supabase.__hubAccount;
    if(!account||account.scope.owner==null||account.outbox.app!==app)throw Error('Matching account and app-bound staging hub client required');
    const scope=account.scope,log=opts.log||(()=>{});scope.assert();
    let consuming=null;
`+client.slice(end);
 const publish=client.indexOf('      /** Publish one change.'),consume=client.indexOf('      /** Read everything',publish);
 if(publish<0||consume<0)throw Error('Hub queue source drift');
 client=client.slice(0,publish)+`      publish(input){scope.assert();return account.outbox.publish(input)},
      flush(){scope.assert();return account.outbox.flush()},
`+client.slice(consume);
 const consumeStart=client.indexOf('      async consume(handlers, limit = 100)'),ackEnd=client.indexOf('      /** Request / reply',consumeStart);
 if(consumeStart<0||ackEnd<0)throw Error('Hub protocol source drift');
 client=client.slice(0,consumeStart)+`      consume(handlers,limit=100,assertLease=()=>scope.assert()) {
        scope.assert();assertLease();if(consuming)return consuming;
        const flight=(async()=>{
          const rows=await rpc('akatsuki_consume',{p_app:app,p_limit:limit});scope.assert();assertLease();let n=0;
          for(const r of rows||[]){
            scope.assert();assertLease();
            const supported=r.kind==='task.upsert'&&r.from_app==='wf'||r.kind==='session.completed'&&r.from_app==='jlpt'||r.kind==='suggestion.answered'&&['wf','cost','sukkiri','cal','scriptura','jlpt','cc'].includes(r.from_app);
            if(app!=='rm'||r.to_app!=='rm'||!supported){
              log('consumer contract requires review',r.seq,r.kind);continue;
            }
            const handler=handlers[r.kind];if(!handler)continue;
            let result;try{result=await handler(r)}catch(e){scope.assert();assertLease();log('delivery stays pending',r.seq,e.message);continue}
            scope.assert();assertLease();
            if(result?.acknowledged===true&&result.seq===r.seq)n++;
            else log('server acknowledgement required',r.seq);
          }
          return n;
        })();consuming=flight;void flight.finally(()=>{if(consuming===flight)consuming=null}).catch(()=>{});return flight;
      },
      async ack(){scope.assert();throw Error('Use the server-checked mirror acknowledgement contract.')},
      async reply(){scope.assert();throw Error('Exact-request replies require their separate contract review.')},
      async orphan(){scope.assert();throw Error('Orphan changes require the server-checked mirror contract.')},

`+client.slice(ackEnd);
 const docsStart=client.indexOf('      /** Document pattern'),docsEnd=client.indexOf('      /* ── Places',docsStart);
 if(docsStart<0||docsEnd<0)throw Error('Hub document source drift');
 client=client.slice(0,docsStart)+`      reviewShared(target){scope.assert();return account.shared.read(target)},
      prepareShared(snapshot,change){scope.assert();return account.shared.prepare(snapshot,change)},
      saveShared(intent){scope.assert();return account.shared.run(intent)},
      confirmShared(result){scope.assert();return account.shared.acknowledge(result)},
      async put(){scope.assert();throw Error('Shared document writes require their separate contract review.')},
      async remove(){scope.assert();throw Error('Shared document writes require their separate contract review.')},
`+client.slice(docsEnd);
 // Place writers are shared mutations too; read helpers remain available.
 for(const name of ['addPlace','editPlace','retirePlace']){
  const pattern=new RegExp('      (?:async )?'+name+'\\([^\\n]+\\n');
  if(!pattern.test(client))throw Error('Hub place writer source drift: '+name);
  client=client.replace(pattern,`      async ${name}(){scope.assert();throw Error('Shared place writes require their separate contract review.')},\n`);
 }
 const listen=client.indexOf('      listen(handlers, ms = 15000)'),listenEnd=client.indexOf('\n    };',listen);
 if(listen<0||listenEnd<0)throw Error('Hub listener source drift');
 client=client.slice(0,listen)+`      listen(handlers,ms=15000) {
        return account.startLeader(scope,async lease=>{
          await account.outbox.flush(lease);lease.assert();
          await hub.consume(handlers,100,()=>lease.assert());lease.assert();
          if(account.afterPoll)await account.afterPoll();
        },account.report,ms);
      }`+client.slice(listenEnd);
 client=replace(client,"    window.addEventListener('online', () => hub.flush().catch(() => {}));",'    // All listeners belong to the cancellable account leader.');
 client=client.replace(/  const (?:hash|stable|isRefused) = [^\n]+\n/g,'');
 await writeFile(clientPath,client);
 const hubPath=join(stage,'src/lib/rmHub.ts');let hub=await readFile(hubPath,'utf8');
 hub="import {hubAccounts,preparedHubClient,hubMessage} from '../store/hub-account-sync.ts'\nimport {startAccountLeader} from '../store/hub-account.ts'\n"+hub;
 hub=hub.replace("import { startTaskBroadcasts } from './taskReminders.ts'\n",'').replace("import { supabase } from './supabase.ts'\n",'').replace('PROJECT_BY_ID, applyVocabContexts','PROJECT_BY_ID').replace('const WHERE_POLL_MS = 60_000\n','');
 hub=hub.replace('requestCompletion,pollCompletionReplies,completions','requestCompletion,pollCompletionReplies');
 const guesses=hub.indexOf('async function writeGuesses()'),correctEnd=hub.indexOf('// ── Boot',guesses);
 if(guesses<0||correctEnd<0)throw Error('Hub tags source drift');
 hub=hub.slice(0,guesses)+`export async function refreshTags():Promise<void>{
 const current=hub;if(!current)return
 const scope=hubAccounts.scope(),next=await current.tags();scope.assert();if(hub===current)tagRows=next
}
export async function correctTag(_addr:WfAddr,_patch:{type?:string;effort?:string}):Promise<void>{
 throw Error('Shared document writes require their separate contract review.')
}
\n`+hub.slice(correctEnd);
 const boot=hub.indexOf('// One consumer per device:'),after=hub.indexOf('\nlet mirrorOwner=',boot);
 if(boot<0||after<0)throw Error('Hub boot source drift');
 hub=hub.slice(0,boot)+`// Explicit loopback fixture entry only. App.tsx never starts this automatically.
export function bootHub(s:Store):Promise<void>{
 if(booting)return booting
 const client=preparedHubClient(),scope=client.__hubAccount.scope
 if(s.getState().loading)throw Error('Wait for the current account store to load.')
 store=s;s.setState({hubState:'booting',hubError:null})
 const current=window.RmHub({...client,__hubAccount:{...client.__hubAccount,startLeader:startAccountLeader,afterPoll:async()=>{
  scope.assert();await pollReplies();scope.assert();await refreshTags();scope.assert();await refreshPlaces();scope.assert();await refreshWhere()
 }}},{onTask:async(...args)=>{scope.assert();const result=await onTask(...args);scope.assert();return result},
 onAnswer:async(...args)=>{scope.assert();const result=await suggester.onAnswer(...args);scope.assert();return result},
 onSession:async(...args)=>{scope.assert();const result=await onSession(...args);scope.assert();return result},log:dbg})
 hub=current;suggester.attach(s)
 scope.cleanup(()=>{
  current.stop();suggester.stopHubContext();if(hub!==current)return
  hub=null;store=null;booting=null;tagRows=[];placeRows=[];whereRows=[];visitRows=[];whereAt=0;rmByAddr.clear();addrByRm.clear();delete window.rm
  s.setState({hubState:'error',hubError:'Hub work stopped. Reload safely.',pendingDone:[]});hubMessage('Hub work stopped. Original account queues and check-ins remain saved.')
 })
 // Suggestion generation, banner, reminders and shared-document writers stay off
 // until their own source/ordering contract is accepted. Consumption is explicit.
 try{current.start();scope.assert();s.setState({hubState:'live',hubRev:s.getState().hubRev+1})}
 catch(e){scope.stop();throw e}
 booting=Promise.resolve();return booting
}
export function stopHub(){try{hubAccounts.scope().stop()}catch{/* already stopped */}}
`+hub.slice(after);
 hub=replace(hub,'    placeRows = await hub.hub.places()',`    const current=hub,scope=hubAccounts.scope(),next=await current.hub.places()
    scope.assert();if(hub!==current)return placeRows;placeRows=next`);
 hub=replace(hub,'    const now = await hub.hub.whereNow()\n    visitRows = now.length ? [] : await hub.hub.visits({ days: 1 })',`    const current=hub,scope=hubAccounts.scope(),now=await current.hub.whereNow();scope.assert()
    const visits=now.length?[]:await current.hub.visits({days:1});scope.assert();if(hub!==current)return
    visitRows=visits`);
 await writeFile(hubPath,hub);
 const suggestionPath=join(stage,'src/lib/suggester.ts');let suggestion=await readFile(suggestionPath,'utf8');
 suggestion="import {hubContextStorage} from '../store/hub-account-sync.ts'\n"+suggestion.replaceAll('localStorage.','hubContextStorage.');
 suggestion+=`\nexport function stopHubContext(){if(timer)clearInterval(timer);timer=undefined;hub=null;banner=null;store=null;latest=null;served=[];busy=false}\n`;
 // This preview does not start legacy generation/direct suggestion mutations.
 await writeFile(suggestionPath,suggestion);
 const appPath=join(stage,'src/App.tsx');let app=await readFile(appPath,'utf8');
 app="import {SharedWriteRecovery} from './store/SharedWriteRecovery.tsx'\nimport {HubQueueRecovery} from './store/HubQueueRecovery.tsx'\n"+app.replace('<Header />','<Header /><HubQueueRecovery /><SharedWriteRecovery />');await writeFile(appPath,app);
}
