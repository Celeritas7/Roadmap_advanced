import type {RpcClient} from './session-contract.ts'
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
export type ConsumerKind='suggestion.answered'|'session.completed'
export async function confirmConsumer(client:RpcClient,seq:number,kind:ConsumerKind,current:()=>void){
 current();const {data,error}=await client.rpc('ga_roadmap_ack_consumer_event',{p_seq:seq});current()
 if(error)throw Object.assign(Error('Hub acknowledgement was not confirmed. Original delivery stays saved; retry it.'),{code:error.code})
 const outcomes=kind==='suggestion.answered'?['applied','already_answered','unknown']:['reported','preserved','superseded','removed']
 if(!object(data)||data.seq!==seq||data.kind!==kind||data.status!=='delivered'||
  typeof data.replayed!=='boolean'||!outcomes.includes(String(data.outcome)))throw Error('Hub acknowledgement was not confirmed.')
}
