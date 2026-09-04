// V2-L — NEW FILE src/store/studySessions.ts
// Server I/O for roadmap_study_sessions. Mirrors sync.ts / resourceSync.ts:
// thin async functions, throw on error, no state.
import { supabase } from '../lib/supabase.ts'
import { dayKey } from '../lib/dailyReset.ts'
import type { SessionRow } from '../types.ts'

const SESSION_COLUMNS =
  'id, task_id, day_key, source, started_at, completed_at, duration_min, feedback, verification, created_at'

// Bounded window: 120 logical days is far more than any streak display needs
// and keeps the payload small as the ledger grows.
export async function fetchSessions(limit = 400): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from('roadmap_study_sessions')
    .select(SESSION_COLUMNS)
    .order('day_key', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as SessionRow[]
}

// Called when you press launch. Opens today's row (or leaves an existing
// started_at alone) so the study app has something to complete.
export async function startSession(taskId: string): Promise<void> {
  const { error } = await supabase.rpc('roadmap_start_session', {
    p_task_id: taskId,
    p_day_key: dayKey(),
    p_source: 'roadmap',
  })
  if (error) throw error
}

// Roadmap's own completion path — ticking the checkbox by hand. Same RPC the
// study apps call, but stamped verification='manual' so the ledger stays
// honest about which days are proven.
export async function completeSessionManually(
  taskId: string,
  durationMin: number | null = null,
): Promise<void> {
  const { error } = await supabase.rpc('roadmap_complete_session', {
    p_task_id: taskId,
    p_source: 'roadmap',
    p_day_key: dayKey(),
    p_duration: durationMin,
    p_feedback: {},
    p_verification: 'manual',
  })
  if (error) throw error
}

// Unticking a stop today retracts the completion (keeps the row + started_at
// so the launch is still on record).
export async function uncompleteSessionToday(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('roadmap_study_sessions')
    .update({ completed_at: null, verification: 'manual' })
    .eq('task_id', taskId)
    .eq('day_key', dayKey())
  if (error) throw error
}
