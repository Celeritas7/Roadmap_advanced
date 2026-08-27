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
  RoleOverride,
  RoleOverrides,
  TaskInsert,
  TaskRow,
  TaskUpdate,
  UserSettings,
} from '../types.ts'
import { supabase } from '../lib/supabase.ts'
import { seedIfEmpty } from '../seed.ts'
import { subtreeIds } from '../lib/tree.ts'
import { activeRoleIds, isRoleActive, effectiveRoleId, folderProgress, nextAction } from './selectors.ts'
import * as sync from './sync.ts'
import * as resourceSync from './resourceSync.ts'
import { isDaily, dayKey, prevDayKey } from '../lib/dailyReset.ts'
import { readStoredRoadView, storeRoadView, type RoadViewId } from '../features/home/roadViews.ts'

export type ThemeName = 'trailhead' | 'summit' | 'fieldguide'

export type ViewName = 'home' | 'plan'

export type StoreState = {
  // Server-mirrored
  tree: TaskRow[]
  log: LogRow[]
  settings: UserSettings | null
  resources: ResourceRow[]

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

  initialized: boolean
  loading: boolean
  error: string | null

  // Mutations
  init: () => Promise<void>
  toggleTask: (id: string) => Promise<void>
  addTask: (parentId: string | null, title: string, tags?: string[]) => Promise<void>
  updateTask: (id: string, patch: TaskUpdate) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  clearError: () => void
  toggleGroup: (id: string) => Promise<void>
  reorderTask: (taskId: string, newIndex: number) => Promise<void>
  toggleFilter: (family: FilterKind, id: string) => void
  clearFilters: () => void
  addLog: (entry: LogInsert) => Promise<void>
  deleteLog: (id: string) => Promise<void>
  addResource: (taskId: string, label: string, url: string) => Promise<void>
  deleteResource: (id: string) => Promise<void>
  cycleRole: (roleId: string) => Promise<void>
  setLocation: (location: Location) => void
  setHour: (hour: number) => void
  selectRole: (roleId: string) => void
  setTheme: (t: ThemeName) => void
  setRoadView: (v: RoadViewId) => void
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
  filters: { projects: new Set(), contexts: new Set() },
  now: defaultNow(),
  selectedRole: null,
  view: 'home',
  theme: readStoredTheme(),
  roadView: readStoredRoadView(),
  initialized: false,
  loading: true,
  error: null,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })
    try {
      await seedIfEmpty(supabase)
      const [tree, log, settings, resources] = await Promise.all([
        sync.fetchTasks(),
        sync.fetchLogs(),
        sync.fetchSettings(),
        resourceSync.fetchResources(),
      ])
      set({ tree, log, settings, resources, loading: false, error: null })
      void runDailyReset(get, set)
      window.setInterval(() => void runDailyReset(get, set), 60_000)
    } catch (e) {
      set({ initialized: false, loading: false, error: errorMessage(e) })
    }
  },

  toggleTask: async (id) => {
    const prev = get().tree
    const target = prev.find((t) => t.id === id)
    if (!target) return
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
    } catch (e) {
      set({ tree: prev, error: errorMessage(e) })
      throw e
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

  deleteTask: async (id) => {
    const prev = get().tree
    // Mirror the DB's ON DELETE CASCADE: drop the node AND its whole subtree
    // from local state so no stale descendants linger before the next fetch.
    const removing = subtreeIds(prev, id)
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