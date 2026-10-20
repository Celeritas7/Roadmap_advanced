// V2-B — FULL REPLACEMENT for src/store/useStore.ts
// Delta vs current: adds client-only `view` ('home'|'plan') + setView.
import { create } from 'zustand'
import type {
  FilterKind,
  FilterState,
  LogInsert,
  LogRow,
  Location,
  NowState,
  ResourceRow,
  SessionRow,
  RoleOverride,
  RoleOverrides,
  TaskInsert,
  TaskRow,
  TaskUpdate,
  UserSettings,
} from '../types.ts'
import { subtreeIds } from '../lib/tree.ts'
import { activeRoleIds, isRoleActive, effectiveRoleId, folderProgress, nextAction } from './selectors.ts'
import * as sync from './sync.ts'
import * as resourceSync from './resourceSync.ts'
import * as sessionSync from './studySessions.ts'
import { isDaily, dayKey, prevDayKey } from '../lib/dailyReset.ts'
import { readStoredRoadView, storeRoadView, type RoadViewId } from '../features/home/roadViews.ts'
import { hubAddrOf, tickMirror } from '../lib/rmHub.ts'
import { markDone } from '../lib/suggester.ts'
import { CAPTURE_ROOT, guessCapture } from '../lib/capture.ts'

export type ThemeName = 'trailhead' | 'summit' | 'fieldguide'

export type ViewName = 'home' | 'plan' | 'inbox'

export type StoreState = {
  // Server-mirrored
  tree: TaskRow[]
  log: LogRow[]
  settings: UserSettings | null
  resources: ResourceRow[]
  // V2-L: the study-session ledger. Server-mirrored, append-mostly. Read by
  // src/lib/sessions.ts to derive streaks and per-stop trust.
  sessions: SessionRow[]

  // Client-only
  filters: FilterState
  now: NowState
  // Ephemeral focus: which single role the journey UI is viewing. null ⇒ the
  // schedule picks the default (see effectiveRoleId). Deliberately NOT in
  // `settings`/persisted — on reload the schedule re-derives it.
  selectedRole: string | null
  // V2-B: which surface is showing. Ephemeral — reload re-lands on Home.
  view: ViewName

  // Device-local UI preference — persisted to localStorage, never synced.
  theme: ThemeName
  // V2-K: which road Home shows ('all'|'quick'|'daily'|'focus'). Persisted.
  roadView: RoadViewId
  homeCategory: string | null   // Home category chip (client-only)

  initialized: boolean
  loading: boolean
  error: string | null

  // V2-Q — Akatsuki hub. pendingDone = mirror ids whose task.done is
  // published but not yet answered by WF (done flips only on the reply).
  // hubRev bumps whenever hub-side data the UI reads changes.
  hubState: 'off' | 'booting' | 'live' | 'error'
  hubError: string | null
  pendingDone: string[]
  hubRev: number

  // Mutations
  init: () => Promise<void>
  toggleTask: (id: string) => Promise<void>
  addTask: (parentId: string | null, title: string, tags?: string[]) => Promise<string>
  // Quick capture: one line → a parked task under Captured › <guessed folder>.
  // Resolves to the new task's id (for Undo), or null for a blank line.
  capture: (line: string) => Promise<{ id: string; folder: string } | null>
  captureOpen: boolean
  setCaptureOpen: (open: boolean) => void
  addFolder: (parentId: string | null, title: string, tags?: string[]) => Promise<string>
  updateTask: (id: string, patch: TaskUpdate) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  // Batch forms for the Inbox: one optimistic state change, one rollback.
  updateTasks: (patches: { id: string; patch: TaskUpdate }[]) => Promise<void>
  deleteTasks: (ids: string[]) => Promise<void>
  clearError: () => void
  toggleGroup: (id: string) => Promise<void>
  reorderTask: (taskId: string, newIndex: number) => Promise<void>
  toggleFilter: (family: FilterKind, id: string) => void
  clearFilters: () => void
  addLog: (entry: LogInsert) => Promise<void>
  deleteLog: (id: string) => Promise<void>
  addResource: (taskId: string, label: string, url: string) => Promise<void>
  refreshSessions: () => Promise<void>
  deleteResource: (id: string) => Promise<void>
  cycleRole: (roleId: string) => Promise<void>
  setLocation: (location: Location) => void
  setHour: (hour: number) => void
  selectRole: (roleId: string) => void
  setTheme: (t: ThemeName) => void
  setRoadView: (v: RoadViewId) => void
  setHomeCategory: (id: string | null) => void
  setView: (view: ViewName) => void
}

function defaultNow(): NowState {
  const d = new Date()
  const day = d.getDay()
  return {
    hour: d.getHours(),
    weekend: day === 0 || day === 6,
    location: 'home',
  }
}

function emptySettings(): UserSettings {
  return {
    role_overrides: {},
    custom_rules: {},
    preferences: {},
    updated_at: new Date().toISOString(),
  }
}

function nextOverride(current: RoleOverride | undefined): RoleOverride {
  if (!current || current === 'auto') return 'on'
  if (current === 'on') return 'off'
  return 'auto'
}

const THEMES: ThemeName[] = ['trailhead', 'summit', 'fieldguide']

function readStoredTheme(): ThemeName {
  try {
    const t = localStorage.getItem('rm-theme')
    if (t && (THEMES as string[]).includes(t)) return t as ThemeName
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return 'trailhead'
}

export const useStore = create<StoreState>((set, get) => ({
  tree: [],
  log: [],
  settings: null,
  resources: [],
  sessions: [],
  filters: { projects: new Set(), contexts: new Set() },
  now: defaultNow(),
  selectedRole: null,
  view: 'home',
  theme: readStoredTheme(),
  roadView: readStoredRoadView(),
  homeCategory: null,
  initialized: false,
  loading: true,
  error: null,
  hubState: 'off',
  hubError: null,
  pendingDone: [],
  hubRev: 0,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })
    try {
      // No auto-seed. seedIfEmpty decided "new user" from an RLS-scoped
      // count, so any moment where the user's own rows were invisible (on
      // 2026-10-03 the real-gate cutover: owner-only policies live, old rows
      // not yet backfilled to this user) wrote a second demo tree and demo
      // logs into a live account. Seed only by an explicit action.
      const [tree, log, settings, resources] = await Promise.all([
        sync.fetchTasks(),
        sync.fetchLogs(),
        sync.fetchSettings(),
        resourceSync.fetchResources(),
      ])
      set({ tree, log, settings, resources, loading: false, error: null })
      // V2-Q: the hub boots from App.tsx once loading=false (rmHub.bootHub).

      void runDailyReset(get, set)
      window.setInterval(() => void runDailyReset(get, set), 60_000)
      // The whole point of the ledger: you launch, study elsewhere, come
      // back. Re-fetching on tab-return is what makes the study app's
      // completion appear. Cheap (one indexed query) and needs no realtime
      // replication enabled on the table.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void get().refreshSessions()
      })
      window.addEventListener('focus', () => void get().refreshSessions())
    } catch (e) {
      set({ initialized: false, loading: false, error: errorMessage(e) })
    }
  },

  toggleTask: async (id) => {
    const prev = get().tree
    const target = prev.find((t) => t.id === id)
    if (!target) return
    // V2-Q: a WF mirror. WF owns done — publish task.done and leave the box
    // alone until WF replies applied|already (rmHub flips it then).
    if (hubAddrOf(id)) {
      if (target.done) {
        set({ error: 'Weekly Focus owns this task — un-tick it in Weekly Focus.' })
        return
      }
      try {
        await tickMirror(id)
      } catch (e) {
        set({ error: errorMessage(e) })
      }
      return
    }
    const done = !target.done
    const patch: TaskUpdate = { done }
    if (isDaily(target)) {
      const today = dayKey()
      if (done && target.streak_day !== today) {
        patch.streak = target.streak_day === prevDayKey(today) ? target.streak + 1 : 1
        patch.streak_day = today
      } else if (!done && target.streak_day === today) {
        patch.streak = Math.max(0, target.streak - 1)
        patch.streak_day = patch.streak > 0 ? prevDayKey(today) : null
      }
    }
    set({ tree: prev.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
    try {
      const row = await sync.updateTask(id, patch)
      set({ tree: get().tree.map((t) => (t.id === id ? row : t)) })
      if (done) void markDone(id, null)   // closes a live suggestion for this task, if any
      // Ticking the box by hand is a real completion — it just isn't a
      // PROVEN one, so it lands as verification='manual'. If a study app
      // already reported this stop today, the RPC would overwrite that
      // proof with 'manual', so skip the write when today's row is already
      // verified.
      if (isDaily(target)) {
        const today = dayKey()
        const existing = get().sessions.find(
          (s) => s.task_id === id && s.day_key === today,
        )
        const alreadyProven = !!existing?.completed_at && existing.verification !== 'manual'
        if (done && !alreadyProven) {
          await sessionSync.completeSessionManually(id)
        } else if (!done && !alreadyProven) {
          await sessionSync.uncompleteSessionToday(id)
        }
        void get().refreshSessions()
      }
    } catch (e) {
      set({ tree: prev, error: errorMessage(e) })
      throw e
    }
  },

  refreshSessions: async () => {
    try {
      set({ sessions: await sessionSync.fetchSessions() })
    } catch {
      /* stale ledger is survivable — the next tab-return retries */
    }
  },

  addTask: async (parentId, title, tags = []) => {
    const prev = get().tree
    const siblings = prev.filter((t) => t.parent_id === parentId)
    const input: TaskInsert = {
      parent_id: parentId,
      title,
      kind: 'task',
      position: siblings.length,
      tags,
    }
    try {
      const row = await sync.insertTask(input)
      set({ tree: [...get().tree, row] })
      return row.id
    } catch (e) {
      set({ error: errorMessage(e) })
      throw e
    }
  },

  captureOpen: false,
  setCaptureOpen: (open) => set({ captureOpen: open }),

  // Captures run one at a time, so two quick Enters can't both create the
  // Captured root or the same sub-folder.
  capture: (line) => {
    const run = captureChain.then(() => doCapture(line))
    captureChain = run.catch(() => undefined)
    return run
  },


  addFolder: async (parentId, title, tags = []) => {
    const siblings = get().tree.filter((t) => t.parent_id === parentId)
    try {
      const row = await sync.insertTask({ parent_id: parentId, title, kind: 'group', position: siblings.length, expanded: true, tags })
      set({ tree: [...get().tree, row] })
      return row.id
    } catch (e) {
      set({ error: errorMessage(e) })
      throw e
    }
  },

  updateTask: async (id, patch) => {
    const prev = get().tree
    set({ tree: prev.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
    try {
      const row = await sync.updateTask(id, patch)
      set({ tree: get().tree.map((t) => (t.id === id ? row : t)) })
    } catch (e) {
      set({ tree: prev, error: errorMessage(e) })
      throw e
    }
  },

  updateTasks: async (patches) => {
    if (!patches.length) return
    const prev = get().tree
    const byId = new Map(patches.map((p) => [p.id, p.patch]))
    set({ tree: prev.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t)) })
    try {
      // Patches differ per row (each task's own tag list), so one request each,
      // in parallel. Any failure rolls the whole batch back.
      const rows = await Promise.all(patches.map((p) => sync.updateTask(p.id, p.patch)))
      const fresh = new Map(rows.map((r) => [r.id, r]))
      set({ tree: get().tree.map((t) => fresh.get(t.id) ?? t) })
    } catch (e) {
      // Some rows may already be saved: re-read the truth rather than guess.
      try { set({ tree: await sync.fetchTasks(), error: errorMessage(e) }) }
      catch { set({ tree: prev, error: errorMessage(e) }) }
      throw e
    }
  },

  deleteTasks: async (ids) => {
    if (!ids.length) return
    const prev = get().tree
    const removing = new Set<string>()
    for (const id of ids) for (const rid of subtreeIds(prev, id)) removing.add(rid)
    if ([...removing].some((rid) => hubAddrOf(rid))) {
      set({ error: 'That holds Weekly Focus tasks — delete them in Weekly Focus.' })
      return
    }
    set({ tree: prev.filter((t) => !removing.has(t.id)), error: null })
    try {
      await sync.deleteTasks(ids)
    } catch (e) {
      set({ tree: prev, error: errorMessage(e) })
      throw e
    }
  },

  deleteTask: async (id) => {
    const prev = get().tree
    // Mirror the DB's ON DELETE CASCADE: drop the node AND its whole subtree
    // from local state so no stale descendants linger before the next fetch.
    const removing = subtreeIds(prev, id)
    // V2-Q: deletion is orphaning — a WF mirror (or a folder holding one)
    // is never deleted from Roadmap. Delete it in Weekly Focus.
    if ([...removing].some((rid) => hubAddrOf(rid))) {
      set({ error: 'That holds Weekly Focus tasks — delete them in Weekly Focus.' })
      return
    }
    set({ tree: prev.filter((t) => !removing.has(t.id)), error: null })
    try {
      await sync.deleteTask(id)
    } catch (e) {
      // Roll the whole subtree back, not just the root row.
      set({ tree: prev, error: errorMessage(e) })
      throw e
    }
  },

  clearError: () => set({ error: null }),

  setTheme: (t) => {
    set({ theme: t })
    try { localStorage.setItem('rm-theme', t) } catch { /* ignore persist failure */ }
  },

  setView: (view) => set({ view }),

  setHomeCategory: (id) => set({ homeCategory: id }),
  setRoadView: (v) => {
    set({ roadView: v })
    storeRoadView(v)
  },

  toggleGroup: async (id) => {
    const target = get().tree.find((t) => t.id === id)
    if (!target || target.kind !== 'group') return
    await get().updateTask(id, { expanded: !target.expanded })
  },

  reorderTask: async (taskId, newIndex) => {
    const prev = get().tree
    const target = prev.find((t) => t.id === taskId)
    if (!target) return
    // Siblings under the same parent, in current order.
    const siblings = prev
      .filter((t) => t.parent_id === target.parent_id)
      .sort((a, b) => a.position - b.position)
    const from = siblings.findIndex((t) => t.id === taskId)
    const to = Math.max(0, Math.min(newIndex, siblings.length - 1))
    if (from === -1 || from === to) return
    // Move the target, then renumber the whole sibling list to contiguous ints.
    const [moved] = siblings.splice(from, 1)
    siblings.splice(to, 0, moved)
    const positions = siblings.map((t, i) => ({ id: t.id, position: i }))
    const posById = new Map(positions.map((p) => [p.id, p.position]))
    set({
      tree: prev.map((t) =>
        posById.has(t.id) ? { ...t, position: posById.get(t.id)! } : t,
      ),
    })
    try {
      await sync.reorderTasks(positions)
    } catch (e) {
      set({ tree: prev, error: errorMessage(e) })
      throw e
    }
  },

  toggleFilter: (family, id) => {
    const filters = get().filters
    const current = family === 'project' ? filters.projects : filters.contexts
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({
      filters:
        family === 'project'
          ? { ...filters, projects: next }
          : { ...filters, contexts: next },
    })
  },

  clearFilters: () => {
    set({ filters: { projects: new Set(), contexts: new Set() } })
  },

  // Insert mirrors addTask: await the server row (with its DB-generated id /
  // created_at) then prepend it. There's no optimistic temp row, so failure
  // just surfaces the banner — nothing to roll back.
  addLog: async (entry) => {
    try {
      const row = await sync.insertLog(entry)
      set({ log: [row, ...get().log] })
    } catch (e) {
      set({ error: errorMessage(e) })
      throw e
    }
  },

  // Delete mirrors deleteTask: optimistic removal, full rollback on failure.
  deleteLog: async (id) => {
    const prev = get().log
    set({ log: prev.filter((l) => l.id !== id), error: null })
    try {
      await sync.deleteLog(id)
    } catch (e) {
      set({ log: prev, error: errorMessage(e) })
      throw e
    }
  },

  addResource: async (taskId, label, url) => {
    const kind = /^https?:/i.test(url) ? 'web' as const : 'app' as const
    const position = get().resources.filter((r) => r.task_id === taskId).length
    try {
      const row = await resourceSync.insertResource({ task_id: taskId, label, url, kind, position })
      set({ resources: [...get().resources, row] })
    } catch (e) {
      set({ error: errorMessage(e) })
      throw e
    }
  },

  deleteResource: async (id) => {
    const prev = get().resources
    set({ resources: prev.filter((r) => r.id !== id), error: null })
    try {
      await resourceSync.deleteResource(id)
    } catch (e) {
      set({ resources: prev, error: errorMessage(e) })
      throw e
    }
  },


  cycleRole: async (roleId) => {
    const prev = get().settings ?? emptySettings()
    const overrides: RoleOverrides = { ...prev.role_overrides }
    overrides[roleId] = nextOverride(overrides[roleId])
    const optimistic: UserSettings = { ...prev, role_overrides: overrides }
    set({ settings: optimistic })
    try {
      const row = await sync.upsertSettings({ role_overrides: overrides })
      set({ settings: row })
    } catch (e) {
      set({ settings: prev, error: errorMessage(e) })
      throw e
    }
  },

  setLocation: (location) => {
    set({ now: { ...get().now, location } })
  },

  setHour: (hour) => {
    set({ now: { ...get().now, hour } })
  },

  // Pin the journey focus to one role. Toggles: clicking the already-pinned
  // role un-pins it (selectedRole → null), handing focus back to the schedule
  // default (see effectiveRoleId). Ephemeral — never written to settings.
  selectRole: (roleId) => {
    set({ selectedRole: get().selectedRole === roleId ? null : roleId })
  },
}))

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return typeof e === 'string' ? e : JSON.stringify(e)
}

// Expose the store on `window.__roadmapStore` in dev so Playwright (and the
// DevTools console) can drive state without going through the UI. The role
// selectors are exposed too (`__roadmapSelectors`) so a verify harness can log
// the schedule's active-role set directly — proving the schedule/override path
// (activeRoleIds / isRoleActive) still computes even though the hybrid UI only
// drives single-role selection.
if (import.meta.env.DEV) {
  const g = globalThis as unknown as {
    __roadmapStore: typeof useStore
    __roadmapSelectors: { activeRoleIds: typeof activeRoleIds; isRoleActive: typeof isRoleActive; effectiveRoleId: typeof effectiveRoleId; folderProgress: typeof folderProgress; nextAction: typeof nextAction }
  }
  g.__roadmapStore = useStore
  g.__roadmapSelectors = { activeRoleIds, isRoleActive, effectiveRoleId, folderProgress, nextAction }
}

// V2-J: at/after 4 AM, uncheck @daily-routine tasks completed on a previous
// logical day. Streaks were counted at check time — reset only clears the
// checkmark. Idempotent; retried every minute while a tab is open.
async function runDailyReset(
  get: () => StoreState,
  set: (p: Partial<StoreState>) => void,
): Promise<void> {
  const today = dayKey()
  const stale = get().tree.filter(
    (t) => isDaily(t) && t.done && dayKey(new Date(t.updated_at)) !== today,
  )
  if (!stale.length) return
  const ids = new Set(stale.map((t) => t.id))
  set({ tree: get().tree.map((t) => (ids.has(t.id) ? { ...t, done: false } : t)) })
  try {
    await Promise.all(stale.map((t) => sync.updateTask(t.id, { done: false })))
  } catch {
    /* optimistic state already unchecked; the next minute tick retries */
  }
}

// Quick-capture worker (see StoreState.capture); kept outside the store
// object so capture() can chain calls through captureChain.
let captureChain: Promise<unknown> = Promise.resolve()
async function doCapture(line: string): Promise<{ id: string; folder: string } | null> {
  const get = useStore.getState
  const g = guessCapture(line)
  if (!g) return null
  const groupOf = (parent: string | null, title: string) =>
    get().tree.find((t) => t.kind === 'group' && t.parent_id === parent && t.title === title)?.id
  // The root carries the `inbox` tag so the Inbox treats it as its own.
  const root = groupOf(null, CAPTURE_ROOT) ?? await get().addFolder(null, CAPTURE_ROOT, ['inbox'])
  const folder = groupOf(root, g.folder) ?? await get().addFolder(root, g.folder, g.folderTags)
  const id = await get().addTask(folder, g.title, [...g.tags, 'parked'])
  return { id, folder: g.folder }
}
