import { supabase } from '../lib/supabase.ts'
import type {
  LogInsert,
  LogRow,
  TaskInsert,
  TaskRow,
  TaskUpdate,
  UserSettings,
} from '../types.ts'

const TASK_COLUMNS =
  'id, parent_id, title, done, kind, position, expanded, tags, created_at, updated_at'
const LOG_COLUMNS = 'id, task_id, log_date, context, duration_minutes, notes, created_at'
const SETTINGS_COLUMNS = 'role_overrides, custom_rules, preferences, updated_at'

// ─── tasks ────────────────────────────────────────────────────────────

export async function fetchTasks(): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from('roadmap_tasks')
    .select(TASK_COLUMNS)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as TaskRow[]
}

export async function insertTask(input: TaskInsert): Promise<TaskRow> {
  const { data, error } = await supabase
    .from('roadmap_tasks')
    .insert(input)
    .select(TASK_COLUMNS)
    .single()
  if (error) throw error
  return data as TaskRow
}

export async function updateTask(id: string, patch: TaskUpdate): Promise<TaskRow> {
  const { data, error } = await supabase
    .from('roadmap_tasks')
    .update(patch)
    .eq('id', id)
    .select(TASK_COLUMNS)
    .single()
  if (error) throw error
  return data as TaskRow
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('roadmap_tasks').delete().eq('id', id)
  if (error) throw error
}

// Position-only update, one UPDATE per affected sibling. We deliberately do
// NOT use upsert here: PostgREST upsert is INSERT ... ON CONFLICT, and a
// partial payload makes Postgres construct an insert row with a NULL `title`,
// which trips the NOT NULL constraint (SQLSTATE 23502) before the conflict
// resolves to an UPDATE. A plain UPDATE touches only `position` and sidesteps
// that. Sibling lists are small (single-user), so the request fan-out is fine.
export async function reorderTasks(
  positions: { id: string; position: number }[],
): Promise<void> {
  if (positions.length === 0) return
  const results = await Promise.all(
    positions.map(({ id, position }) =>
      supabase.from('roadmap_tasks').update({ position }).eq('id', id),
    ),
  )
  for (const { error } of results) {
    if (error) throw error
  }
}

// ─── logs ─────────────────────────────────────────────────────────────

export async function fetchLogs(): Promise<LogRow[]> {
  const { data, error } = await supabase
    .from('roadmap_daily_logs')
    .select(LOG_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as LogRow[]
}

export async function insertLog(input: LogInsert): Promise<LogRow> {
  const { data, error } = await supabase
    .from('roadmap_daily_logs')
    .insert(input)
    .select(LOG_COLUMNS)
    .single()
  if (error) throw error
  return data as LogRow
}

export async function deleteLog(id: string): Promise<void> {
  const { error } = await supabase.from('roadmap_daily_logs').delete().eq('id', id)
  if (error) throw error
}

// ─── settings ─────────────────────────────────────────────────────────
// Single-user mode: the DB defaults `user_id`, so there's at most one row.

export async function fetchSettings(): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('roadmap_user_settings')
    .select(SETTINGS_COLUMNS)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as UserSettings | null) ?? null
}

export async function upsertSettings(
  patch: Partial<Omit<UserSettings, 'updated_at'>>,
): Promise<UserSettings> {
  // The DB-default user_id is fixed in single-user mode, so upsert on the
  // user_id PK resolves to update when a row exists, insert when it doesn't.
  const { data, error } = await supabase
    .from('roadmap_user_settings')
    .upsert(patch, { onConflict: 'user_id' })
    .select(SETTINGS_COLUMNS)
    .single()
  if (error) throw error
  return data as UserSettings
}
