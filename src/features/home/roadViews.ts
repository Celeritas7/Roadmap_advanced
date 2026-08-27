// V2-K — NEW FILE src/features/home/roadViews.ts
// Road-view definitions for the Home chip switcher. Pure filters over the
// render-ordered task list + the persisted device-local pick.
import type { TaskRow } from '../../types.ts'
import { isDaily } from '../../lib/dailyReset.ts'
import { PROJECT_BY_ID } from '../../seed.ts'

export type RoadViewId = 'all' | 'quick' | 'daily' | 'focus'
export type RoadView = { id: RoadViewId; label: string; title: string; hint: string }

export const ROAD_VIEWS: RoadView[] = [
  { id: 'all',   label: 'Everything',     title: 'Everything · all open stops',
    hint: 'All plans merged into one road, priority order. Pick a simpler road to shrink today\u2019s view — your choice is remembered.' },
  { id: 'quick', label: '⚡ Quick study', title: '⚡ Quick study — all languages',
    hint: 'Every quick-study task across all languages, merged into one short road.' },
  { id: 'daily', label: 'Dailies only',   title: 'Dailies only',
    hint: 'Just your @daily-routine tasks — the ones that reset at 4:00 AM.' },
  { id: 'focus', label: '🎯 Top 3',       title: '🎯 Top 3',
    hint: 'The first open stop from each of your top plans.' },
]
export const ROAD_VIEW_BY_ID: Record<RoadViewId, RoadView> =
  Object.fromEntries(ROAD_VIEWS.map((v) => [v.id, v])) as Record<RoadViewId, RoadView>

const projectOf = (t: TaskRow): string | null =>
  t.tags.find((tag) => tag in PROJECT_BY_ID) ?? null

// `tasks` arrive in render order (= priority order). Returns the subset that
// rides the road under this view. 'focus' = the first OPEN stop from each of
// the first three plans that still have one (no cleared ride-alongs).
export function applyRoadView(view: RoadViewId, tasks: TaskRow[]): TaskRow[] {
  if (view === 'all') return tasks
  if (view === 'quick') return tasks.filter((t) => t.tags.includes('ph-quick'))
  if (view === 'daily') return tasks.filter(isDaily)
  const seen = new Set<string>()
  const out: TaskRow[] = []
  for (const t of tasks) {
    if (t.done) continue
    const p = projectOf(t)
    if (!p || seen.has(p)) continue
    seen.add(p)
    out.push(t)
    if (out.length === 3) break
  }
  return out
}

const STORAGE_KEY = 'rm-road-view'

export function readStoredRoadView(): RoadViewId {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && ROAD_VIEWS.some((rv) => rv.id === v)) return v as RoadViewId
  } catch { /* localStorage unavailable — fall through to default */ }
  return 'all'
}

export function storeRoadView(v: RoadViewId): void {
  try { localStorage.setItem(STORAGE_KEY, v) } catch { /* ignore persist failure */ }
}
