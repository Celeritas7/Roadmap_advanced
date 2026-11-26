import {readFile,writeFile,cp,mkdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,resolve,relative,sep} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function prepareStaging(sourceRoot=root) {
 const baseline=JSON.parse(await readFile(new URL('./source-baseline.json',import.meta.url),'utf8'));
 const original={};
 for(const [file,hash] of Object.entries(baseline.sha256)) {
  const bytes=await readFile(join(sourceRoot,file));
  if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Source drift: '+file);
  original[file]=bytes.toString('utf8');
 }
 const stage=join(sourceRoot,'.staging','session-fixture');
 // Refuse an existing symlink in either output component before copying source.
 for(const name of [join(sourceRoot,'.staging'),stage]) {
  try{if((await lstat(name)).isSymbolicLink())throw Error('Staging symlink refused');}
  catch(e){if(e.code!=='ENOENT')throw e;}
 }
 if(relative(sourceRoot,stage).split(sep)[0]!=='.staging')throw Error('Invalid staging output');
 await mkdir(stage,{recursive:true});
 for(const file of ['src','public','index.html','package.json','package-lock.json','tsconfig.json','vite.config.ts','tailwind.config.ts','postcss.config.js'])
  await cp(join(sourceRoot,file),join(stage,file),{recursive:true});
 for(const file of ['studySessions.ts','session-contract.ts','SessionRecovery.tsx'])
  await cp(new URL('./staging/'+file,import.meta.url),join(stage,'src/store',file));
 let store=original['src/store/useStore.ts'];
 const hook='    const done = !target.done';
 if(store.split(hook).length!==2)throw Error('Task mutation changed');
 store="import { applySessionResult } from './SessionRecovery.tsx'\n"+store.replace(hook,`    if (isDaily(target)) {
      try {
        const result = await sessionSync.setDailyTask(target)
        applySessionResult(result)
        if (result.kind === 'daily' && result.task.done) void markDone(id, null)
        set({ error: null })
      } catch (e) {
        set({ error: errorMessage(e) })
      }
      return
    }
${hook}`);
 await writeFile(join(stage,'src/store/useStore.ts'),store);
 let app=original['src/App.tsx'].replace("import { bootHub } from './lib/rmHub.ts'\n",'');
 app="import { SessionRecovery } from './store/SessionRecovery.tsx'\n"+app
  .replace("    if (auth === 'signed-in' && !loading && !error) void bootHub(useStore)","    // Hub consumption stays off in this isolated fixture preview.")
  .replace('<Header />','<Header /><SessionRecovery />')
  .replace("Couldn't save that change — it's been undone.",'{error}');
 await writeFile(join(stage,'src/App.tsx'),app);
 let launch=original['src/features/plan/launch.ts']
  .replace('function withHandshake(rawUrl: string, taskId: string): string {','function withHandshake(rawUrl: string, taskId: string, logicalDay: string): string {')
  .replace('u.searchParams.set(RM_DAY_PARAM, dayKey())','u.searchParams.set(RM_DAY_PARAM, logicalDay)')
  .replace('if (taskId) void startSession(taskId).catch(() => {})',`const launchDay = dayKey()
  if (taskId) void startSession(taskId, launchDay).catch(() => showToast('Study opened; session start is unconfirmed. Use the saved retry in Roadmap.'))`)
  .replace('withHandshake(r.url, taskId)','withHandshake(r.url, taskId, launchDay)');
 await writeFile(join(stage,'src/features/plan/launch.ts'),launch);
 let backend=original['src/lib/supabase.ts'];
 backend=backend.slice(0,backend.indexOf('// Akatsuki broadcast overlay:'));
 backend=backend.replace('import.meta.env.VITE_SUPABASE_URL',"'http://127.0.0.1:54321'")
  .replace('import.meta.env.VITE_SUPABASE_ANON_KEY',"'synthetic-publishable-key-not-a-credential'")
  .replace("storageKey: 'rm_sb_auth'","storageKey: 'rm_session_fixture_auth'");
 await writeFile(join(stage,'src/lib/supabase.ts'),backend);
 let page=original['index.html'].replace(/\s*<script src="(?:https:\/\/celeritas7.github.io\/Akatsuki\/|akatsuki\/)[^"]+"><\/script>/g,'');
 page=page.replace('<body>','<body><p role="status" style="padding:12px;background:#fff3cd">Synthetic session preview. No hosted cutover approved.</p>');
 await writeFile(join(stage,'index.html'),page);
 await writeFile(join(stage,'SESSION-STAGING.json'),JSON.stringify({source:baseline.commit,synthetic:true,deploy:false},null,2)+'\n');
 return stage;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 if(process.argv.slice(2).join(' ')!=='--fixture')throw Error('Use --fixture; no hosted configuration is supported');
 console.log(await prepareStaging());
}
