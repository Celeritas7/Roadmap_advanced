// V2-J — NEW FILE src/lib/dailyReset.ts
// The "logical day" flips at RESET_HOUR (4 AM), so a 1 AM session still
// counts as yesterday. Pure helpers — no store imports.
import type { TaskRow } from '../types.ts'

export const RESET_HOUR = 4

export const isDaily = (t: TaskRow): boolean => t.tags.includes('daily-routine')

const pad = (n: number) => String(n).padStart(2, '0')

// YYYY-MM-DD of the logical day containing `d` (local time minus RESET_HOUR).
export function dayKey(d: Date = new Date()): string {
  const s = new Date(d.getTime() - RESET_HOUR * 3600_000)
  return `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`
}

export function prevDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const s = new Date(y, m - 1, d - 1)
  return `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`
}

// "in 9h 12m" until the next 4 AM.
export function untilResetLabel(now: Date = new Date()): string {
  const next = new Date(now)
  next.setHours(RESET_HOUR, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  const mins = Math.max(1, Math.round((next.getTime() - now.getTime()) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `in ${h}h ${m}m` : `in ${m}m`
}

// Streak worth showing: counted today or yesterday (older = broken).
export function liveStreak(t: TaskRow): number {
  if (!t.streak || !t.streak_day) return 0
  const today = dayKey()
  return t.streak_day === today || t.streak_day === prevDayKey(today) ? t.streak : 0
}

// A daily task checked THIS logical day is "cooled" until the next reset.
export function isCooled(t: TaskRow): boolean {
  return isDaily(t) && t.done && dayKey(new Date(t.updated_at)) === dayKey()
}
