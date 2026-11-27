import {readFile,writeFile,cp} from 'node:fs/promises';import {join} from 'node:path';
export async function prepareMirrors(stage,original){
 for(const file of ['mirror-contract.ts','mirror-sync.ts','MirrorRecovery.tsx'])await cp(new URL('./'+file,import.meta.url),join(stage,'src/store',file));
 let source=original['src/lib/rmHub.ts'];
 const begin=source.indexOf('async function folderFor('),end=source.indexOf('\nasync function tagOrphan',begin);
 if(begin<0||end<0)throw Error('Mirror source changed');
 source=source.slice(0,begin)+`export async function onTask(addr:WfAddr,p:Record<string,unknown>,seq:number):Promise<string|null>{
 const result=await receiveMirror(addr,p,seq)
 // Stale events cannot republish an older pair into hub metadata.
 return result.suppressed||result.sourceDeleted||result.lastSeq>seq?null:result.taskId
}
`+source.slice(end);
 source="import {receiveMirror,mirrors,registerMirrorPair} from '../store/mirror-sync.ts'\nimport {mirrorAddressKey} from '../store/mirror-contract.ts'\n"+source
  .replace('TaskRow, TaskUpdate, WfAddr','TaskRow, WfAddr')
  .replace('const lastSeq = new Map<string, number>()','')
  .replace('rmByAddr.get(addrKey(a))','rmByAddr.get(mirrorAddressKey(a))')
  .replace('rmByAddr.set(addrKey(addr), rmId)','rmByAddr.set(mirrorAddressKey(addr), rmId)')
  .replace('addrByRm.set(rmId, addr)','addrByRm.set(rmId, structuredClone(addr))')
  .replace('addrByRm.get(rmId) ?? null','structuredClone(addrByRm.get(rmId) ?? null)')
  .replace('for (const l of await hub.links()) if (l.rmId) remember(l.wf, l.rmId)','// Legacy hub links require server-side reconciliation; never guess a pair here.');
 source+=`\nlet mirrorOwner=mirrors.context().owner,mirrorEpoch=mirrors.context().epoch
mirrors.subscribe(()=>{const c=mirrors.context();if(c.owner!==mirrorOwner||c.epoch!==mirrorEpoch){rmByAddr.clear();addrByRm.clear();mirrorOwner=c.owner;mirrorEpoch=c.epoch}})
registerMirrorPair(result=>{
 mirrors.assertContext(result.context)
 const key=mirrorAddressKey(result.event.address),previous=rmByAddr.get(key)
 if(previous)addrByRm.delete(previous)
 rmByAddr.delete(key)
 if(result.taskId&&!result.suppressed)remember(result.event.address as WfAddr,result.taskId)
})
`;
 await writeFile(join(stage,'src/lib/rmHub.ts'),source);
 // Work on the already prepared suggestion adapter, never overwrite that work.
 const path=join(stage,'public/akatsuki/rm-adapter.js');let adapter=await readFile(path,'utf8');
 const old='const out = await opts.onTask(r.src_addr, r.payload, r.seq);';
 if(!adapter.includes(old))throw Error('Task adapter source changed');
 adapter=adapter.replace(old,`if(r.from_app !== 'wf') return {reject:'unexpected mirror source'};
            let out;
            try { out = await opts.onTask(r.src_addr, r.payload, r.seq); }
            catch(e) { if(e && e.code === '22023') return {reject:'malformed mirror delivery'}; throw e; }`)
  .replace("if (r.payload.del) { await hub.orphan(r.src_addr).catch(() => {}); }", "if (r.payload.del) return {defer:'hub deletion acknowledgement requires review'};");
 if(adapter.includes('if (r.payload.del) { await hub.orphan(r.src_addr)'))throw Error('Unreviewed orphan path remains');
 await writeFile(path,adapter);
}
