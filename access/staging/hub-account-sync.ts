import {supabase} from '../lib/supabase.ts'
import {accountClient,createHubAccounts,ownerStorage} from './hub-account.ts'
import {createHubOutbox,openHubOutbox,type OutboxRow} from './hub-outbox.ts'
export const hubAccounts=createHubAccounts()
export const hubContextStorage=ownerStorage(localStorage,()=>hubAccounts.scope())
let seen=false,previous:string|null=null,reload=false,message='',rows:OutboxRow[]=[]
const listeners=new Set<()=>void>(),notify=()=>{for(const fn of listeners)fn()}
let store:ReturnType<typeof openHubOutbox>|null=null,cached:{scope:ReturnType<typeof hubAccounts.scope>;queue:ReturnType<typeof createHubOutbox>;client:ReturnType<typeof accountClient>}|null=null
export const hubReloadRequired=()=>reload
export const hubQueueView=()=>({message,rows})
export function hubMessage(text:string){message=text;notify()}
export function subscribeHubQueue(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn)}}
export function preparedHubClient(){
 if(reload)throw Error('Account changed. Reload safely before starting hub work.')
 const scope=hubAccounts.scope()
 if(cached?.scope!==scope){
  store??=openHubOutbox();const client=accountClient(supabase,scope)
  const queue=createHubOutbox(scope,'rm',store,client,navigator.locks,()=>{void refreshHubQueue()})
  cached={scope,queue,client}
 }
 return {...cached.client,__hubAccount:{scope:cached.scope,outbox:cached.queue,report:hubMessage}}
}
export async function refreshHubQueue(){
 const actor=hubAccounts.context()
 try{const client=preparedHubClient(),next=await client.__hubAccount.outbox.list();client.__hubAccount.scope.assert();rows=next;notify()}
 catch(e){if(actor.epoch===hubAccounts.context().epoch)hubMessage(e instanceof Error?e.message:'Queue is unavailable. Existing work was kept.')}
}
export async function retryHubQueue(){
 try{const client=preparedHubClient();await client.__hubAccount.outbox.flush();client.__hubAccount.scope.assert();await refreshHubQueue()}
 catch(e){hubMessage(e instanceof Error?e.message:'Send is unconfirmed. Original work remains saved.')}
}
hubAccounts.subscribe(()=>{cached=null;rows=[];message='';notify()})
supabase.auth.onAuthStateChange((_event,session)=>{
 const owner=session&&!session.user.is_anonymous?session.user.id:null
 if(seen&&owner!==previous)reload=true
 hubAccounts.bind(owner);previous=owner;seen=true
 if(reload)hubMessage('Account changed. Reload safely; each account keeps its saved hub work.')
})
window.addEventListener('pagehide',()=>{try{hubAccounts.scope().stop()}catch{/* signed out */}})
