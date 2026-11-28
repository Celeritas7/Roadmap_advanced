// Staging only. These guards isolate browser work; server JWT/RLS remains mandatory.
export const isOwner=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
export function accountScope(owner:string){
 if(!isOwner(owner))throw Error('A verified account is required.')
 const controller=new AbortController(),cleanups=new Set<()=>void>()
 return {owner,signal:controller.signal,
  assert(){if(controller.signal.aborted)throw Error('Account work stopped. Reload safely; original work remains saved.')},
  cleanup(fn:()=>void){if(controller.signal.aborted)fn();else cleanups.add(fn);return ()=>{cleanups.delete(fn)}},
  stop(){if(controller.signal.aborted)return;controller.abort();for(const fn of cleanups){try{fn()}catch{/* finish every cleanup */}}cleanups.clear()},
 }
}
export type AccountScope=ReturnType<typeof accountScope>
export function createHubAccounts(){
 let current:AccountScope|null=null,epoch=0
 const listeners=new Set<()=>void>()
 return {bind(owner:string|null){
  if(owner!==null&&!isOwner(owner))throw Error('Invalid account identity.')
  if(owner===current?.owner||owner===null&&current===null)return
  current?.stop();current=owner?accountScope(owner):null;epoch++;for(const fn of listeners)fn()
 },scope(){if(!current)throw Error('Sign in before using the hub.');current.assert();return current},
 context:()=>({owner:current?.owner??null,epoch}),subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn)}}}
}

// SDK builders are lazy. Capture the original owner's current token immediately
// before await, not when the builder is created, and reject late responses.
// The SDK preserves explicit Authorization; no token is persisted in the queue.
type Backend={auth:{getSession:()=>PromiseLike<{data:{session:{access_token:string;user:{id:string;is_anonymous?:boolean}}|null};error:unknown}>};rpc:(...args:any[])=>any;from:(...args:any[])=>any}
export function accountClient(base:Backend,scope:AccountScope){
 const wrap=(builder:any):any=>new Proxy(builder,{get(target,key){
  if(key==='then')return (yes:any,no:any)=>(async()=>{
   scope.assert();const {data,error}=await base.auth.getSession();scope.assert()
   const session=data.session
   if(error||!session||session.user.is_anonymous||session.user.id!==scope.owner||!session.access_token)throw Error('Sign in to the original hub account.')
   const request=target.setHeader('Authorization','Bearer '+session.access_token).abortSignal(scope.signal)
   const response=await request;scope.assert();return response
  })().then(yes,no)
  const value=Reflect.get(target,key)
  return typeof value==='function'?(...args:any[])=>{scope.assert();const next=value.apply(target,args);return next&&typeof next==='object'?wrap(next):next}:value
 }})
 return {rpc:(...args:any[])=>{scope.assert();return wrap(base.rpc(...args))},from:(...args:any[])=>{scope.assert();return wrap(base.from(...args))}}
}

export function ownerStorage(storage:Storage,scope:()=>AccountScope){
 const key=(s:AccountScope,name:string)=>{
  if(!['rm-ak-checkin','rm-ak-device','rm-ak-place','rm-ak-place-at','rm-ak-stuck','rm-stale-day'].includes(name))throw Error('Unknown local context key.')
  return 'rm-hub-context-v1:'+s.owner+':'+name
 }
 return {getItem(name:string){let s:AccountScope;try{s=scope()}catch{return null}return storage.getItem(key(s,name))},
  setItem(name:string,value:string){const s=scope();if(new TextEncoder().encode(value).length>8192)throw Error('Context is too large.');storage.setItem(key(s,name),value)},
  removeItem(name:string){const s=scope();storage.removeItem(key(s,name))}}
}

// Exactly one visible, online leader per account on this origin. Waiting locks
// are cancellable; held locks are released after the current tick settles.
// No locks API means paused, never an unsafe every-tab fallback.
export function startAccountLeader(scope:AccountScope,tick:(lease:AccountScope)=>Promise<void>,report:(message:string)=>void,ms=15000){
 scope.assert()
 if(!navigator.locks){report('Background hub work paused: this browser has no Web Locks support.');return ()=>{}}
 let stopped=false,attempt:{lease:AccountScope;release:()=>void;done:Promise<unknown>}|null=null
 const active=()=>!stopped&&!scope.signal.aborted&&navigator.onLine&&!document.hidden
 const reconcile=()=>{
  if(!active()){attempt?.lease.stop();attempt?.release();return}
  if(attempt)return
  const lease=accountScope(scope.owner);let release=()=>{}
  const released=new Promise<void>(resolve=>{release=resolve})
  const next={lease,release,done:Promise.resolve() as Promise<unknown>};attempt=next
  next.done=navigator.locks.request('rm-hub-leader-v1:'+scope.owner,{signal:lease.signal},async()=>{
   scope.assert();lease.assert();report('Background hub work active for this account.')
   const running:{flight:Promise<void>|null}={flight:null}
   const run=()=>{
    if(!active()||lease.signal.aborted||running.flight)return
    running.flight=(async()=>{scope.assert();lease.assert();await tick(lease);lease.assert()})()
    void running.flight.catch(()=>{if(!lease.signal.aborted)report('Hub work is unconfirmed. Review the saved queue.')} ).finally(()=>{running.flight=null})
   }
   const timer=setInterval(run,ms);run()
   try{await released}finally{clearInterval(timer);await running.flight?.catch(()=>{})}
  }).catch(()=>{if(!lease.signal.aborted)report('Background hub work paused. Reload safely.')}).finally(()=>{
   if(attempt===next)attempt=null
   // A visibility/online event may have returned while the old tick settled.
   if(active()&&lease.signal.aborted)reconcile()
  })
 }
 const stop=()=>{if(stopped)return;stopped=true;attempt?.lease.stop();attempt?.release();window.removeEventListener('online',reconcile);window.removeEventListener('offline',reconcile);document.removeEventListener('visibilitychange',reconcile);unregister()}
 const unregister=scope.cleanup(stop)
 window.addEventListener('online',reconcile);window.addEventListener('offline',reconcile);document.addEventListener('visibilitychange',reconcile)
 reconcile();return stop
}
