// Isolated caller preparation. No credentials, login, automatic retry or hosted configuration.
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const exact=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const bytes=x=>new TextEncoder().encode(x).length;
export function safeStudyReturn(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='celeritas7.github.io'||u.port||u.username||u.password||u.pathname!=='/Roadmap_advanced/'||u.search)return null;return u.href}catch{return null}}
export function studyLaunchUrl(raw,task,logicalDay,owner,launch,returnUrl){
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='celeritas7.github.io'||u.port||u.username||u.password||u.pathname!=='/Japanese_study_app_advanced/'||!uuid(task)||!uuid(owner)||!uuid(launch)||!day(logicalDay)||!safeStudyReturn(returnUrl))return raw;
  for(const [k,v] of Object.entries({rm_task:task,rm_day:logicalDay,rm_owner:owner,rm_launch:launch,rm_ret:returnUrl}))u.searchParams.set(k,v);return u.href;
 }catch{return raw}
}
export function createStudyCaller({client,storage,clock=()=>Date.now(),notify=()=>{}}){
 let account=null,epoch=0,handshake=null,running=null;
 const prefix=()=>account?'jlpt-study-v1:'+account.owner+':'+account.ownUser+':':null;
 const actor=()=>{if(!account)throw Error('Sign in to both study and hub accounts before launching.');return {...account,epoch}};
 const current=a=>{if(!account||a.epoch!==epoch||a.owner!==account.owner||a.ownUser!==account.ownUser)throw Error('Account changed. Original study report remains saved.')};
 const parse=raw=>{if(!raw||bytes(raw)>20000)throw Error('Saved study report needs review.');const p=JSON.parse(raw);
  if(!object(p)||p.version!==1||!uuid(p.owner)||!uuid(p.ownUser)||!uuid(p.launch)||!uuid(p.task)||!day(p.day)||!Number.isSafeInteger(p.t0)||p.t0<0||typeof p.confirmed!=='boolean'||!safeStudyReturn(p.ret)||
   p.effect!==null&&(!object(p.effect)||p.effect.idempotency_key!=='jlpt:session:'+p.launch||p.effect.from_app!=='jlpt'||p.effect.to_app!=='rm'||p.effect.kind!=='session.completed'||
    !exact(p.effect.src_addr,{task_id:p.task,day_key:p.day})||p.effect.payload?.task_id!==p.task||p.effect.payload?.day_key!==p.day||p.effect.payload?.source!=='japanese-study-app-advanced')||
   p.blocked!==null&&typeof p.blocked!=='string')throw Error('Saved study report needs review.');return p};
 const key=p=>'jlpt-study-v1:'+p.owner+':'+p.ownUser+':'+p.launch;
 const save=p=>{const raw=JSON.stringify(p);parse(raw);storage.setItem(key(p),raw);return raw};
 function init(url){handshake=null;const a=actor(),u=new URL(url),q=u.searchParams;
  if(!q.has('rm_task')){handshake=null;return null}
  for(const k of ['rm_task','rm_day','rm_owner','rm_launch','rm_ret'])if(q.getAll(k).length!==1)throw Error('Incomplete study launch. Reopen it from Roadmap.');
  if(q.get('rm_owner')!==a.owner)throw Error('Use the original Roadmap account.');
  const p={version:1,owner:a.owner,ownUser:a.ownUser,launch:q.get('rm_launch'),task:q.get('rm_task'),day:q.get('rm_day'),ret:q.get('rm_ret'),t0:clock(),effect:null,blocked:null,confirmed:false};parse(JSON.stringify(p));
  const raw=storage.getItem(key(p));if(raw){const old=parse(raw);if(!exact({...old,t0:p.t0,effect:null,blocked:null,confirmed:false},p))throw Error('Launch changed. Keep the original study report.');handshake=old}
  else{save(p);handshake=p}return {...handshake};
 }
 function list(){if(!account)return [];const out=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(prefix()))continue;const p=parse(storage.getItem(k));if(key(p)!==k)throw Error('Saved study identity changed.');if(p.effect&&!p.confirmed)out.push(p)}return out}
 async function run(intent){const a=actor();if(intent.owner!==a.owner||intent.ownUser!==a.ownUser)throw Error('Use the original study account.');
  const raw=storage.getItem(key(intent)),p=parse(raw);if(!exact(intent,p))throw Error('Saved study report changed.');if(p.blocked)throw Error('Hub contract requires review ('+p.blocked+').');
  if(!p.effect)return false;if(p.confirmed)return true;
  const check=()=>{current(a);if(storage.getItem(key(p))!==raw)throw Error('Newer study report kept.');};
  const {data,error}=await client.auth.getSession();check();if(error||data.session?.user?.id!==a.owner||!data.session.access_token)throw Error('Sign in to the original hub account.');
  const token=data.session.access_token;
  const reply=await client.from('akatsuki_requests').select('seq,user_id,from_app,to_app,kind,src_addr,payload,idempotency_key,status').eq('user_id',a.owner).eq('idempotency_key',p.effect.idempotency_key).maybeSingle().setHeader('Authorization','Bearer '+token);check();
  if(reply.error)throw Error('Report status unavailable. Original retry remains saved.');
  if(reply.data){const r=reply.data;if(r.user_id!==a.owner||!Number.isSafeInteger(r.seq)||r.seq<1||!exact({...p.effect,src_clock:undefined},{...r,user_id:undefined,seq:undefined,status:undefined,src_clock:undefined}))throw Error('Stored hub report differs. Review required.');
   if(r.status==='delivered'){save({...p,confirmed:true});notify('Study report confirmed by Roadmap.');return true}
   if(r.status!=='pending')throw Error('Hub report needs review ('+r.status+').');notify('Sent to Roadmap; confirmation is pending.');return false;
  }
  const sent=await client.rpc('akatsuki_publish',{p:p.effect}).setHeader('Authorization','Bearer '+token);check();
  if(sent.error){if(/^AK1\d\d$/.test(sent.error.code)||sent.error.code==='AK201')save({...p,blocked:sent.error.code});throw Error('Study publication was not confirmed'+(sent.error.code?' ('+sent.error.code+')':'')+'.')}
  const r=Array.isArray(sent.data)?sent.data[0]:sent.data;if(!object(r)||!Number.isSafeInteger(r.seq)||r.seq<1||!['pending','skipped','closed'].includes(r.status))throw Error('Study publication was not confirmed.');
  notify('Sent to Roadmap; confirmation is pending.');return false;
 }
 function retry(p){const a=actor(),flight=epoch+':'+p.launch;if(running)return running.key===flight?running.promise:Promise.reject(Error('Wait for the current report.'));
  const work=run(p);running={key:flight,promise:work};void work.finally(()=>{if(running?.promise===work)running=null;current(a)}).catch(()=>{});return work;
 }
 function complete({durationMin=null,feedback={},taskId=null}={}){
  try{const a=actor();if(!handshake)return Promise.resolve(false);current({...a,owner:handshake.owner,ownUser:handshake.ownUser});let p=parse(storage.getItem(key(handshake)));
   if(taskId!==null&&taskId!==p.task)throw Error('Completion must use its original launched task.');
   if(!p.effect){if(!object(feedback)||Object.keys(feedback).some(k=>!['words','mode','level','correct','testType'].includes(k))||typeof feedback.mode!=='string')throw Error('Invalid study results.');
    const duration=durationMin??Math.max(1,Math.round((clock()-p.t0)/60000));if(!Number.isInteger(duration)||duration<1||duration>1440)throw Error('Invalid study duration.');
    for(const k of ['words','correct'])if(k in feedback&&(!Number.isInteger(feedback[k])||feedback[k]<0||feedback[k]>999999))throw Error('Invalid study count.');
    if('correct' in feedback&&(!('words' in feedback)||feedback.correct>feedback.words))throw Error('Invalid study count.');
    const payload={task_id:p.task,day_key:p.day,duration,mode:feedback.mode,source:'japanese-study-app-advanced'};
    for(const k of ['words','level','correct'])if(k in feedback)payload[k]=feedback[k];if('testType' in feedback)payload.test_type=feedback.testType;
    p={...p,effect:{from_app:'jlpt',to_app:'rm',kind:'session.completed',src_addr:{task_id:p.task,day_key:p.day},src_clock:null,payload,idempotency_key:'jlpt:session:'+p.launch}};save(p);
   }return retry(p);
  }catch(e){return Promise.reject(e)}
 }
 return {init,complete,retry,list,isLaunched:()=>!!handshake,returnUrl:()=>{actor();return handshake&&handshake.owner===account.owner&&handshake.ownUser===account.ownUser?safeStudyReturn(handshake.ret):null},
  bind(next){if(next!==null&&(!uuid(next.owner)||!uuid(next.ownUser)))throw Error('Verified account identities required.');if(!exact(account,next)){account=next&&{...next};epoch++;handshake=null}},
 };
}
