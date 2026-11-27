import {accountRpc} from './account-rpc.ts'
import {supabase} from '../lib/supabase.ts'
import {useStore} from './useStore.ts'
import {dayKey} from '../lib/dailyReset.ts'
import {assertNoPendingStructure} from './task-write-activity.ts'
import {createSuggestionAnswers,type AnswerIntent,type AnswerResult} from './suggestion-contract.ts'
export const suggestionAnswers=createSuggestionAnswers({client:accountRpc(supabase,()=>suggestionAnswers.context(),c=>suggestionAnswers.assertContext(c)),storage:localStorage,uuid:()=>crypto.randomUUID()})
let seen=false,previous:string|null=null,locked=false,message=''
let applyView:((result:AnswerResult)=>Promise<void>)|null=null
export function registerAnswerView(fn:(result:AnswerResult)=>Promise<void>){applyView=fn}
export const suggestionMessage=()=>message
export function setSuggestionMessage(text:string){message=text;suggestionAnswers.notify()}
supabase.auth.onAuthStateChange((_event,session)=>{
 const next=session?.user.id??null;if(seen&&next!==previous)locked=true
 suggestionAnswers.bind(next);previous=next;seen=true;message=''
})
window.addEventListener('storage',()=>suggestionAnswers.notify())
function ready(){
 if(locked)throw Error('Reload safely to continue with the current account.')
 suggestionAnswers.assertContext(suggestionAnswers.context())
 if(useStore.getState().loading||!applyView)throw Error('Wait for Roadmap to load before applying answers.')
 assertNoPendingStructure()
}
let applying:{owner:string|null;epoch:number;requestId:string;promise:Promise<void>}|null=null
export function retrySuggestionAnswer(p:AnswerIntent):Promise<void>{
 const actor=suggestionAnswers.context()
 try{ready();suggestionAnswers.assertContext({...actor,owner:p.owner})}catch(e){return Promise.reject(e)}
 if(applying)return applying.owner===actor.owner&&applying.epoch===actor.epoch&&applying.requestId===p.requestId?applying.promise:Promise.reject(Error('Wait for the current suggestion answer.'))
 const work=(async()=>{
  const result=await suggestionAnswers.run(p);ready();suggestionAnswers.assertContext(result.context)
  await applyView!(result);ready();suggestionAnswers.assertContext(result.context)
  suggestionAnswers.acknowledge(result);setSuggestionMessage(result.outcome==='unknown'?'Unknown suggestion reply was recorded.':'Suggestion answer confirmed.')
 })()
 applying={...actor,requestId:p.requestId,promise:work}
 void work.catch(e=>setSuggestionMessage(e instanceof Error?e.message:'Answer stays saved.')).finally(()=>{if(applying?.promise===work)applying=null}).catch(()=>{})
 return work
}
export function answerSuggestion(p:Record<string,unknown>,from:string,seq:number|null):Promise<void>{
 ready()
 return retrySuggestionAnswer(suggestionAnswers.prepare({suggestion_id:p.suggestion_id,action:p.action,reason:p.reason??null,from_app:from,seq,day_key:dayKey(),at:p.at??null}))
}
