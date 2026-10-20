// Dev-only harness: mounts InboxView on an in-memory tree, no Supabase.
// Run:  VITE_SUPABASE_URL=https://x.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite
// Open: http://localhost:5173/scripts/harness/inbox.html
import { createRoot } from 'react-dom/client'
import { InboxView } from '../../src/features/inbox/InboxView.tsx'
import { useStore } from '../../src/store/useStore.ts'
import type { TaskRow, TaskUpdate } from '../../src/types.ts'
import '../../src/index.css'

const row = (id: string, title: string, parent_id: string | null, kind: 'task' | 'group', tags: string[], position = 0): TaskRow => ({
  id, parent_id, title, done: false, kind, position, expanded: true, tags, streak: 0, streak_day: null,
  created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z',
})
const tree: TaskRow[] = [
  row('lang', 'Languages', null, 'group', ['lang']),
  row('lang-ja', 'Japanese', 'lang', 'group', []),
  row('inbox', 'From OneNote', null, 'group', ['inbox'], 1),
  row('f-ja', 'Japanese', 'inbox', 'group', ['lang']),
  row('f-mech', 'Mechanical & engineering', 'inbox', 'group', ['dx'], 1),
  row('t1', 'Mark Japanese words — one section a day', 'f-ja', 'task', ['home', 'short-burst', 'parked']),
  row('t2', 'Goi practice sheets', 'f-ja', 'task', ['train', 'parked'], 1),
  row('t3', 'Python code for mechanical calculations', 'f-mech', 'task', ['keyboard', 'deep-focus', 'parked']),
  row('t4', 'Sheet metal: get the transcript', 'f-mech', 'task', ['keyboard', 'parked'], 1),
  row('t5', 'Back from last month', 'lang-ja', 'task', ['kept', 'parked', 'stale']),
  row('f-home', 'Home, food & cleaning', 'inbox', 'group', ['food'], 2),
  ...['Wash clothes', 'Cook rice', 'Make curry', 'Clean the fridge', 'Throw the gomi'].map((t, i) =>
    row('h' + i, t, 'f-home', 'task', ['parked'], i)),
]
let n = 0
useStore.setState({
  tree,
  resources: [
    { id: 'r1', task_id: 't2', label: 'N3 goi', url: 'https://1drv.ms/x', kind: 'web', position: 0, created_at: '' },
    { id: 'r2', task_id: 't2', label: 'Link2', url: 'https://youtu.be/abc', kind: 'web', position: 1, created_at: '' },
  ],
  updateTask: async (id: string, patch: TaskUpdate) => {
    useStore.setState({ tree: useStore.getState().tree.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  },
  deleteTask: async (id: string) => {
    useStore.setState({ tree: useStore.getState().tree.filter((t) => t.id !== id) })
  },
  updateTasks: async (patches: { id: string; patch: TaskUpdate }[]) => {
    const m = new Map(patches.map((p) => [p.id, p.patch]))
    ;(window as unknown as { batchCalls: number }).batchCalls = ((window as unknown as { batchCalls?: number }).batchCalls ?? 0) + 1
    useStore.setState({ tree: useStore.getState().tree.map((t) => (m.has(t.id) ? { ...t, ...m.get(t.id) } : t)) })
  },
  deleteTasks: async (ids: string[]) => {
    ;(window as unknown as { batchCalls: number }).batchCalls = ((window as unknown as { batchCalls?: number }).batchCalls ?? 0) + 1
    const gone = new Set(ids)
    useStore.setState({ tree: useStore.getState().tree.filter((t) => !gone.has(t.id)) })
  },
  addFolder: async (parent_id: string | null, title: string, tags: string[] = []) => {
    const id = 'new' + ++n
    useStore.setState({ tree: [...useStore.getState().tree, row(id, title, parent_id, 'group', tags, 99)] })
    return id
  },
})
;(window as unknown as { rmStore: typeof useStore }).rmStore = useStore
createRoot(document.getElementById('root')!).render(
  <div className="rm" data-theme="trailhead" data-role="attackers"><div className="rm-scroll"><main className="rm-pad"><InboxView /></main></div></div>,
)
