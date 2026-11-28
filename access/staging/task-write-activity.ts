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
export const ordinaryTasksBusy=()=>mirroring>0||structuring>0||creating>0||legacyActive>0||[...active.values()].some(n=>n>0)
// Remaining legacy writes (including non-daily completion) can roll back the
// tree. Keep acknowledged writes out of their full recovery lifetime.
export async function runLegacyTaskMutation<T>(write:()=>Promise<T>):Promise<T>{
 if(mirroring)throw Error('Wait for the current mirror delivery.')
 structureGuard();creationGuard();editGuard();legacyActive++
 try{return await write()}finally{legacyActive--}
}

let creationGuard:()=>void=()=>{},creating=0
export const setTaskCreationGuard=(guard:()=>void)=>{creationGuard=guard}
export async function runTaskCreation<T>(write:()=>Promise<T>):Promise<T>{
 if(ordinaryTasksBusy())throw Error('Wait for the current task change.')
 creating++
 try{return await write()}finally{creating--}
}

let structureGuard:()=>void=()=>{},structuring=0,structureRevision=0
export const setStructureGuard=(guard:()=>void)=>{structureGuard=guard}
export const assertNoPendingStructure=()=>structureGuard()
export const assertNoPendingTaskCreation=()=>creationGuard()
export async function runStructureMutation<T>(write:()=>Promise<T>):Promise<T>{
 if(ordinaryTasksBusy())throw Error('Wait for the current task change.')
 structuring++;structureRevision++
 try{return await write()}finally{structuring--;structureRevision++}
}

export const structureWriteVersion=()=>structureRevision

let mirroring=0
export async function runMirrorMutation<T>(write:()=>Promise<T>):Promise<T>{
 if(ordinaryTasksBusy())throw Error('Wait for the current task change.')
 mirroring++
 try{return await write()}finally{mirroring--}
}

let studyRevision=0
export const studyReportVersion=()=>studyRevision
export async function runStudyReportMutation<T>(write:()=>Promise<T>):Promise<T>{
 return runMirrorMutation(async()=>{studyRevision++;try{return await write()}finally{studyRevision++}})
}
