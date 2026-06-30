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

export type TaskUpdate = Partial<Omit<TaskInsert, 'kind'>>

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
