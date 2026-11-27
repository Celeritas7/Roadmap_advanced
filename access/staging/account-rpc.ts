import type {RpcClient} from './session-contract.ts'
import type {AnswerContext} from './suggestion-contract.ts'
type Response=ReturnType<RpcClient['rpc']>
type BoundClient={
 auth:{getSession:()=>PromiseLike<{data:{session:{access_token:string;user:{id:string}}|null};error:unknown}>}
 rpc:(name:string,args:Record<string,unknown>)=>Response & {setHeader:(name:string,value:string)=>Response}
}
// Supabase's fetch wrapper preserves an explicit Authorization header. Capture
// one owner's token before constructing the request; never let the SDK borrow
// a newly switched account's token for a previously saved payload.
export function accountRpc(client:BoundClient,context:()=>AnswerContext,assertContext:(c:AnswerContext)=>void):RpcClient{
 return {rpc:async(name,args)=>{
  const actor=context();assertContext(actor)
  const {data,error}=await client.auth.getSession();assertContext(actor)
  if(error||!data.session||data.session.user.id!==actor.owner||!data.session.access_token)throw Error('Sign in with the original account before retrying.')
  return await client.rpc(name,args).setHeader('Authorization','Bearer '+data.session.access_token)
 }}
}
