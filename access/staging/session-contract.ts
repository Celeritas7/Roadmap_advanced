// Pure staging contract. Authorization is enforced by the server, never storage.
export type PendingAction = {
  version: 1; owner: string; kind: 'start' | 'daily'; taskId: string;
  requestId: string; day: string; done?: boolean; expectedUpdatedAt?: string;
}
export type ActionResult = {kind:'start'; sessionId:string} | {
  kind:'daily'; task:Record<string,unknown>; session:Record<string,unknown>|null;
}
export type RpcClient = {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{
  data:unknown; error:{message?:string;code?:string}|null;
}>}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const day=/^\d{4}-\d{2}-\d{2}$/;
const prefix='rm-session-action-v1:';
function valid(p:PendingAction):boolean {
  return p?.version===1 && uuid.test(p.owner) && uuid.test(p.taskId) && uuid.test(p.requestId) &&
    day.test(p.day) && (p.kind==='start' || p.kind==='daily' && typeof p.done==='boolean' &&
      typeof p.expectedUpdatedAt==='string' && Number.isFinite(Date.parse(p.expectedUpdatedAt)));
}
export function createSessionActions({client,storage,requestId,logicalDay}:{
 client:RpcClient;storage:Storage;requestId:()=>string;logicalDay:()=>string;
}) {
 let owner:string|null=null,epoch=0;
 const listeners=new Set<()=>void>(),running=new Map<string,Promise<ActionResult>>();
 const notify=()=>{for(const fn of listeners)fn()};
 const key=(p:PendingAction)=>`${prefix}${p.owner}:${p.kind}:${p.taskId}`;
 const check=(p:PendingAction,started=epoch)=>{
  if(!owner||p.owner!==owner||started!==epoch)throw Error('Account changed. Your original retry is still saved.');
 };
 const parse=(raw:string)=>{
  if(raw.length>8000)throw Error('Saved session action needs review. It has not been sent.');
  const p=JSON.parse(raw) as PendingAction;
  if(!valid(p))throw Error('Saved session action needs review. It has not been sent.');
  return p;
 };
 const list=()=>{
  if(!owner)return [];
  const actions:PendingAction[]=[];
  for(let i=0;i<storage.length;i++) {
   const name=storage.key(i);if(!name?.startsWith(prefix+owner+':'))continue;
   const raw=storage.getItem(name);if(!raw)continue;
   const p=parse(raw);check(p);if(key(p)!==name)throw Error('Saved session action key does not match.');
   actions.push(p);
  }
  return actions;
 };
 function prepare(kind:'start'|'daily',taskId:string,options:{day?:string;done?:boolean;expectedUpdatedAt?:string}={}) {
  if(!owner)throw Error('Sign in before recording a study session.');
  const p:PendingAction={version:1,owner,kind,taskId,requestId:requestId(),day:options.day??logicalDay(),
   ...(kind==='daily'?{done:options.done,expectedUpdatedAt:options.expectedUpdatedAt}:{})};
  if(!valid(p))throw Error('Invalid study action. Refresh the task before trying again.');
  const saved=storage.getItem(key(p));
  // Finish a saved action before accepting a different intent for this task.
  if(saved){const existing=parse(saved);check(existing);if(key(existing)!==key(p))throw Error('Saved action does not match');return existing;}
  storage.setItem(key(p),JSON.stringify(p));notify();return p;
 }
 function run(p:PendingAction):Promise<ActionResult> {
  try {check(p);if(!valid(p))throw Error('Invalid saved action');}catch(e){return Promise.reject(e)}
  const name=key(p),existing=running.get(name);if(existing)return existing;
  const generation=epoch;
  const work=(async()=>{
   const stored=storage.getItem(name);
   if(!stored||JSON.stringify(parse(stored))!==JSON.stringify(p))throw Error('Saved action changed. Refresh before retrying.');
   const call=p.kind==='start'
    ? ['roadmap_start_session',{p_task_id:p.taskId,p_day_key:p.day,p_source:'roadmap'}] as const
    : ['ga_roadmap_set_daily_task',{p_task_id:p.taskId,p_expected_updated_at:p.expectedUpdatedAt,
        p_done:p.done,p_day_key:p.day,p_request_id:p.requestId}] as const;
   const {data,error}=await client.rpc(call[0],call[1]);check(p,generation);
   if(error) {
    if(error.code==='40001')throw Error('This task changed elsewhere. Review it before retrying or discarding the saved action.');
    if(error.code==='42501')throw Error('Access was denied or session saving is paused. Your retry is still saved.');
    throw Error('The save was not confirmed. Reconnect and retry the saved action.');
   }
   let result:ActionResult;
   if(p.kind==='start') {
    if(typeof data!=='string'||!uuid.test(data))throw Error('Session start was not confirmed. Retry is still saved.');
    result={kind:'start',sessionId:data};
   } else {
    const reply=data as {request_id?:string;task?:Record<string,unknown>;session?:Record<string,unknown>|null}|null;
    if(reply?.request_id!==p.requestId || reply.task?.id!==p.taskId || typeof reply.task?.done!=='boolean' ||
      typeof reply.task?.updated_at!=='string' || reply.session===undefined ||
      reply.session!==null && (reply.session.task_id!==p.taskId || reply.session.day_key!==p.day || typeof reply.session.id!=='string'))
      throw Error('Daily action was not confirmed. Retry is still saved.');
    result={kind:'daily',task:reply.task,session:reply.session};
   }
   // Never erase a newer action written by another tab while this request ran.
   if(storage.getItem(name)===stored)storage.removeItem(name);
   notify();return result;
  })();
  running.set(name,work);
  void work.finally(()=>{if(running.get(name)===work)running.delete(name);notify()}).catch(()=>{});
  return work;
 }
 return {
  prepare,run,list,notify,
  bind(next:string|null){if(next!==owner){owner=next;epoch++;notify()}},
  currentOwner:()=>owner,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  discard(p:PendingAction){check(p);if(running.has(key(p)))throw Error('Wait for the current request to finish.');
   const raw=storage.getItem(key(p));if(raw&&parse(raw).requestId===p.requestId)storage.removeItem(key(p));notify()},
 };
}
