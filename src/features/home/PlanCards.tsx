// V2-J — NEW FILE src/features/home/PlanCards.tsx
// "All roadmaps · overview" grid under the Home road: one card per language
// (JP/CN/MM) then one per non-lang project with tasks. Each card: progress
// bar + a mini road of the next 3 open stops (check + ↗ launch) + jump link.
import type { CSSProperties } from 'react'
import { useStore } from '../../store/useStore.ts'
import { PROJECTS, PROJECT_BY_ID } from '../../seed.ts'
import { LANGS, taskLang } from '../plan/langMeta.ts'
import { buildTree, type TreeNode } from '../../lib/tree.ts'
import type { TaskRow } from '../../types.ts'
import { LaunchPopover } from '../plan/LaunchPopover.tsx'
import { liveStreak } from '../../lib/dailyReset.ts'

const ROW = 44
const XMID = 20
const AMP = 9

function renderOrder(tasks: TaskRow[]): TaskRow[] {
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

function miniRoad(n: number): { d: string; xs: number[]; H: number } {
  const xs = Array.from({ length: n }, (_, i) => XMID + AMP * Math.sin(i * 1.4 + 0.5))
  const H = n * ROW
  const pts = [{ x: xs[0], y: -8 }, ...xs.map((x, i) => ({ x, y: i * ROW + ROW / 2 })), { x: xs[n - 1], y: H + 8 }]
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return { d, xs, H }
}

type Card = { key: string; title: string; chip: string; hue: number; href: string; tasks: TaskRow[] }

export function PlanCards() {
  const tree = useStore((s) => s.tree)
  const toggleTask = useStore((s) => s.toggleTask)
  const ordered = renderOrder(tree)
  const cards: Card[] = []
  for (const l of LANGS) {
    const mine = ordered.filter((t) => taskLang(t) === l.id)
    if (mine.length) cards.push({ key: l.id, title: l.name, chip: l.flag, hue: PROJECT_BY_ID.lang.hue, href: '?plan=lang', tasks: mine })
  }
  for (const p of PROJECTS) {
    if (p.id === 'lang') continue
    const mine = ordered.filter((t) => t.tags.includes(p.id))
    if (mine.length) cards.push({ key: p.id, title: p.label, chip: p.short, hue: p.hue, href: `?plan=${p.id}`, tasks: mine })
  }
  if (!cards.length) return null
  return (
    <div className="plan-cards">
      <span className="flabel">All roadmaps · overview</span>
      <div className="pc-grid">
        {cards.map((c) => {
          const done = c.tasks.filter((t) => t.done).length
          const next = c.tasks.filter((t) => !t.done).slice(0, 3)
          const geo = next.length ? miniRoad(next.length) : null
          const pct = c.tasks.length ? Math.round((done / c.tasks.length) * 100) : 0
          return (
            <section key={c.key} className="pcard" style={{ '--h': c.hue } as CSSProperties}>
              <header className="pc-head">
                <span className="pc-chip">{c.chip}</span>
                <span className="pc-name">{c.title}</span>
                <span className="pc-cnt">{done}/{c.tasks.length}</span>
              </header>
              <div className="pc-bar"><i style={{ width: `${pct}%` }} /></div>
              {geo ? (
                <div className="pc-mini" style={{ height: `${geo.H}px` }}>
                  <svg width="40" height={geo.H} viewBox={`0 0 40 ${geo.H}`} preserveAspectRatio="none" aria-hidden="true">
                    <path className="pcr-asphalt" d={geo.d} />
                    <path className="pcr-lane" d={geo.d} />
                  </svg>
                  {next.map((t, i) => (
                    <div key={t.id} className="pc-stop" style={{ top: `${i * ROW + ROW / 2}px` }}>
                      <button
                        type="button"
                        className="pc-check"
                        style={{ left: `${geo.xs[i].toFixed(1)}px` }}
                        aria-label={`Mark "${t.title}" done`}
                        onClick={() => void toggleTask(t.id)}
                      >{i + 1}</button>
                      <span className="pc-title" title={t.title}>{t.title}</span>
                      {liveStreak(t) > 0 && <span className="streak">🔥 {liveStreak(t)}</span>}
                      <LaunchPopover taskId={t.id} taskTitle={t.title} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pc-all">All clear ✓</p>
              )}
              <a className="pc-more" href={c.href}>→ full road</a>
            </section>
          )
        })}
      </div>
    </div>
  )
}
