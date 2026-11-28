import {test} from 'node:test';import assert from 'node:assert/strict';import {createStudyCaller,studyLaunchUrl,safeStudyReturn} from '../staging/study-caller.mjs';
const id=n=>'21000000-0000-4000-8000-'+String(n).padStart(12,'0');const ret='https://celeritas7.github.io/Roadmap_advanced/';
const url=(owner=id(1),launch=id(4))=>studyLaunchUrl('https://celeritas7.github.io/Japanese_study_app_advanced/?view=study#keep',id(3),'2026-11-26',owner,launch,ret);
const memory=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
function setup(storage=memory()){
 const s={storage,time:Date.parse('2026-11-26T18:50:00Z'),rows:new Map(),calls:[],mode:'ok',owner:id(1)};
 const request=fn=>({setHeader:(k,v)=>{s.calls.push({header:[k,v]});return fn()}});
 const client={auth:{getSession:async()=>({data:{session:{user:{id:s.owner},access_token:'synthetic-'+s.owner}},error:null})},
  from:()=>{let key;const q={select:()=>q,eq:(k,v)=>{if(k==='idempotency_key')key=v;return q},maybeSingle:()=>request(async()=>({data:s.rows.get(key)??null,error:null}))};return q},
  rpc:(name,args)=>request(async()=>{s.calls.push({name,args:structuredClone(args)});if(s.mode==='contract')return {error:{code:'AK103'}};
   s.rows.set(args.p.idempotency_key,{...args.p,user_id:s.owner,seq:20,status:'pending'});if(s.mode==='hold')return new Promise(resolve=>s.finish=()=>resolve({data:{seq:20,status:'pending'}}));return s.mode==='lost'?{error:{code:'504'}}:{data:{seq:20,status:s.mode==='queued'?'queued':'pending'}}})};
 s.caller=createStudyCaller({client,storage,clock:()=>s.time,notify:m=>s.message=m});s.caller.bind({owner:id(1),ownUser:id(2)});return s;
}
test('only exact study/return routes get identifiers and the original day and start survive repeated reads',async()=>{
 assert.equal(safeStudyReturn('javascript:alert(1)'),null);assert.equal(safeStudyReturn(ret+'?next=https://other.invalid'),null);
 for(const raw of ['https://japanese-study-app-advanced.attacker.invalid/','https://celeritas7.github.io/Other/','https://celeritas7.github.io@evil.invalid/Japanese_study_app_advanced/'])assert.equal(studyLaunchUrl(raw,id(3),'2026-11-26',id(1),id(4),ret),raw);
 const s=setup();const first=s.caller.init(url());s.time+=20*60000;assert.equal(s.caller.init(url()).t0,first.t0);
 await s.caller.complete({feedback:{words:3,mode:'goi',level:'N3'}});const p=s.caller.list()[0];assert.equal(p.effect.payload.duration,20);assert.equal(p.effect.payload.day_key,'2026-11-26');assert.equal(s.caller.returnUrl(),ret);
 assert.equal(new URL(url()).hash,'#keep');assert.equal(new URL(url()).searchParams.get('view'),'study');
});
test('lost publish response and reload recover one stored effect without duplicate send',async()=>{
 const s=setup();s.storage.setItem('rm-handshake','legacy-keep');s.storage.setItem('offline-pack','keep');s.caller.init(url());s.mode='lost';
 await assert.rejects(()=>s.caller.complete({feedback:{mode:'srs',words:4,correct:3,testType:'reading'}}),/not confirmed/);const p=s.caller.list()[0];assert.equal(p.effect.payload.test_type,'reading');
 const next=setup(s.storage);next.rows=s.rows;assert.equal(next.caller.init(url()).t0,p.t0);await next.caller.retry(p);assert.equal(next.calls.filter(c=>c.name==='akatsuki_publish').length,0);assert.equal(next.caller.list().length,1);
 next.rows.get(p.effect.idempotency_key).status='delivered';assert.equal(await next.caller.retry(p),true);assert.equal(next.caller.list().length,0);
 assert.equal(next.storage.getItem('rm-handshake'),'legacy-keep');assert.equal(next.storage.getItem('offline-pack'),'keep');
 assert.ok(s.calls.filter(c=>c.header).every(c=>c.header[1]==='Bearer synthetic-'+id(1)));
});
test('contract errors stay blocked; queued or malformed publication never confirms completion',async()=>{
 const s=setup();s.caller.init(url());s.mode='contract';await assert.rejects(()=>s.caller.complete({feedback:{mode:'goi'}}));await assert.rejects(()=>s.caller.retry(s.caller.list()[0]),/requires review/);assert.equal(s.calls.filter(c=>c.name).length,1);
 const q=setup();q.caller.init(url());q.mode='queued';await assert.rejects(()=>q.caller.complete({feedback:{mode:'goi'}}));assert.equal(q.caller.list().length,1);
});
test('account mismatch, guest and A-B-A responses never adopt or clear original pending reports',async()=>{
 const s=setup();assert.throws(()=>s.caller.init(url(id(7))),/original Roadmap/);s.caller.init(url());s.mode='hold';const flight=s.caller.complete({feedback:{mode:'goi'}});
 while(!s.finish)await new Promise(r=>setTimeout(r,0));s.caller.bind({owner:id(7),ownUser:id(8)});assert.equal(s.caller.list().length,0);s.caller.bind({owner:id(1),ownUser:id(2)});s.finish();await assert.rejects(()=>flight,/Account changed/);assert.equal(s.caller.list().length,1);
 s.caller.bind(null);assert.throws(()=>s.caller.init(url()));assert.equal(s.caller.isLaunched(),false);
});
test('missing day, duplicate parameters, changed launch, foreign task and quota failure cannot publish',async()=>{
 const s=setup();for(const raw of [url().replace('rm_day=2026-11-26','rm_day='),url().replace('#keep','&rm_day=2026-11-27#keep')])assert.throws(()=>s.caller.init(raw));
 s.caller.init(url());assert.throws(()=>s.caller.init(url().replace('2026-11-26','2026-11-27')),/changed/);assert.equal(await s.caller.complete({feedback:{mode:'goi'}}),false);s.caller.init(url());await assert.rejects(()=>s.caller.complete({taskId:id(9),feedback:{mode:'goi'}}),/original/);
 s.storage.setItem=()=>{throw Error('Quota')};await assert.rejects(()=>s.caller.complete({feedback:{mode:'goi'}}),/Quota/);assert.equal(s.calls.length,0);
});
