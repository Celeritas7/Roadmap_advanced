import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareStaging} from '../prepare-staging.mjs';
test('isolated staging pins inputs and preserves original app files and authentication storage',async()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url)),temp=await mkdtemp(join(tmpdir(),'roadmap-stage-'));
 try {
  for(const file of ['src','public','supabase','index.html','package.json','package-lock.json','tsconfig.json','vite.config.ts','tailwind.config.ts','postcss.config.js'])
   await cp(join(root,file),join(temp,file),{recursive:true});
  const original=await readFile(join(temp,'src/store/useStore.ts'),'utf8');
  const stage=await prepareStaging(temp);
  assert.equal(await readFile(join(temp,'src/store/useStore.ts'),'utf8'),original);
  const store=await readFile(join(stage,'src/store/useStore.ts'),'utf8');assert.match(store,/await sessionSync.setDailyTask/);
  assert.match(store,/import \{ runDailyReset \}/);assert.doesNotMatch(store,/optimistic state already unchecked/);
  assert.match(store,/await saveTaskCreation/);assert.doesNotMatch(store,/captureWithRetry|doCapture|captureChain/);
  const group=await readFile(join(stage,'src/features/tree/Group.tsx'),'utf8');assert.match(group,/TaskCreationForm/);assert.doesNotMatch(group,/onBlur=|void addTask/);
  assert.match(await readFile(join(stage,'src/features/capture/CaptureSheet.tsx'),'utf8'),/CaptureCreationForm/);
  assert.match(store,/await saveDailyLog/);assert.match(store,/runLegacyLogDelete/);
  const log=await readFile(join(stage,'src/features/log/TodaysLog.tsx'),'utf8');
  assert.match(log,/DailyLogForm/);assert.doesNotMatch(log,/onBlur=|Number.parseInt/);
  assert.match(store,/await editTaskMetadata/);assert.match(store,/runLegacyTaskMutation/);
  assert.match(store,/queueTaskDeletion/);assert.match(store,/reorderTaskStructure/);assert.doesNotMatch(store,/await sync.deleteTask|await sync.reorderTasks/);
  const inbox=await readFile(join(stage,'src/features/inbox/InboxView.tsx'),'utf8');assert.match(inbox,/NewFolderMoveForm/);assert.doesNotMatch(inbox,/await addFolder|moveToNew/);
  const taskRow=await readFile(join(stage,'src/features/tree/TaskRow.tsx'),'utf8');
  assert.match(taskRow,/await updateTask/);assert.doesNotMatch(taskRow,/onBlur=\{cancelEdit\}/);
  assert.match(store,/setInterval\(\(\) => void runDailyReset\(\), 60_000\)/);
  const auth=await readFile(join(stage,'src/lib/supabase.ts'),'utf8');
  assert.match(auth,/127\.0\.0\.1:54321/);assert.match(auth,/rm_session_fixture_auth/);assert.doesNotMatch(auth,/import\.meta\.env\.VITE_SUPABASE|AkatsukiBroadcast/);
  assert.doesNotMatch(await readFile(join(stage,'index.html'),'utf8'),/<script src="(?:https:|akatsuki)/);
  const hub=await readFile(join(stage,'src/lib/rmHub.ts'),'utf8'),client=await readFile(join(stage,'public/akatsuki/akatsuki-client.js'),'utf8');
  assert.match(hub,/preparedHubClient/);assert.match(hub,/scope.cleanup/);assert.doesNotMatch(hub,/startTaskBroadcasts|window.AkatsukiBanner|rm-ak-leader|writeGuesses/);
  assert.match(client,/account.outbox.publish/);assert.match(client,/scope.assert\(\);assertLease\(\)/);assert.doesNotMatch(client,/localStorage|readBox|writeBox|dropped \(contract\)|window.addEventListener/);
  assert.doesNotMatch(await readFile(join(stage,'src/App.tsx'),'utf8'),/void bootHub/);
  assert.equal(await readFile(join(temp,'public/akatsuki/akatsuki-client.js'),'utf8'),await readFile(join(root,'public/akatsuki/akatsuki-client.js'),'utf8'));
  const launch=await readFile(join(stage,'src/features/plan/launch.ts'),'utf8');
  assert.match(launch,/startSession\(taskId, launchDay\)/);assert.match(launch,/withHandshake\(r.url, taskId, launchDay\)/);
  const deploy=await readFile(join(root,'.github/workflows/deploy.yml'),'utf8');
  assert.match(deploy,/paths:/);assert.doesNotMatch(deploy,/['"]access\/\*\*/);
  await writeFile(join(temp,'src/App.tsx'),'drift');await assert.rejects(()=>prepareStaging(temp),/Source drift/);
 } finally{await rm(temp,{recursive:true,force:true})}
});
