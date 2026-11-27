import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import vm from 'node:vm';
import {prepareSuggestions} from '../staging/prepare-suggestions.mjs';
import {prepareMirrors} from '../staging/prepare-mirrors.mjs';
const original={};for(const file of ['src/lib/suggester.ts','src/lib/rmHub.ts','public/akatsuki/rm-adapter.js'])original[file]=await readFile(new URL('../../'+file,import.meta.url),'utf8');
const temp=await mkdtemp(join(tmpdir(),'roadmap-suggestion-adapter-'));let adapter;
try{for(const dir of ['src/store','src/lib','public/akatsuki'])await mkdir(join(temp,dir),{recursive:true});await prepareSuggestions(temp,original);await prepareMirrors(temp,original);adapter=await readFile(join(temp,'public/akatsuki/rm-adapter.js'),'utf8')}finally{await rm(temp,{recursive:true,force:true})}
const client=await readFile(new URL('../../public/akatsuki/akatsuki-client.js',import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function setup(callbacks){let handlers;const calls=[],rows=[];
 const sandbox={console,navigator:{onLine:true},document:{},localStorage:{getItem:()=>null,setItem:()=>{}},window:{addEventListener:()=>{}}};vm.createContext(sandbox);vm.runInContext(client,sandbox);vm.runInContext(adapter,sandbox);
 const hub=sandbox.window.RmHub({rpc:async(name,args)=>{calls.push({name,args:plain(args)});return {error:null,data:name==='akatsuki_consume'?rows:[]}}},callbacks);
 hub.hub.listen=h=>{handlers=h;return()=>{}};hub.start();return {hub,calls,rows,consume:()=>hub.hub.consume(handlers)};
}
test('copied adapter preserves rejection and deferral instead of acknowledging malformed or transient work',async()=>{
 for(const [kind,callback,result,status] of [['task.upsert','onTask',{reject:'bad'},'rejected'],['task.upsert','onTask',{defer:'busy'},'defer'],
  ['suggestion.answered','onAnswer',{reject:'bad'},'rejected'],['session.completed','onSession',{defer:'busy'},'defer']]){
  const s=setup({[callback]:async()=>result});s.rows.push({kind,from_app:'wf',seq:27,src_addr:{board_id:'board',item_key:'item',sub_id:'sub'},payload:{}});await s.consume();
  const ack=s.calls.find(c=>c.name==='akatsuki_ack'),defer=s.calls.find(c=>c.name==='akatsuki_defer');
  if(status==='defer'){assert.equal(ack,undefined);assert.ok(defer)}else{assert.equal(ack.args.p_status,status);assert.equal(ack.args.p_b_addr,null);assert.equal(defer,undefined)}
 }
 for(const [code,status] of [['22023','rejected'],['504','defer']]){
  const s=setup({onAnswer:async()=>{throw Object.assign(Error('changed wording'),{code})}});s.rows.push({kind:'suggestion.answered',seq:28,payload:{}});await s.consume();
  assert.ok(s.calls.some(c=>status==='defer'?c.name==='akatsuki_defer':c.name==='akatsuki_ack'&&c.args.p_status===status));
 }
});
test('hub acknowledgement waits until the actual handler finishes applying the answer',async()=>{
 let finish;const s=setup({onAnswer:()=>new Promise(r=>finish=r)});s.rows.push({kind:'suggestion.answered',seq:29,payload:{}});const flight=s.consume();await new Promise(r=>setImmediate(r));
 assert.equal(s.calls.filter(c=>c.name==='akatsuki_ack').length,0);finish();await flight;assert.equal(s.calls.filter(c=>c.name==='akatsuki_ack').length,1);
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

test('mirror adapter rejects malformed/foreign deliveries and never acknowledges a failed or unreviewed orphan transition',async()=>{
 for(const [source,code,del,expected] of [['wf','22023',false,'rejected'],['other',null,false,'rejected'],['wf','504',false,'defer'],['wf',null,true,'defer']]){
  const s=setup({onTask:async()=>{if(code)throw Object.assign(Error('changed wording'),{code});return 'synthetic-task'}});
  s.rows.push({kind:'task.upsert',from_app:source,seq:18,src_addr:{board_id:'a',item_key:'b',sub_id:'c'},payload:{title:'Keep',del}});await s.consume();
  assert.equal(s.calls.some(c=>c.name==='akatsuki_orphan'),false);
  if(expected==='defer'){assert.ok(s.calls.some(c=>c.name==='akatsuki_defer'));assert.equal(s.calls.some(c=>c.name==='akatsuki_ack'),false)}
  else assert.equal(s.calls.find(c=>c.name==='akatsuki_ack').args.p_status,'rejected');
 }
});
test('mirror acknowledgement waits for visible application and stale callbacks do not rewrite hub pairing',async()=>{
 let finish;const s=setup({onTask:()=>new Promise(r=>finish=r)});s.rows.push({kind:'task.upsert',from_app:'wf',seq:19,src_addr:{board_id:'a',item_key:'b',sub_id:'c'},payload:{title:'Keep'}});
 const work=s.consume();await new Promise(r=>setImmediate(r));assert.equal(s.calls.some(c=>c.name==='akatsuki_ack'),false);finish(null);await work;
 assert.equal(s.calls.find(c=>c.name==='akatsuki_ack').args.p_b_addr,null);
});
