import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import vm from 'node:vm';
import {prepareSuggestions} from '../staging/prepare-suggestions.mjs';
import {prepareMirrors} from '../staging/prepare-mirrors.mjs';
const original={};for(const file of ['src/lib/suggester.ts','src/lib/rmHub.ts','src/types.ts','public/akatsuki/rm-adapter.js'])original[file]=await readFile(new URL('../../'+file,import.meta.url),'utf8');
const temp=await mkdtemp(join(tmpdir(),'roadmap-suggestion-adapter-'));let adapter;
try{for(const dir of ['src/store','src/lib','public/akatsuki'])await mkdir(join(temp,dir),{recursive:true});await writeFile(join(temp,'src/types.ts'),original['src/types.ts']);await prepareSuggestions(temp,original);await prepareMirrors(temp,original);adapter=await readFile(join(temp,'public/akatsuki/rm-adapter.js'),'utf8')}finally{await rm(temp,{recursive:true,force:true})}
const plain=x=>JSON.parse(JSON.stringify(x));
// Adapter-only checks. The real copied client's checked ack/gates are covered in mirrors.browser.mjs.
function setup(callbacks){let handlers;const backend={listen:h=>{handlers=h;return()=>{}}};const sandbox={console,window:{Akatsuki:()=>backend}};vm.createContext(sandbox);vm.runInContext(adapter,sandbox);
 const hub=sandbox.window.RmHub({},callbacks);hub.start();return {hub,deliver:r=>handlers[r.kind](r)};
}
const event=(kind='task.upsert')=>({kind,from_app:kind==='session.completed'?'jlpt':'wf',to_app:'rm',seq:27,src_addr:{board_id:'board',item_key:'item',sub_id:'sub'},payload:{}});
test('copied adapter preserves explicit rejection and deferral for independently reviewed consumers',async()=>{
 for(const [kind,callback,result] of [['task.upsert','onTask',{reject:'bad'}],['task.upsert','onTask',{defer:'busy'}],['suggestion.answered','onAnswer',{reject:'bad'}],['session.completed','onSession',{defer:'busy'}]]){
  const s=setup({[callback]:async()=>result});assert.deepEqual(plain(await s.deliver(event(kind))),result);
 }
});
test('adapter waits for suggestion handler completion before returning to its consumer',async()=>{
 let finish,settled=false;const s=setup({onAnswer:()=>new Promise(r=>finish=r)}),work=s.deliver(event('suggestion.answered')).then(r=>{settled=true;return r});
 await new Promise(r=>setImmediate(r));assert.equal(settled,false);finish();assert.deepEqual(plain(await work),{});
});
test('publication cache confirms only successful full nested values and does not repeatedly clear a native suggestion',async()=>{
 const s=setup({}),writes=[];let fail=true,removes=0;
 s.hub.hub.put=async(...args)=>{writes.push(plain(args));if(fail)throw Error('Lost write')};s.hub.hub.remove=async()=>{removes++;if(fail)throw Error('Lost remove')};
 const row={id:'sg',task:{board_id:'board',item_key:'study:日本語',sub_id:'sub',extra:{keep:'first'}},title:'Keep',say:'Keep',level:null,toneStep:0,until:'2026-11-28T00:00:00Z',madeAt:'2026-11-27T00:00:00Z'};
 await assert.rejects(()=>s.hub.suggest(row));fail=false;await s.hub.suggest(row);await s.hub.suggest(row);assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);
 await s.hub.suggest({...row,task:{...row.task,extra:{keep:'second'}}});assert.equal(writes.length,3);assert.equal(writes[2][3].made_at,row.madeAt);
 fail=true;await assert.rejects(()=>s.hub.clearSuggestion());fail=false;await s.hub.clearSuggestion();await s.hub.clearSuggestion();assert.equal(removes,2);
 await s.hub.suggest(row);assert.equal(writes.length,4);
});
test('mirror adapter retains malformed/foreign refusals and never invents pairing or orphan writes',async()=>{
 const proof={acknowledged:true,seq:27},ok=setup({onTask:async()=>proof});assert.deepEqual(plain(await ok.deliver({...event(),payload:{del:true}})),proof);
 assert.deepEqual(plain(await ok.deliver({...event(),from_app:'other'})),{reject:'unexpected mirror source'});
 const bad=setup({onTask:async()=>{throw Object.assign(Error('changed wording'),{code:'22023'})}});assert.deepEqual(plain(await bad.deliver(event())),{reject:'malformed mirror delivery'});
 const lost=setup({onTask:async()=>{throw Object.assign(Error('lost reply'),{code:'504'})}});await assert.rejects(()=>lost.deliver(event()),/lost reply/);
});
test('mirror adapter waits for checked acknowledgement proof and preserves its sequence',async()=>{
 let finish,seen,settled=false;const s=setup({onTask:(...args)=>{seen=args;return new Promise(r=>finish=r)}}),row=event(),work=s.deliver(row).then(r=>{settled=true;return r});
 await new Promise(r=>setImmediate(r));assert.equal(settled,false);assert.deepEqual(seen,[row.src_addr,row.payload,27]);finish({acknowledged:true,seq:27});assert.deepEqual(plain(await work),{acknowledged:true,seq:27});
});
