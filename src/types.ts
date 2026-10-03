// All types match the DB schema for the `roadmap_*` tables, with one
// exception: user_id is DB-internal — single-user mode means the DB
// supplies it via default, and the app never reads or writes it.

// ─── DB rows: roadmap_tasks ───────────────────────────────────────────

export type TaskKind = 'task' | 'group'

export type TaskRow = {
  id: string
  parent_id: string | null
  title: string
  done: boolean
  kind: TaskKind
  position: number
  expanded: boolean
  tags: string[]
  streak: number
  streak_day: string | null
  created_at: string
  updated_at: string
}

export type TaskInsert = {
  parent_id?: string | null
  title: string
  kind: TaskKind
  done?: boolean
  position?: number
  expanded?: boolean
  tags?: string[]
}

export type TaskUpdate = Partial<Omit<TaskInsert, 'kind'>> & {
    streak?: number
    streak_day?: string | null
  }

// ─── DB rows: roadmap_daily_logs ──────────────────────────────────────

export type LogRow = {
  id: string
  task_id: string | null
  log_date: string
  context: string | null
  duration_minutes: number | null
  notes: string | null
  created_at: string
}

export type LogInsert = {
  task_id?: string | null
  log_date?: string
  context?: string | null
  duration_minutes?: number | null
  notes?: string | null
}

export type ResourceKind = 'web' | 'app'

export type ResourceRow = {
  id: string
  task_id: string
  label: string
  url: string
  kind: ResourceKind
  position: number
  created_at: string
}

export type ResourceInsert = {
  task_id: string
  label: string
  url: string
  kind?: ResourceKind
  position?: number
}

// ─── DB rows: roadmap_user_settings ───────────────────────────────────

export type RoleOverride = 'auto' | 'on' | 'off'
export type RoleOverrides = Record<string, RoleOverride>

export type RoleRule = {
  defaultStart?: number
  defaultEnd?: number
  weekendActive?: boolean
  locations?: string[]
}
export type CustomRules = Record<string, RoleRule>

export type Density = 'compact' | 'cozy' | 'comfy'
export type Location = 'any' | 'home' | 'office' | 'train'

export type Preferences = {
  density?: Density
  accent?: string
  location?: Location
  weekendMode?: 'auto' | 'on' | 'off'
}

export type UserSettings = {
  role_overrides: RoleOverrides
  custom_rules: CustomRules
  preferences: Preferences
  updated_at: string
}

// ─── In-code constants (mirrored in seed.ts; never persisted to DB) ───

export type Role = {
  id: string
  label: string
  subtitle: string
  // Journey-UI display constants (never persisted): `badge` is the mono
  // FWD/MID/DEF tag on the role chip; `mood` is the header tagline.
  badge: string
  mood: string
  hue: number
  defaultStart: number
  defaultEnd: number
  weekendActive: boolean
  locations: string[]
  // Scope add (folded into M1): when weekend === true and these are set,
  // they override the default start/end window.
  weekendStart?: number
  weekendEnd?: number
}

export type Project = {
  id: string
  label: string
  short: string
  hue: number
  role: string
}

export type ContextFamily = 'where' | 'mode' | 'priority'

export type Context = {
  id: string
  label: string
  family: ContextFamily
}

// ─── App-only state shapes ────────────────────────────────────────────

export type FilterKind = 'project' | 'context'

export type FilterState = {
  projects: Set<string>
  contexts: Set<string>
}

export type NowState = {
  hour: number
  weekend: boolean
  location: Location
}

// ─── DB rows: roadmap_study_sessions ──────────────────────────────────
// One row per (task, logical day). Written from two sides: Roadmap opens it
// with started_at on launch, a study app closes it with completed_at.

export type Verification = 'app' | 'api' | 'manual'

export type SessionRow = {
  id: string
  task_id: string | null
  day_key: string
  source: string
  started_at: string | null
  completed_at: string | null
  duration_min: number | null
  feedback: Record<string, unknown>
  verification: Verification
  created_at: string
}

// V2-Q — APPEND to the END of src/types.ts
// ─── Akatsuki hub (R022) ──────────────────────────────────────────────
// The hub scripts are classic <script>s from public/akatsuki/. These are
// their shapes as Roadmap uses them. No hub enum is copied here — statuses,
// actions, places, types and efforts all come from akatsuki_vocab.

export type WfAddr = { board_id: string; item_key: string; sub_id: string }

export type HubPublishResult = {
  seq?: number
  status: 'pending' | 'skipped' | 'closed' | 'queued'
  code?: string
  reply?: unknown
}

export type HubReplyRow = {
  seq: number
  reply_seq: number
  kind: string
  src_addr: WfAddr
  payload: Record<string, unknown> | null
  reply: { status?: string; [k: string]: unknown } | null
}

export type HubTagRow = {
  addr_key?: string
  addr?: WfAddr
  board_id?: string
  item_key?: string
  sub_id?: string
  ctx?: string[] | null
  urg?: boolean | null
  dl?: string | null
  type?: string | null
  effort?: string | null
  level?: string | null
  guessed?: boolean | null
  [k: string]: unknown
}

export type HubVocab = {
  enum: Record<string, string[]>
  context: Array<{ id: string; label?: string; ord?: number; family?: string; alias_of?: string; [k: string]: unknown }>

}

export type HubSuggestion = {
  id: string
  task: WfAddr
  title: string
  level?: string | null
  say?: string
  tone_step?: number
  until: string
  made_at?: string
}

export type Energy = 'low' | 'mid' | 'high'
export type Device = 'phone' | 'laptop' | 'either'

export type SuggestCtx = {
  hour: number
  weekend: boolean
  energy: Energy
  mood: string
  device: Device
  place: string
  activeRole: string | null
}

export type SuggestTask = {
  addr: WfAddr
  rmId: string
  title: string
  done: boolean
  parked: boolean
  deleted: boolean
  ctx: string[]
  urg?: boolean | null
  dl?: string | null
  type?: string | null
  effort?: string | null
  level?: string | null
}

export type HubTagValue = { type?: string | null; effort?: string | null; level?: string | null; guessed?: boolean }

export type RmHubInstance = {
  hub: {
    publish(p: { to: string; kind: string; addr: WfAddr; payload: Record<string, unknown>; key?: string }): Promise<HubPublishResult>
    orphan(a: WfAddr): Promise<unknown>
  }
  loadVocab(): Promise<HubVocab>
  vocab(): HubVocab | null
  enums(id: string): string[]
  links(): Promise<Array<{ wf: WfAddr; rmId: string | null; orphaned: boolean }>>
  tags(): Promise<HubTagRow[]>
  tag(addr: WfAddr, t: HubTagValue): Promise<boolean>
  suggest(s: { id: string; task: WfAddr; title: string; level?: string | null; say: string; toneStep: number; until: string }): Promise<boolean>
  clearSuggestion(): Promise<void>
  done(addr: WfAddr, suggestionId?: string | null): Promise<HubPublishResult>
  skip(addr: WfAddr, reason: string, suggestionId: string): Promise<HubPublishResult>
  wfReplies(since?: number): Promise<HubReplyRow[]>
  start(ms?: number): () => void
  stop(): void
}

export type RmHubCallbacks = {
  onTask: (addr: WfAddr, payload: Record<string, unknown>, seq: number) => Promise<string | null>
  onAnswer: (payload: Record<string, unknown>, fromApp: string, seq: number) => Promise<void>
  onSession: (payload: Record<string, unknown>, seq: number) => Promise<void>
  log?: (...a: unknown[]) => void
}

export type RmHubFactory = ((supabase: unknown, opts: RmHubCallbacks) => RmHubInstance) & {
  guess(t: { title?: string; ctx?: string[] }): { type: string; effort: string; guessed: boolean }
  score(t: SuggestTask, ctx: SuggestCtx): number
  pick(ts: SuggestTask[], ctx: SuggestCtx): SuggestTask | null
  say(title: string, step: number, energy: Energy, hour?: number): string
  nextTone(step: number, o: { missed: boolean; done: boolean; energy: Energy }): number
  nextToneAt(step: number, o: { missed: boolean; done: boolean; energy: Energy }, hour: number): number
  isNight(hour: number): boolean
  isMiss(a: { action?: string; reason?: string } | null): boolean
  LEVEL_OF_ROLE: Record<string, string>
  addrKey(a: WfAddr): string
  dayKey(d?: Date): string
}

export type AkBanner = {
  start(ms?: number): () => void
  stop(): void
  refresh(): Promise<void>
  current(): HubSuggestion | null
}

declare global {
  interface Window {
    RmHub: RmHubFactory
    AkatsukiBanner: (
      supabase: unknown,
      app: string,
      opts?: {
        log?: (...a: unknown[]) => void
        roadmapUrl?: string
        bottom?: number
        reserve?: boolean
        mount?: HTMLElement
        onAnswer?: (payload: Record<string, unknown>, fromApp: string) => Promise<void> | void
      },
    ) => AkBanner
    rm?: { supabase: unknown; hub: RmHubInstance; banner: AkBanner; build: string }
  }
  const __BUILD_ID__: string
}