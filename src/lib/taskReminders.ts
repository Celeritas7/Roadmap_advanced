import { supabase } from './supabase.ts'
import { hubAddrOf, MIRROR_TAG } from './rmHub.ts'
import type { TaskRow, WfAddr } from '../types.ts'

type Seed = { sourceTaskId: string; title: string; type: string; category: string; url: string; body: string }
type Panel = { mount(): Panel; openTask(seed: Seed): Promise<void>; unmount(): void; close(): void }
type Overlay = { start(): unknown; stop(): void }
type ReminderWindow = Window & {
  AkatsukiBroadcastPanel?: (client: typeof supabase, options: { app: string; hideLauncher: boolean }) => Panel
  AkatsukiBroadcast?: (client: typeof supabase, app: string) => Overlay
}
const panels = new Map<string, Panel>()
let overlay: Overlay | null = null
let authWatching = false
function watchAuth() {
  if(authWatching)return
  authWatching=true
  supabase.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_IN')startTaskBroadcasts()
    if(event==='SIGNED_OUT') { for(const panel of panels.values())panel.unmount();panels.clear();overlay?.stop();overlay=null }
  })
}

// Mirror addresses use exactly the same tuple as Weekly Focus; titles never identify tasks.
export function reminderOrigin(task: TaskRow, address: WfAddr | null) {
  if(task.tags.includes(MIRROR_TAG)) {
    if(!address?.board_id || !address.item_key || !address.sub_id)throw new Error('Weekly Focus link is not ready. Reconnect before scheduling this reminder.')
    if(task.tags.some(t=>['orphaned','wf-orphan','parked'].includes(t)))throw new Error('This Weekly Focus task is unavailable. Check the original task first.')
    return {app:'wf',id:JSON.stringify([address.board_id,address.item_key,address.sub_id]),url:'https://celeritas7.github.io/Weekly_focus/'}
  }
  return {app:'rm',id:'task:'+task.id,url:location.origin+location.pathname}
}
export async function openTaskReminder(task: TaskRow) {
  const w=window as ReminderWindow
  if(!w.AkatsukiBroadcastPanel)throw new Error('Reminder editor did not load. Reopen online.')
  const {data,error}=await supabase.auth.getSession()
  if(error)throw error
  if(!data.session)throw new Error('Sign in before setting a reminder.')
  const origin=reminderOrigin(task,hubAddrOf(task.id))
  watchAuth()
  let panel=panels.get(origin.app)
  if(!panel){panel=w.AkatsukiBroadcastPanel(supabase,{app:origin.app,hideLauncher:true}).mount();panels.set(origin.app,panel)}
  for(const other of panels.values())if(other!==panel)other.close()
  await panel.openTask({sourceTaskId:origin.id,title:task.title.slice(0,120),type:'do',category:'general',url:origin.url,body:'Reminder status is separate from the task checkbox in its original app.'})
}
export function startTaskBroadcasts() {
  const w=window as ReminderWindow
  watchAuth()
  if(!overlay&&w.AkatsukiBroadcast){overlay=w.AkatsukiBroadcast(supabase,'rm');overlay.start()}
}
