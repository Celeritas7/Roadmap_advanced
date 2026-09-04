// V2-L — NEW FILE src/lib/sessions.ts
// Pure helpers over the study-session ledger. Streaks are DERIVED here, not
// stored — a lost write is fixed by correcting a row, never by patching a
// counter that has already drifted.
import type { SessionRow } from '../types.ts'
import { dayKey, prevDayKey } from './dailyReset.ts'

// Only completed sessions count. An open row (launched, never finished) is
// deliberately NOT a streak day — that's the whole point of the ledger.
export const isComplete = (s: SessionRow): boolean => !!s.completed_at

export function sessionsByTask(sessions: SessionRow[]): Map<string, SessionRow[]> {
  const m = new Map<string, SessionRow[]>()
  for (const s of sessions) {
    if (!s.task_id) continue
    const list = m.get(s.task_id)
    if (list) list.push(s)
    else m.set(s.task_id, [s])
  }
  return m
}

// Consecutive completed logical days ending today or yesterday. Anything
// older is a broken streak and reads 0 (mirrors the old liveStreak rule).
export function derivedStreak(sessions: SessionRow[]): number {
  const days = new Set(sessions.filter(isComplete).map((s) => s.day_key))
  if (!days.size) return 0
  const today = dayKey()
  let cursor = days.has(today) ? today : prevDayKey(today)
  if (!days.has(cursor)) return 0
  let n = 0
  while (days.has(cursor)) {
    n += 1
    cursor = prevDayKey(cursor)
  }
  return n
}

export function todaysSession(sessions: SessionRow[]): SessionRow | null {
  const today = dayKey()
  return sessions.find((s) => s.day_key === today) ?? null
}

export type StopTrust = 'none' | 'open' | 'verified' | 'self'

// What the stop should advertise about TODAY:
//   none     — nothing happened yet
//   open     — launched, not finished (a nudge, not a failure)
//   verified — a study app reported completion
//   self     — you ticked the box yourself
export function trustToday(sessions: SessionRow[]): StopTrust {
  const s = todaysSession(sessions)
  if (!s) return 'none'
  if (!s.completed_at) return 'open'
  return s.verification === 'manual' ? 'self' : 'verified'
}

// How much of a streak is actually proven. Shown on hover so a mixed streak
// can't quietly present itself as fully verified.
export function verifiedShare(sessions: SessionRow[]): { verified: number; total: number } {
  const done = sessions.filter(isComplete)
  return {
    verified: done.filter((s) => s.verification !== 'manual').length,
    total: done.length,
  }
}

// Minutes logged this logical day across every stop — feeds the header stat.
export function minutesToday(sessions: SessionRow[]): number {
  const today = dayKey()
  return sessions
    .filter((s) => s.day_key === today && isComplete(s))
    .reduce((sum, s) => sum + (s.duration_min ?? 0), 0)
}
