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

let editGuard:(ids?:string[])=>void=()=>{},legacyActive=0
export const setTaskEditGuard=(guard:(ids?:string[])=>void)=>{editGuard=guard}
export const assertNoPendingTaskEdit=(ids?:string[])=>editGuard(ids)
export function taskEditPending(id:string){try{editGuard([id]);return false}catch{return true}}
export const ordinaryTasksBusy=()=>creating>0||legacyActive>0||[...active.values()].some(n=>n>0)
// Existing structural paths still use whole-tree rollback. Keep metadata writes
// out of their lifetime, including error recovery reads, until that later work.
export async function runLegacyTaskMutation<T>(write:()=>Promise<T>):Promise<T>{
 creationGuard();editGuard();legacyActive++
 try{return await write()}finally{legacyActive--}
}

let creationGuard:()=>void=()=>{},creating=0
export const setTaskCreationGuard=(guard:()=>void)=>{creationGuard=guard}
export async function runTaskCreation<T>(write:()=>Promise<T>):Promise<T>{
 if(ordinaryTasksBusy())throw Error('Wait for the current task change.')
 creating++
 try{return await write()}finally{creating--}
}
