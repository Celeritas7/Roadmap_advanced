// Staging-only observation of ordinary writes. This is not an authorization gate.
const active=new Map<string,number>(),versions=new Map<string,number>()
let resetGuard:(id:string)=>void=()=>{}
export const setDailyResetGuard=(guard:(id:string)=>void)=>{resetGuard=guard}
export const assertNoPendingReset=(id:string)=>resetGuard(id)
export const taskWriteVersion=(id:string)=>versions.get(id)??0
export const taskWriting=(ids:string[])=>ids.some(id=>(active.get(id)??0)>0)
export async function trackTaskWrite<T>(id:string,write:()=>Promise<T>):Promise<T>{
 active.set(id,(active.get(id)??0)+1);versions.set(id,taskWriteVersion(id)+1)
 try{return await write()}finally{active.set(id,(active.get(id)??1)-1);versions.set(id,taskWriteVersion(id)+1)}
}
