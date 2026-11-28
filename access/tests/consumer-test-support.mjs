export const consumerAck=(seq,kind,outcome)=>({error:null,data:{seq,kind,status:'delivered',replayed:false,reply_seq:900,
 reply:{protocol:'roadmap.consumer.v1',request_seq:seq,kind,status:outcome}}});
