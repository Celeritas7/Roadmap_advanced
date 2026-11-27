import {prepareSuggestions} from './staging/prepare-suggestions.mjs';
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
 for(const file of ['studySessions.ts','session-contract.ts','SessionRecovery.tsx','comparison-contract.ts','compareSync.ts','ComparisonRecovery.tsx','comparison-import-contract.ts','ComparisonImport.tsx','daily-reset-contract.ts','daily-reset-sync.ts','DailyResetRecovery.tsx','task-write-activity.ts','task-edit-contract.ts','task-edit-sync.ts','TaskEditRecovery.tsx','daily-log-contract.ts','daily-log-sync.ts','DailyLogRecovery.tsx','DailyLogForm.tsx','task-creation-contract.ts','task-creation-sync.ts','TaskCreationForm.tsx','TaskCreationRecovery.tsx','structure-contract.ts','structure-sync.ts','StructureRecovery.tsx','NewFolderMoveForm.tsx'])
  await cp(new URL('./staging/'+file,import.meta.url),join(stage,'src/store',file));
 await prepareSuggestions(stage,original);
 await writeFile(join(stage,'src/types.ts'),original['src/types.ts'].replace('suggest(s: {','suggest(s: { madeAt?: string;'));
 await writeFile(join(stage,'src/features/home/NowStrip.tsx'),original['src/features/home/NowStrip.tsx'].replace('.then(() => tick())',".then(() => tick()).catch(e=>useStore.setState({error:e instanceof Error?e.message:'Answer stays saved.'}))"));
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
 for(const name of ['updateTask','updateTasks','deleteTask','deleteTasks','reorderTask','toggleTask','addFolder']) {
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

 store="import { saveDailyLog,runLegacyLogDelete } from './daily-log-sync.ts'\n"+store;
 const addLogStart=store.indexOf('  addLog: async'),addLogEnd=store.indexOf('\n  },',addLogStart);
 if(addLogStart<0||addLogEnd<0)throw Error('Log action changed');
 store=store.slice(0,addLogStart)+`  addLog: async (entry) => {
    try { await saveDailyLog(entry) }
    catch(e) { set({error:errorMessage(e)}); throw e }
`+store.slice(addLogEnd);
 const deleteStart=store.indexOf('  deleteLog: async'),deleteOpen=store.indexOf(' => {',deleteStart)+5,deleteEnd=store.indexOf('\n  },',deleteOpen);
 if(deleteStart<0||deleteOpen<5||deleteEnd<0)throw Error('Log delete changed');
 store=store.slice(0,deleteOpen)+'\n    try { return await runLegacyLogDelete(async()=>{'+store.slice(deleteOpen,deleteEnd)+
  '\n    }) } catch(e) { set({error:errorMessage(e)}); throw e }'+store.slice(deleteEnd);
 store="import { saveTaskCreation,taskDraft,captureDraft } from './task-creation-sync.ts'\n"+store;
 const taskStart=store.indexOf('  addTask: async'),taskEnd=store.indexOf('\n  },',taskStart);
 if(taskStart<0||taskEnd<0)throw Error('Task creation changed');
 store=store.slice(0,taskStart)+`  addTask: async (parentId,title,tags=[]) => {
    const result=await saveTaskCreation(taskDraft(parentId,title,tags))
    return result.itemIds[0]
`+store.slice(taskEnd);
 const captureStart=store.indexOf('  capture: (line)'),captureEnd=store.indexOf('\n  },',captureStart);
 if(captureStart<0||captureEnd<0)throw Error('Capture action changed');
 store=store.slice(0,captureStart)+`  capture: async (line) => {
    const draft=captureDraft(line)
    if(!draft.items.length)return null
    const result=await saveTaskCreation(draft)
    return {id:result.itemIds[0],folder:draft.items[0].folder!}
`+store.slice(captureEnd);
 const worker=store.indexOf('// Quick-capture worker');
 if(worker<0)throw Error('Capture worker changed');
 store=store.slice(0,worker).replace('  TaskInsert,\n','').replace("import { CAPTURE_ROOT, guessCapture, isNetworkError } from '../lib/capture.ts'\n",'');

 store="import { moveTaskStructures,reorderTaskStructure,queueTaskDeletion,newFolderMoveDraft,saveStructure } from './structure-sync.ts'\nimport { assertNoPendingStructure } from './task-write-activity.ts'\n"+store;
 for(const [name,body] of Object.entries({
  updateTask:`if(isMetadata(patch)){await editTaskMetadata([{id,patch}]);return;} await moveTaskStructures([{id,patch}]);`,
  updateTasks:`if(!patches.length)return; if(patches.every(p=>isMetadata(p.patch))){await editTaskMetadata(patches);return;} await moveTaskStructures(patches);`,
  deleteTask:`await queueTaskDeletion([id]);`,
  deleteTasks:`await queueTaskDeletion(ids);`,
  reorderTask:`await reorderTaskStructure(taskId,newIndex);`,
  addFolder:`const result=await saveStructure(newFolderMoveDraft([],title,parentId,tags));return result.tasks.find(t=>t.kind==='group')!.id;`,
 })) {
  const start=store.indexOf('  '+name+': async '),open=store.indexOf(' => {',start)+5,end=store.indexOf('\n  },',open);
  if(start<0||open<5||end<0)throw Error('Structural action changed: '+name);
  store=store.slice(0,open)+'\n    try { '+body+' } catch(e) { set({error:errorMessage(e)}); throw e }'+store.slice(end);
 }
 for(const name of ['addResource','deleteResource']) {
  const start=store.indexOf('  '+name+': async '),open=store.indexOf(' => {',start)+5;
  if(start<0||open<5)throw Error('Resource action changed');
  const end=store.indexOf('\n  },',open);
  store=store.slice(0,open)+'\n    assertNoPendingStructure(); return runLegacyTaskMutation(async()=>{'+store.slice(open,end)+'\n    })'+store.slice(end);
 }
 store=store.replace('editTaskMetadata,isMetadata,hasMetadata','editTaskMetadata,isMetadata').replace(/import \{ subtreeIds \}[^\n]+\n/,'');
 await writeFile(join(stage,'src/store/useStore.ts'),store);
 let app=original['src/App.tsx'].replace("import { bootHub } from './lib/rmHub.ts'\n",'');
 app="import { SuggestionRecovery } from './store/SuggestionRecovery.tsx'\nimport { StructureRecovery } from './store/StructureRecovery.tsx'\nimport { TaskCreationRecovery } from './store/TaskCreationRecovery.tsx'\nimport { DailyLogRecovery } from './store/DailyLogRecovery.tsx'\nimport { TaskEditRecovery } from './store/TaskEditRecovery.tsx'\nimport { DailyResetRecovery } from './store/DailyResetRecovery.tsx'\nimport { ComparisonImport } from './store/ComparisonImport.tsx'\nimport { ComparisonRecovery } from './store/ComparisonRecovery.tsx'\nimport { SessionRecovery } from './store/SessionRecovery.tsx'\n"+app
  .replace("    if (auth === 'signed-in' && !loading && !error) void bootHub(useStore)","    // Hub consumption stays off in this isolated fixture preview.")
  .replace('<Header />','<Header /><SuggestionRecovery /><StructureRecovery /><TaskCreationRecovery /><DailyLogRecovery /><TaskEditRecovery /><DailyResetRecovery /><SessionRecovery /><ComparisonRecovery /><ComparisonImport />')
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
 let group=original['src/features/tree/Group.tsx'].replace('void toggleGroup(node.id)','void toggleGroup(node.id).catch(()=>{})');
 const addTaskForm=group.indexOf('// Add affordance:');
 if(addTaskForm<0)throw Error('Task form changed');
 group="import { TaskCreationForm } from '../../store/TaskCreationForm.tsx'\n"+group.slice(0,addTaskForm)
  .replace("import { useState, type CSSProperties }", "import { type CSSProperties }")
  .replace('<AddTaskRow parentId={node.id} />','<TaskCreationForm parentId={node.id} />');

 const groupDeleteStart=group.indexOf('            const rows = useStore.getState().tree'),groupDeleteEnd=group.indexOf('          }}',groupDeleteStart);
 if(groupDeleteStart<0||groupDeleteEnd<0)throw Error('Group delete control changed');
 group=group.slice(0,groupDeleteStart)+'            void deleteTask(node.id).catch(()=>{})\n'+group.slice(groupDeleteEnd);
 group=group.replace('subtreeIds, type TreeNode','type TreeNode');
 await writeFile(join(stage,'src/features/tree/Group.tsx'),group);

 let tree=original['src/features/tree/Tree.tsx'].replace('void reorderTask(draggedId, newIndex)','void reorderTask(draggedId, newIndex).catch(()=>{})');
 await writeFile(join(stage,'src/features/tree/Tree.tsx'),tree);
 let inbox=original['src/features/inbox/InboxView.tsx'];
 inbox="import { NewFolderMoveForm } from '../../store/NewFolderMoveForm.tsx'\n"+inbox
  .replace('  const addFolder = useStore((s) => s.addFolder)\n','')
  .replace('const ok = (p: Promise<unknown>) => void p.catch(() => {})',"const ok = (p: Promise<unknown>) => void p.catch(e => setLive(e instanceof Error?e.message:'Change was not confirmed.'))")
  .replace('const pendBatch = (ts: TaskRow[], kind: PendingKind) => {',`const pendBatch = (ts: TaskRow[], kind: PendingKind) => {
    if(kind==='delete'){ok(deleteTasks(ts.map(t=>t.id)));setLive('Review the deletion in Tree change recovery. Nothing has been deleted.');return}`)
  .replace('const pend = (t: TaskRow, kind: PendingKind) => {',`const pend = (t: TaskRow, kind: PendingKind) => {
    if(kind==='delete'){ok(deleteTask(t.id));setLive('Review the deletion in Tree change recovery. Nothing has been deleted.');return}`)
  .replace('const reparent = (id: string, parent: string | null) => ok(updateTask(id, { parent_id: parent, position: endOf(parent) }))',
   'const reparent = (id: string, parent: string | null) => updateTask(id, { parent_id: parent, position: endOf(parent) })')
  .replace('const reparentMany = (ts: TaskRow[], parent: string) => {','const reparentMany = async (ts: TaskRow[], parent: string) => {')
  .replace('ok(updateTasks(ts.map((t, i) => ({ id: t.id, patch: { parent_id: parent, position: base + i } }))))',
   'await updateTasks(ts.map((t, i) => ({ id: t.id, patch: { parent_id: parent, position: base + i } })))')
  .replace('const onMove = (target: string, v: string) => {','const onMove = async (target: string, v: string) => {')
  .replace(') reparent(picked.id, parent)',') await reparent(picked.id, parent)')
  .replace(') reparentMany(sel, parent)',') await reparentMany(sel, parent)')
  .replace(') reparent(target, parent)',') await reparent(target, parent)');
 const newStart=inbox.indexOf('  const moveToNew = '),newEnd=inbox.indexOf('  const keepAll =',newStart);
 if(newStart<0||newEnd<0)throw Error('Inbox new-folder source changed');
 inbox=inbox.slice(0,newStart)+`  const moveIds=(target:string)=>target==='folder'?(picked?[picked.id]:[]):target==='selection'?sel.map(t=>t.id):[target]
`+inbox.slice(newEnd);
 const fieldStart=inbox.indexOf('  const newField = '),fieldEnd=inbox.indexOf('\n  const pillsFor =',fieldStart);
 if(fieldStart<0||fieldEnd<0)throw Error('Inbox folder field changed');
 inbox=inbox.slice(0,fieldStart)+`  const newField=(target:string)=>newFor?.target===target&&<NewFolderMoveForm key={target} ids={moveIds(target)} onDone={()=>{setNewFor(null);setSelected(new Set());setLive('Folder move confirmed.')}} onClose={()=>setNewFor(null)}/>
`+inbox.slice(fieldEnd);
 inbox=inbox.replace('onNew={(name) => ok(moveToNew(sheet.target, name))}',
  "newFolder={(name)=><NewFolderMoveForm ids={moveIds(sheet.target)} initialTitle={name} onDone={()=>{setSheet(null);setSelected(new Set())}} onClose={()=>setSheet(null)}/>}" );
 // Desktop select handlers report failures; the mobile sheet awaits the move.
 inbox=inbox.replace(/onChange=\{\(e\) => onMove\(([^\n]+?)\)\}/g,'onChange={(e) => ok(onMove($1))}');
 await writeFile(join(stage,'src/features/inbox/InboxView.tsx'),inbox);
 let parts=original['src/features/inbox/parts.tsx']
  .replace('allowTop, onPick, onNew, onClose','allowTop, onPick, newFolder, onClose')
  .replace('onPick: (id: string) => void; onNew: (name: string) => void;', 'onPick: (id: string) => Promise<void>; newFolder: (name:string)=>ReactNode;')
  .replace("  const [q, setQ] = useState('')", "  const [q, setQ] = useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')")
  .replace('const pick = (id: string) => { if (id !== TOP) pushRecent(id); onPick(id); onClose() }',
   "const pick = async (id:string)=>{if(busy)return;setBusy(true);setError('');try{await onPick(id);if(id!==TOP)pushRecent(id);onClose()}catch(e){setError(e instanceof Error?e.message:'Move was not confirmed.')}finally{setBusy(false)}}")
  .replace('<Sheet title={title} onClose={onClose}>','<Sheet title={title} onClose={()=>{if(!busy)onClose()}}><p role="status">{error}</p>')
  .replaceAll('onClick={() => pick(', 'disabled={busy} onClick={() => void pick(');
 const formStart=parts.indexOf('        <form className="ib-new"'),formEnd=parts.indexOf('        </form>',formStart);
 if(formStart<0||formEnd<0)throw Error('Mobile move form changed');
 parts=parts.slice(0,formStart)+'        newFolder(name)'+parts.slice(formEnd+'        </form>'.length);
 await writeFile(join(stage,'src/features/inbox/parts.tsx'),parts);
 await writeFile(join(stage,'src/features/capture/CaptureSheet.tsx'),"export { CaptureCreationForm as CaptureSheet } from '../../store/TaskCreationForm.tsx'\n");

 let log=original['src/features/log/TodaysLog.tsx'].replace("import { useMemo, useState } from 'react'","import { useMemo } from 'react'")
  .replace("import { CONTEXTS } from '../../seed.ts'", "import { DailyLogForm } from '../../store/DailyLogForm.tsx'");
 const logStart=log.indexOf('// Quick-log draft:'),logEnd=log.indexOf('\nfunction resolveTitle',logStart);
 if(logStart<0||logEnd<0)throw Error('Daily log form changed');
 log=log.slice(0,logStart)+`function AddLogRow({today}:{today:string}) { return <DailyLogForm today={today}/> }\n`+log.slice(logEnd);
 await writeFile(join(stage,'src/features/log/TodaysLog.tsx'),log);
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
