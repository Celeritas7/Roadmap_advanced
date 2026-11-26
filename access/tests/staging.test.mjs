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
  assert.match(store,/await saveDailyLog/);assert.match(store,/runLegacyLogDelete/);
  const log=await readFile(join(stage,'src/features/log/TodaysLog.tsx'),'utf8');
  assert.match(log,/DailyLogForm/);assert.doesNotMatch(log,/onBlur=|Number.parseInt/);
  assert.match(store,/await editTaskMetadata/);assert.match(store,/runLegacyTaskMutation/);
  const taskRow=await readFile(join(stage,'src/features/tree/TaskRow.tsx'),'utf8');
  assert.match(taskRow,/await updateTask/);assert.doesNotMatch(taskRow,/onBlur=\{cancelEdit\}/);
  assert.match(store,/setInterval\(\(\) => void runDailyReset\(\), 60_000\)/);
  const auth=await readFile(join(stage,'src/lib/supabase.ts'),'utf8');
  assert.match(auth,/127\.0\.0\.1:54321/);assert.match(auth,/rm_session_fixture_auth/);assert.doesNotMatch(auth,/import\.meta\.env\.VITE_SUPABASE|AkatsukiBroadcast/);
  assert.doesNotMatch(await readFile(join(stage,'index.html'),'utf8'),/<script src="(?:https:|akatsuki)/);
  const launch=await readFile(join(stage,'src/features/plan/launch.ts'),'utf8');
  assert.match(launch,/startSession\(taskId, launchDay\)/);assert.match(launch,/withHandshake\(r.url, taskId, launchDay\)/);
  const deploy=await readFile(join(root,'.github/workflows/deploy.yml'),'utf8');
  assert.match(deploy,/paths:/);assert.doesNotMatch(deploy,/['"]access\/\*\*/);
  await writeFile(join(temp,'src/App.tsx'),'drift');await assert.rejects(()=>prepareStaging(temp),/Source drift/);
 } finally{await rm(temp,{recursive:true,force:true})}
});
