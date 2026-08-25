// V2-F — NEW FILE src/features/plan/JourneyView.tsx
// One skill's roadmap as a journey road: START → numbered stations →
// phase signposts → 🏁 FINISH. Checks call the store's toggleTask (same
// optimistic write + rollback as everywhere else).
import { useMemo } from 'react'
import { useStore } from '../../store/useStore.ts'
import { buildTree, type TreeNode } from '../../lib/tree.ts'
import type { TaskRow } from '../../types.ts'

type Stop = { t: TaskRow; phase: string | null }
type Row =
  | { k: 'start' | 'finish'; y: number; x: number }
  | { k: 'phase'; label: string; y: number; x: number }
  | { k: 'stop'; s: Stop; y: number; x: number }

function collectStops(rows: TaskRow[], projectId: string): Stop[] {
  const out: Stop[] = []
  const walk = (nodes: TreeNode[], path: string[]) => {
    for (const n of nodes) {
      if (n.kind === 'group') walk(n.children, [...path, n.title])
      else if (n.tags.includes(projectId)) out.push({ t: n, phase: path[path.length - 1] ?? null })
    }
  }
  walk(buildTree(rows), [])
  return out
}

const H = { stop: 78, phase: 66, start: 64, finish: 64 } as const

export function JourneyView({ projectId }: { projectId: string }) {
  const tree = useStore((s) => s.tree)
  const toggleTask = useStore((s) => s.toggleTask)
  const stops = useMemo(() => collectStops(tree, projectId), [tree, projectId])

  const { rows, total, d } = useMemo(() => {
    const groups = new Map<string, Stop[]>()
    for (const s of stops) {
      const k = s.phase ?? ''
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(s)
    }
    const multi = groups.size > 1
    const seq: Array<Omit<Row, 'x' | 'y'>> = [{ k: 'start' }]
    for (const [label, list] of groups) {
      if (multi && label) seq.push({ k: 'phase', label } as never)
      for (const s of list) seq.push({ k: 'stop', s } as never)
    }
    seq.push({ k: 'finish' })
    let y = 0
    const rows = seq.map((r, i) => {
      const h = H[r.k]
      const row = { ...r, y: y + h / 2, x: 66 + 32 * Math.sin(i * 0.85) } as Row
      y += h
      return row
    })
    let d = `M ${rows[0].x} ${rows[0].y}`
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i], my = (a.y + b.y) / 2
      d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`
    }
    return { rows, total: y, d }
  }, [stops])

  if (stops.length === 0) {
    return (
      <div className="empty">
        <h2>Nothing here yet</h2>
        <p>No tasks in this plan. Add some from the tree in the main window.</p>
      </div>
    )
  }

  const hereIdx = rows.findIndex((r) => r.k === 'stop' && !r.s.t.done)
  let n = 0
  return (
    <div className="journey" style={{ height: `${total}px` }}>
      <svg className="jroad" width="132" height={total} viewBox={`0 0 132 ${total}`} aria-hidden="true">
        <path className="jr-edge" d={d} />
        <path className="jr-asphalt" d={d} />
        <path className="jr-lane" d={d} />
      </svg>
      {rows.map((r, i) => {
        if (r.k === 'start' || r.k === 'finish') {
          return (
            <div key={i} className="jsign" style={{ top: r.y, left: r.x }}>
              {r.k === 'start' ? 'START' : '🏁 FINISH'}
            </div>
          )
        }
        if (r.k === 'phase') {
          return (
            <div key={i} className="jphase" style={{ top: r.y, left: r.x - 20 }}>
              <span>⚑</span><span>{r.label}</span>
            </div>
          )
        }
        if (r.k !== 'stop') return null
        n++
        const t = r.s.t
        const here = i === hereIdx
        const cls = 'jstop' + (t.done ? ' done' : '') + (here ? ' here' : '')
        return (
          <div key={t.id} className={cls} style={{ top: r.y }}>
            <button
              type="button"
              className="jck"
              style={{ left: r.x }}
              aria-pressed={t.done}
              aria-label={`Mark "${t.title}" ${t.done ? 'not done' : 'done'}`}
              onClick={() => void toggleTask(t.id)}
            >
              {t.done ? '✓' : n}
            </button>
            {here && <span className="jhere" style={{ left: r.x }}>you are here</span>}
            <div className="jbody">
              <span className="jtitle">{t.title}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
