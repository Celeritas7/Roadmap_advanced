// V2-K — FULL REPLACEMENT for src/features/home/HomeView.tsx
// Delta vs V2-J: chip row above the road (Everything / ⚡ Quick study /
// Dailies only / 🎯 Top 3) that swaps the road in place; picked view is
// persisted device-locally. Header stats stay global; only the road and its
// pool follow the chip. All-clear on a filtered view keeps the chips up.

import type { CSSProperties } from 'react'
import { useStore } from '../../store/useStore.ts'
import { useEffectiveRoleId } from '../../hooks/useEffectiveRoleId.ts'
import { ROLES, ROLE_BY_ID, PROJECTS, PROJECT_BY_ID } from '../../seed.ts'
import { getDaypart, formatHour12 } from '../../lib/time.ts'
import { buildTree, type TreeNode } from '../../lib/tree.ts'
import type { TaskRow } from '../../types.ts'
import { TodaysLog } from '../log/TodaysLog.tsx'
import { HomeStop } from './HomeStop.tsx'
import { PlanCards } from './PlanCards.tsx'
import { roadGeometry, workCap, barrierMessage, ROAD_XMID } from './road.ts'
import { ROAD_VIEWS, ROAD_VIEW_BY_ID, applyRoadView } from './roadViews.ts'
import { passingTaskIds } from '../../store/selectors.ts'

const ALL_ROLES: Set<string> = new Set(ROLES.map((r) => r.id))

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

const projectOf = (t: TaskRow): string | null =>
  t.tags.find((tag) => tag in PROJECT_BY_ID) ?? null

const isToday = (iso: string): boolean => {
  const d = new Date(iso)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

export function HomeView() {
  const tree = useStore((s) => s.tree)
  const hour = useStore((s) => s.now.hour)
  const pinned = useStore((s) => s.selectedRole !== null)
  const roadView = useStore((s) => s.roadView)
  const setRoadView = useStore((s) => s.setRoadView)
  const effId = useEffectiveRoleId()
  const filters = useStore((s) => s.filters)
  // Role gate opened to ALL roles — Home is the merged daily road. Context
  // filters still apply (same single source of pass Plan uses).
  const { pass } = passingTaskIds(tree, ALL_ROLES, filters)
  const role = ROLE_BY_ID[effId]
  const dp = getDaypart(hour)

  const tasks = tasksInRenderOrder(tree).filter(
    (t) => projectOf(t) !== null && pass.has(t.id),
  )
  const open = tasks.filter((t) => !t.done)
  const done = tasks.length - open.length

  // V2-K: the chip-picked view filters what rides the road.
  const viewMeta = ROAD_VIEW_BY_ID[roadView]
  const viewOpenCount = (id: typeof roadView) =>
    applyRoadView(id, tasks).filter((t) => !t.done).length
  const viewTasks = applyRoadView(roadView, tasks)

  // Road pool: open stops + stops cleared today (cleared ones ride along,
  // dimmed, holding their rotation slot).
  const pool = viewTasks.filter((t) => !t.done || isToday(t.updated_at))
  // Lanes in PROJECTS order = tier order: Attackers folders first, then
  // Mid-players, then Defenders — the merge is sorted, not arbitrary.
  const lanes = new Map<string, TaskRow[]>(PROJECTS.map((p) => [p.id, []]))
  for (const t of pool) {
    const p = projectOf(t)
    if (p) lanes.get(p)!.push(t)
  }
  const laneList = [...lanes.values()].filter((l) => l.length > 0)
  // Round-robin: one stop per folder per pass. V2-J: no cap — every open
  // stop in the picked view rides the road.
  const stops: TaskRow[] = []
  let openOnRoad = 0
  for (let i = 0; ; i++) {
    let added = false
    for (const lane of laneList) {
      if (lane[i]) {
        stops.push(lane[i])
        if (!lane[i].done) openOnRoad++
        added = true
      }
    }
    if (!added) break
  }
  const clearedOnRoad = stops.filter((t) => t.done).length
  const hereIdx = stops.findIndex((t) => !t.done)
  const geo = roadGeometry(stops.length, clearedOnRoad + workCap(hour))
  const closed = stops.length > 0 && geo.cap < stops.length

  return (
    <>
      <section className="home-now" style={{ '--h': role.hue } as CSSProperties}>
        <div className="hn-l">
          <span className="hn-daypart">{dp.label} · {formatHour12(hour)}</span>
          <h2 className="hn-title">{role.mood}</h2>
          <p className="hn-rule">
            {pinned ? 'Pinned to ' : `It's ${dp.label} — leading with `}
            <strong>{role.label}</strong>. All tiers merged into today's road ·
            {' '}{openOnRoad} open {openOnRoad === 1 ? 'stop' : 'stops'} · dailies reset 4:00 AM.
          </p>
        </div>
        <div className="hn-r">
          <div className="hn-stat"><span className="hn-num">{open.length}</span><span className="hn-lbl">open</span></div>
          <div className="hn-stat"><span className="hn-num">{done}</span><span className="hn-lbl">cleared</span></div>
        </div>
      </section>
      <div className="home-next">
        <div className="road-views">
          <span className="flabel">Next stops · road</span>
          {ROAD_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={'vchip' + (v.id === roadView ? ' on' : '')}
              onClick={() => setRoadView(v.id)}
            >
              {v.label} <span className="n">{viewOpenCount(v.id)}</span>
            </button>
          ))}
        </div>
        <p className="rv-hint">{viewMeta.title} — {viewMeta.hint}</p>
        {openOnRoad === 0 && (
          <p className="rv-empty">✓ All clear on this road{roadView !== 'all' ? ' — pick another chip to keep going' : ''}.</p>
        )}
        {openOnRoad > 0 && (
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
              <HomeStop key={t.id} task={t} dx={geo.xs[i] - ROAD_XMID} beyond={i >= geo.cap} here={i === hereIdx} />
            ))}
          </div>
        )}
      </div>
      <PlanCards />
      <TodaysLog />
    </>
  )
}
