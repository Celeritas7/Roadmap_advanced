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
 for(const file of ['studySessions.ts','session-contract.ts','SessionRecovery.tsx','comparison-contract.ts','compareSync.ts','ComparisonRecovery.tsx','comparison-import-contract.ts','ComparisonImport.tsx','daily-reset-contract.ts','daily-reset-sync.ts','DailyResetRecovery.tsx','task-write-activity.ts','task-edit-contract.ts','task-edit-sync.ts','TaskEditRecovery.tsx'])
  await cp(new URL('./staging/'+file,import.meta.url),join(stage,'src/store',file));
 let ordinary=original['src/store/sync.ts'];
 ordinary="import { trackTaskWrite } from './task-write-activity.ts'\n"+ordinary
  .replace('export async function updateTask(id: string, patch: TaskUpdate): Promise<TaskRow> {',
   'export function updateTask(id: string, patch: TaskUpdate): Promise<TaskRow> { return trackTaskWrite(id,()=>updateTaskWrite(id,patch)) }\nasync function updateTaskWrite(id: string, patch: TaskUpdate): Promise<TaskRow> {');
 await writeFile(join(stage,'src/store/sync.ts'),ordinary);
 let store=original['src/store/useStore.ts'];
 const resetStart=store.indexOf('// V2-J: at/after 4 AM'),resetEnd=store.indexOf('// Quick-capture worker',resetStart);
 if(resetStart<0||resetEnd<0)throw Error('Daily reset source changed');
 store="import { runDailyReset } from './daily-reset-sync.ts'\n"+store.slice(0,resetStart)+store.slice(resetEnd);
 store=store.replaceAll('runDailyReset(get, set)','runDailyReset()');
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
 store="import { applyComparisonResult } from './ComparisonRecovery.tsx'\n"+store;
 const compareStart=store.indexOf('  setCompareWeights: async');
 const compareEnd=store.indexOf('  sessions: [],',compareStart);
 if(compareStart<0||compareEnd<0)throw Error('Comparison actions changed');
 store=store.slice(0,compareStart)+`  setCompareWeights: async (id, weights) => {
    const comparison=get().comparisons.find(c=>c.id===id)
    if(!comparison)return
    try { applyComparisonResult(await compareSync.editComparison(comparison,{weights}));set({error:null}) }
    catch(e) { set({error:errorMessage(e)}) }
  },
  chooseCompareItem: async (id, chosen_item) => {
    const comparison=get().comparisons.find(c=>c.id===id)
    if(!comparison)return
    try { applyComparisonResult(await compareSync.editComparison(comparison,{chosen_item}));set({error:null}) }
    catch(e) { set({error:errorMessage(e)}) }
  },
`+store.slice(compareEnd);
 store=store.replace('const { comparisons, items } = await compareSync.fetchComparisons()',
  `const snapshot = await compareSync.fetchComparisons()
      compareSync.comparisonEdits.assertContext(snapshot.context)
      const {comparisons,items}=snapshot`);

 store="import { editTaskMetadata,isMetadata,hasMetadata } from './task-edit-sync.ts'\nimport { runLegacyTaskMutation } from './task-write-activity.ts'\n"+store;
 // Metadata batches get one acknowledged transaction. Legacy structural paths
 // keep their existing implementation, serialized against pending metadata.
 for(const name of ['updateTask','updateTasks','deleteTask','deleteTasks','reorderTask','toggleTask']) {
  const start=store.indexOf('  '+name+': async '),open=store.indexOf(' => {',start)+5,end=store.indexOf('\n  },',open);
  if(start<0||open<5||end<0)throw Error('Task action changed: '+name);
  const body=store.slice(open,end);
  let prefix='';
  if(name==='updateTask')prefix=`
    if (isMetadata(patch)) {
      try { await editTaskMetadata([{id,patch}]); return }
      catch(e) { set({error:errorMessage(e)}); throw e }
    }
    if (hasMetadata(patch)) throw Error('Save metadata separately from task moves or completion changes.')
`;
  if(name==='updateTasks')prefix=`
    if (!patches.length) return
    if (patches.every(p=>isMetadata(p.patch))) {
      try { await editTaskMetadata(patches); return }
      catch(e) { set({error:errorMessage(e)}); throw e }
    }
    if (patches.some(p=>hasMetadata(p.patch))) throw Error('Save metadata separately from task moves or completion changes.')
`;
  store=store.slice(0,open)+prefix+'\n    '+(name==='toggleTask'?'try { await':'return')+' runLegacyTaskMutation(async()=>{'+body+'\n    })'+
   (name==='toggleTask'?' } catch(e) { set({error:errorMessage(e)}) }':'')+store.slice(end);
 }
 await writeFile(join(stage,'src/store/useStore.ts'),store);
 let app=original['src/App.tsx'].replace("import { bootHub } from './lib/rmHub.ts'\n",'');
 app="import { TaskEditRecovery } from './store/TaskEditRecovery.tsx'\nimport { DailyResetRecovery } from './store/DailyResetRecovery.tsx'\nimport { ComparisonImport } from './store/ComparisonImport.tsx'\nimport { ComparisonRecovery } from './store/ComparisonRecovery.tsx'\nimport { SessionRecovery } from './store/SessionRecovery.tsx'\n"+app
  .replace("    if (auth === 'signed-in' && !loading && !error) void bootHub(useStore)","    // Hub consumption stays off in this isolated fixture preview.")
  .replace('<Header />','<Header /><TaskEditRecovery /><DailyResetRecovery /><SessionRecovery /><ComparisonRecovery /><ComparisonImport />')
  .replace("Couldn't save that change — it's been undone.",'{error}');
 await writeFile(join(stage,'src/App.tsx'),app);

 let row=original['src/features/tree/TaskRow.tsx'];
 const begin=row.indexOf('  // Same draft/commit shape'),end=row.indexOf('\n  const {',begin);
 if(begin<0||end<0)throw Error('Rename source changed');
 row=row.slice(0,begin)+`  const [saving,setSaving]=useState(false),[editError,setEditError]=useState('')
  const commitEdit=async()=>{
    if(saving)return
    const title=draft.trim()
    if(!title){setEditError('Enter a task name.');return}
    if(title===task.title){setEditing(false);return}
    setSaving(true);setEditError('')
    try { await updateTask(task.id,{title});setEditing(false) }
    catch(e) { setEditError(e instanceof Error?e.message:'Save was not confirmed. Your draft stays here.') }
    finally { setSaving(false) }
  }
  const cancelEdit=()=>{if(!saving)setEditing(false)}
  const startEdit=()=>{
    if(editing||saving)return
    setDraft(task.title);setEditError('');setEditing(true)
  }
`+row.slice(end);
 row=row.replace('{editing ? (\n          <input','{editing ? (\n          <span>\n          <input')
  .replace('            value={draft}', '            aria-label="Task name"\n            disabled={saving}\n            value={draft}')
  .replace('                commitEdit()','                void commitEdit()')
  .replace('            onBlur={cancelEdit}\n          />',`          />
          <button type="button" disabled={saving} onClick={()=>void commitEdit()}>Save task name</button>
          <button type="button" disabled={saving} onClick={cancelEdit}>Close editor</button>
          {editError&&<span role="status">{editError}</span>}
          </span>`);
 await writeFile(join(stage,'src/features/tree/TaskRow.tsx'),row);
 const group=original['src/features/tree/Group.tsx'].replace('void toggleGroup(node.id)','void toggleGroup(node.id).catch(()=>{})');
 await writeFile(join(stage,'src/features/tree/Group.tsx'),group);
 let compare=original['src/features/compare/CompareSheet.tsx']
  .replace("import { useMemo } from 'react'","import { useMemo, useEffect, useState } from 'react'\nimport { comparisonEdits,comparisonImports } from '../../store/compareSync.ts'\nimport { ComparisonImport } from '../../store/ComparisonImport.tsx'\nimport { ComparisonRecovery } from '../../store/ComparisonRecovery.tsx'")
  .replace('  if (!c) return null\n\n  const used',`  const [,setRevision]=useState(0)
  useEffect(()=>comparisonEdits.subscribe(()=>setRevision(x=>x+1)),[])
  let waiting=true
  try { waiting=comparisonEdits.busy()||comparisonImports.busy()||comparisonEdits.list().some(p=>p.comparisonId===openId)||comparisonImports.list().some(p=>p.comparisonId===openId) } catch {}
  if (!c) return null

  const used`)
  .replace('{used.length > 0 && (','<ComparisonRecovery comparisonId={c.id} /><ComparisonImport key={c.id} comparisonId={c.id} />\n        {used.length > 0 && (')
  .replace('<button key={k.id} type="button"','<button key={k.id} disabled={waiting} type="button"')
  .replace("className={'ns-chip' + (pick ? '' : ' on')} onClick", "disabled={waiting} className={'ns-chip' + (pick ? '' : ' on')} onClick");
 await writeFile(join(stage,'src/features/compare/CompareSheet.tsx'),compare);
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
