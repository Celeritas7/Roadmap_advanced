import {readFile,writeFile,cp} from 'node:fs/promises';import {join} from 'node:path';
export async function prepareCompletions(stage){
 for(const file of ['completion-contract.ts','completion-sync.ts','CompletionRecovery.tsx'])await cp(new URL('./'+file,import.meta.url),join(stage,'src/store',file));
 const path=join(stage,'src/lib/rmHub.ts');let source=await readFile(path,'utf8');
 const begin=source.indexOf('type Pending = Record'),end=source.indexOf('// ── Tags',begin);
 if(begin<0||end<0)throw Error('Completion source changed');
 source=source.slice(0,begin)+`export async function tickMirror(rmId:string):Promise<void>{
 const addr=hubAddrOf(rmId)
 await requestCompletion(rmId,addr?suggester.openSuggestionFor(addrKey(addr)):null)
}
export async function pollReplies():Promise<void>{await pollCompletionReplies()}
\n`+source.slice(end);
 const orphan=source.indexOf('async function tagOrphan('),next=source.indexOf('// session.completed',orphan);
 if(orphan<0||next<0)throw Error('Orphan source changed');source=source.slice(0,orphan)+source.slice(next);
 const patch=source.indexOf('function patchTree('),after=source.indexOf('// R022: project',patch);
 if(patch<0||after<0)throw Error('Mirror view source changed');source=source.slice(0,patch)+source.slice(after);
 source="import {requestCompletion,pollCompletionReplies,completions} from '../store/completion-sync.ts'\n"+source
  .replace("import * as sync from '../store/sync.ts'\n",'').replace('HubPlace, HubReplyRow,','HubPlace,')
  .replace("const REPLY_CURSOR = 'rm-ak-reply-seq'\n",'').replace("const PENDING_KEY = 'rm-ak-pending-done'\n",'')
  .replaceAll('Object.keys(readPending())','completions.list().map(p=>p.taskId)')
  .replaceAll('void pollReplies()','void pollReplies().catch(()=>{})');
 if(source.includes('readPending(')||source.includes('REPLY_CURSOR'))throw Error('Legacy completion state remains');
 await writeFile(path,source);
 const suggestion=join(stage,'src/lib/suggester.ts');let s=await readFile(suggestion,'utf8');
 s="import {registerCompletionView,completions} from '../store/completion-sync.ts'\n"+s+`\nregisterCompletionView(result=>{
 completions.assertContext(result.context)
 if(latest&&result.suggestion?.id===latest.id)latest={...latest,done_at:result.suggestion.done_at}
 bump()
})\n`;
 await writeFile(suggestion,s);
}
