import {writeFile,cp} from 'node:fs/promises';
import {join} from 'node:path';
export async function prepareSuggestions(stage,original){
 for(const file of ['account-rpc.ts','suggestion-contract.ts','suggestion-sync.ts','SuggestionRecovery.tsx'])
  await cp(new URL('./'+file,import.meta.url),join(stage,'src/store',file));
 let source=original['src/lib/suggester.ts'];
 const begin=source.indexOf('  const sid = String(p.suggestion_id'),end=source.indexOf('\n}\n',begin);
 if(begin<0||end<0)throw Error('Suggestion answer source changed');
 source=source.slice(0,begin)+'  await answerSuggestion(p,fromApp,seq)'+source.slice(end);
 source="import {answerSuggestion,registerAnswerView,suggestionAnswers} from '../store/suggestion-sync.ts'\n"+source
  .replace('if (!reason) { latest = prev; return }','if (!reason) { latest = prev; await publishSavedSuggestion(prev); return }')
  .replace("    if (isNative(t.addr)) await hub.clearSuggestion()   // Roadmap-only: other apps must not show a stale WF one\n    else await hub.suggest({ id, task: t.addr, title: t.title, level: t.level ?? null, say, toneStep: step, until })\n    await banner?.refresh()",'    await publishSavedSuggestion(latest)')
  .replace("if (error) console.warn('[ak] markDone', error.message)",'if (error) throw error');
 // Pull a committed row again after a lost response. Publication only completes
 // once the copied adapter confirms the same stable document value.
 source+=`\nasync function publishSavedSuggestion(row:SuggestionRow){
 if(!hub)return
 if(isNative(row.task))await hub.clearSuggestion()
 else await hub.suggest({id:row.id,task:row.task,title:row.title,level:row.level,say:row.say,toneStep:row.tone_step,until:row.until,madeAt:row.made_at})
 await banner?.refresh()
}
registerAnswerView(async result=>{
 if(!store)throw Error('Wait for Roadmap to load before showing answers.')
 suggestionAnswers.assertContext(result.context)
 if(result.row?.answer==='start'&&result.row.rm_task_id){
  const sessions=await sessionSync.fetchSessions();suggestionAnswers.assertContext(result.context)
  store.setState({sessions})
 }
 if(!latest||latest.id===result.row?.id)latest=result.row
 bump()
})
`;
 await writeFile(join(stage,'src/lib/suggester.ts'),source);
 let adapter=original['public/akatsuki/rm-adapter.js']
  .replace('made_at: new Date().toISOString()','made_at: s.madeAt || new Date().toISOString()')
  .replace("const stable = (o) => JSON.stringify(o, Object.keys(o || {}).sort());",`const canonical = (o) => Array.isArray(o) ? o.map(canonical) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k,canonical(o[k])])) : o;
  const stable = (o) => JSON.stringify(canonical(o));`)
  .replace("clearSuggestion() { lastPut.delete('roadmap_now/suggestion/'); return hub.remove('roadmap_now', 'suggestion', ''); }","async clearSuggestion() { const k='roadmap_now/suggestion/'; if(lastPut.get(k) === null)return; await hub.remove('roadmap_now', 'suggestion', ''); lastPut.set(k,null); }")
  .replace("(v && typeof v === 'object' && v.defer)","(v && typeof v === 'object' && (v.defer || v.reject))")
  .replace("const out = await opts.onAnswer(r.payload, r.from_app, r.seq);",`let out;
            try { out = await opts.onAnswer(r.payload, r.from_app, r.seq); }
            catch(e) { if(e && e.code === '22023') return { reject: 'malformed suggestion answer' }; throw e; }`);
 await writeFile(join(stage,'public/akatsuki/rm-adapter.js'),adapter);
}
