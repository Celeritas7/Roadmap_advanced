// V2-B — src/features/home/HomeView.tsx
// The Home surface: rule summary card + winding-road "next stops" + Today's
// log. Read-side except the existing toggleTask (via HomeStop).
// Top stops = open tasks of the effective role, RENDER ORDER (buildTree DFS
// — same order nextAction uses; the app has no priority field), capped at 6.

import type { CSSProperties } from 'react'
import { useStore } from '../../store/useStore.ts'
import { useEffectiveRoleId } from '../../hooks/useEffectiveRoleId.ts'
import { ROLE_BY_ID, PROJECT_BY_ID } from '../../seed.ts'
import { getDaypart, formatHour12 } from '../../lib/time.ts'
import { buildTree, type TreeNode } from '../../lib/tree.ts'
import type { TaskRow } from '../../types.ts'
import { TodaysLog } from '../log/TodaysLog.tsx'
import { HomeStop } from './HomeStop.tsx'
import { roadGeometry, workCap, barrierMessage, ROAD_XMID } from './road.ts'

// Render-order linearization (position-sorted DFS), tasks only.
// PORT NOTE: selectors.ts has a private tasksInRenderOrder — exporting it
// instead of duplicating here is a fine CC-time swap (one-line export).
function tasksInRenderOrder(tasks: TaskRow[]): TaskRow[] {
  const out: TaskRow[] = []
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.kind === 'task') out.push(n)
      else walk(n.children)
    }
  }
  walk(buildTree(tasks))
  return out
}

const roleOf = (t: TaskRow): string | null => {
  const p = t.tags.find((tag) => tag in PROJECT_BY_ID)
  return p ? PROJECT_BY_ID[p].role : null
}

export function HomeView() {
  const tree = useStore((s) => s.tree)
  const hour = useStore((s) => s.now.hour)
  const pinned = useStore((s) => s.selectedRole !== null)
  const effId = useEffectiveRoleId()
  const role = ROLE_BY_ID[effId]
  const dp = getDaypart(hour)

  const tasks = tasksInRenderOrder(tree).filter((t) => roleOf(t) === effId)
  const open = tasks.filter((t) => !t.done)
  // One stop per project first (round-robin), then second passes fill to 6.
  const lanes = new Map<string, TaskRow[]>()
  for (const t of open) {
    const p = t.tags.find((tag) => tag in PROJECT_BY_ID) ?? '_untagged'
    if (!lanes.has(p)) lanes.set(p, [])
    lanes.get(p)!.push(t)
  }
  const laneList = [...lanes.values()]
  const next: TaskRow[] = []
  for (let i = 0; next.length < 6; i++) {
    let added = false
    for (const lane of laneList) {
      if (lane[i]) {
        next.push(lane[i])
        added = true
        if (next.length >= 6) break
      }
    }
    if (!added) break
  }
  const done = tasks.length - open.length

  // Stops cleared TODAY stay on the road (dimmed) so progress reads as
  // distance travelled; the road continues to the open stops.
  const isToday = (iso: string) => {
    const d = new Date(iso)
    const n = new Date()
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  }
  const clearedToday = tasks.filter((t) => t.done && isToday(t.updated_at))

  return (
    <>
      <section className="home-now" style={{ '--h': role.hue } as CSSProperties}>
        <div className="hn-l">
          <span className="hn-daypart">{dp.label} · {formatHour12(hour)}</span>
          <h2 className="hn-title">{role.mood}</h2>
          <p className="hn-rule">
            {pinned ? 'Pinned to ' : `It's ${dp.label}, so Roadmap is focused on `}
            <strong>{role.label}</strong> · {role.subtitle}. Showing your top{' '}
            {next.length} open {next.length === 1 ? 'stop' : 'stops'}.
          </p>
        </div>
        <div className="hn-r">
          <div className="hn-stat"><span className="hn-num">{open.length}</span><span className="hn-lbl">open</span></div>
          <div className="hn-stat"><span className="hn-num">{done}</span><span className="hn-lbl">cleared</span></div>
        </div>
      </section>
      <div className="home-next">
        <span className="flabel">Next stops · what to do now</span>
        {next.length === 0 ? (
          <div className="empty">
            <h2>Every stop cleared</h2>
            <p>Nothing open for {role.label} right now. Switch tiers, or open Plan to add more.</p>
          </div>
        ) : (
          (() => {
            const stops = [...clearedToday, ...next]
            const geo = roadGeometry(stops.length, clearedToday.length + workCap(hour))
            const closed = geo.cap < stops.length
            return (
              <div className="rows home-rows road">
                <svg className="roadsvg" width="72" height={geo.H} viewBox={`0 0 72 ${geo.H}`} preserveAspectRatio="none" aria-hidden="true">
                  {geo.dClosed && <path className="road-edge closed" d={geo.dClosed} />}
                  {geo.dClosed && <path className="road-asphalt closed" d={geo.dClosed} />}
                  <path className="road-edge" d={geo.dOpen} />
                  <path className="road-asphalt" d={geo.dOpen} />
                  <path className="road-lane" d={geo.dOpen} />
                </svg>
                {closed && (
                  <div className="road-barrier" style={{ top: `${geo.boundaryY}px` }}>
                    <span className="rb-bar"></span>
                    <span className="rb-label">{barrierMessage(hour)}</span>
                  </div>
                )}
                {stops.map((t, i) => (
                  <HomeStop key={t.id} task={t} dx={geo.xs[i] - ROAD_XMID} beyond={i >= geo.cap} here={i === clearedToday.length} />
                ))}
              </div>
            )
          })()
        )}
      </div>
      <TodaysLog />
    </>
  )
}
