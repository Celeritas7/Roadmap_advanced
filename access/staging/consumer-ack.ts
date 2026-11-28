import type {RpcClient} from './session-contract.ts'
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
export type ConsumerKind='suggestion.answered'|'session.completed'
// Validate the reply to the exact original request, never a newest-by-address reply.
export async function confirmConsumer(client:RpcClient,seq:number,kind:ConsumerKind,outcome:string,current:()=>void){
 current();const {data,error}=await client.rpc('ga_roadmap_ack_consumer_event',{p_seq:seq});current()
 if(error)throw Object.assign(Error('Hub acknowledgement was not confirmed. Original delivery stays saved; retry it.'),{code:error.code})
 if(!object(data)||data.seq!==seq||data.kind!==kind||data.status!=='delivered'||typeof data.replayed!=='boolean'||
  !Number.isSafeInteger(data.reply_seq)||Number(data.reply_seq)<1||!object(data.reply)||Object.keys(data.reply).length!==4||
  data.reply.protocol!=='roadmap.consumer.v1'||data.reply.request_seq!==seq||data.reply.kind!==kind||data.reply.status!==outcome)
  throw Error('Hub acknowledgement was not confirmed.')
}
