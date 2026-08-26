// V2-H — NEW FILE src/features/plan/LanguageRoads.tsx
// Body of the Languages plan window (?plan=lang): mode chips pivot between
// "By language" (one road per language, phases as ⚑ signposts) and a merged
// road per phase across all languages (language flags as signposts).
// Checks call the store's toggleTask (same optimistic write + rollback).
// Reuses the V2-F journey road classes (jsign/jphase/jstop/jck/jhere/jbody)
// so all three themes style it for free; net-new classes are lr-*.
import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import type { TaskRow } from '../../types.ts'
import { LANGS, LANG_BY_ID, LANG_PHASES, taskLang, taskPhase, type Lang, type LangPhase } from './langMeta.ts'

type SeqItem =
  | { k: 'start' | 'finish' }
  | { k: 'flag'; icon: string; label: string }
  | { k: 'stop'; t: TaskRow }
type Row = SeqItem & { cy: number; x: number }

// Same row heights + curve as JourneyView, so the two roads feel identical.
const H: Record<string, number> = { start: 64, finish: 64, flag: 66, stop: 78 }

function MultiRoad({ seq, showLang, onToggle }: {
  seq: SeqItem[]
  showLang: boolean
  onToggle: (id: string) => void
}) {
  let y = 0
  const rows: Row[] = seq.map((r, i) => {
    const h = H[r.k]
    const row = { ...r, cy: y + h / 2, x: 66 + 32 * Math.sin(i * 0.85) }
    y += h
    return row
  })
  let d = `M ${rows[0].x.toFixed(1)} ${rows[0].cy.toFixed(1)}`
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i], my = ((a.cy + b.cy) / 2).toFixed(1)
    d += ` C ${a.x.toFixed(1)} ${my}, ${b.x.toFixed(1)} ${my}, ${b.x.toFixed(1)} ${b.cy.toFixed(1)}`
  }
  const hereIdx = rows.findIndex((r) => r.k === 'stop' && !r.t.done)
  let n = 0
  return (
    <div className="lr-road" style={{ height: `${y}px` }}>
      <svg className="lroad" width="132" height={y} viewBox={`0 0 132 ${y}`} aria-hidden="true">
        <path className="jr-edge" d={d} />
        <path className="jr-asphalt" d={d} />
        <path className="jr-lane" d={d} />
      </svg>
      {rows.map((r, i) => {
        if (r.k === 'start' || r.k === 'finish') {
          return (
            <div key={i} className="jsign" style={{ top: r.cy, left: r.x }}>
              {r.k === 'start' ? 'START' : '🏁 FINISH'}
            </div>
          )
        }
        if (r.k === 'flag') {
          // NOTE: +14 (right of road centre) per the approved kit design —
          // JourneyView still uses x-20; align it later if wanted.
          return (
            <div key={i} className="jphase" style={{ top: r.cy, left: r.x + 14 }}>
              <span>{r.icon}</span><span>{r.label}</span>
            </div>
          )
        }
        n++
        const t = (r as Extract<SeqItem, { k: 'stop' }>).t
        const lang = LANG_BY_ID[taskLang(t) ?? '']
        const here = i === hereIdx
        const cls = 'jstop' + (t.done ? ' done' : '') + (here ? ' here' : '')
        return (
          <div key={t.id} className={cls} style={{ top: r.cy }}>
            <button
              type="button"
              className="jck"
              style={{ left: r.x }}
              aria-pressed={t.done}
              aria-label={`Mark "${t.title}" ${t.done ? 'not done' : 'done'}`}
              onClick={() => onToggle(t.id)}
            >
              {t.done ? '✓' : n}
            </button>
            {here && <span className="jhere" style={{ left: r.x }}>you are here</span>}
            <div className="jbody">
              <span className="jtitle">{t.title}</span>
              {showLang && lang && (
                <span className="lr-lchip"><span className="f">{lang.flag}</span>{lang.name}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LangCard({ lang, tasks, onToggle }: {
  lang: Lang
  tasks: TaskRow[]
  onToggle: (id: string) => void
}) {
  const mine = tasks.filter((t) => taskLang(t) === lang.id)
  const seq: SeqItem[] = [{ k: 'start' }]
  for (const ph of LANG_PHASES) {
    const list = mine.filter((t) => taskPhase(t) === ph.id)
    if (!list.length) continue
    seq.push({ k: 'flag', icon: '⚑', label: ph.label })
    for (const t of list) seq.push({ k: 'stop', t })
  }
  // Safety: tasks with a lang tag but no phase tag still ride the road.
  for (const t of mine.filter((x) => taskPhase(x) === null)) seq.push({ k: 'stop', t })
  seq.push({ k: 'finish' })
  const dn = mine.filter((t) => t.done).length
  const pct = mine.length ? Math.round((dn / mine.length) * 100) : 0
  return (
    <section className="lr-card">
      <div className="lr-lhead">
        <span className="lr-flagemoji">{lang.flag}</span>
        <h3>{lang.name}</h3>
        <span className="lr-count">{dn}/{mine.length}</span>
        <span className="lr-bar"><i style={{ width: `${pct}%` }} /></span>
      </div>
      <MultiRoad seq={seq} showLang={false} onToggle={onToggle} />
    </section>
  )
}

function PhaseCard({ phase, tasks, onToggle }: {
  phase: LangPhase
  tasks: TaskRow[]
  onToggle: (id: string) => void
}) {
  const mine = tasks.filter((t) => taskPhase(t) === phase.id)
  const seq: SeqItem[] = [{ k: 'start' }]
  for (const lang of LANGS) {
    const list = mine.filter((t) => taskLang(t) === lang.id)
    if (!list.length) continue
    seq.push({ k: 'flag', icon: lang.flag, label: lang.name })
    for (const t of list) seq.push({ k: 'stop', t })
  }
  seq.push({ k: 'finish' })
  const dn = mine.filter((t) => t.done).length
  return (
    <section className="lr-card merged">
      <div className="lr-lhead">
        <span className="lr-flagemoji">⚑</span>
        <h3>{phase.label} — all languages</h3>
        <span className="lr-count">{dn}/{mine.length}</span>
      </div>
      {mine.length
        ? <MultiRoad seq={seq} showLang={true} onToggle={onToggle} />
        : <div className="lr-empty">No {phase.label.toLowerCase()} tasks yet.</div>}
    </section>
  )
}

export function LanguageRoads() {
  const tree = useStore((s) => s.tree)
  const toggleTask = useStore((s) => s.toggleTask)
  const [mode, setMode] = useState<string>('lang') // 'lang' | LANG_PHASES id
  const tasks = useMemo(
    () => tree.filter((t) => t.kind === 'task' && taskLang(t) !== null),
    [tree],
  )
  const cur = LANG_PHASES.find((p) => p.id === mode) ?? null
  const onToggle = (id: string) => void toggleTask(id)
  return (
    <>
      <div className="lr-modes">
        <span className="lr-mlabel">Road</span>
        <button
          type="button"
          className={'lr-chip' + (cur === null ? ' on' : '')}
          onClick={() => setMode('lang')}
        >🗺 By language</button>
        <span className="lr-sep" aria-hidden="true"></span>
        {LANG_PHASES.map((ph) => {
          const open = tasks.filter((t) => taskPhase(t) === ph.id && !t.done).length
          return (
            <button
              key={ph.id}
              type="button"
              className={'lr-chip' + (mode === ph.id ? ' on' : '')}
              onClick={() => setMode(ph.id)}
            >{ph.label}<span className="n">{open}</span></button>
          )
        })}
      </div>
      <p className="lr-hint">
        {cur
          ? `Every ${cur.label.toLowerCase()} task across all languages, merged into one road — work top to bottom.`
          : 'One road per language — phases are the ⚑ signposts along each road.'}
      </p>
      {cur
        ? <PhaseCard phase={cur} tasks={tasks} onToggle={onToggle} />
        : (
          <div className="lr-grid">
            {LANGS.map((l) => <LangCard key={l.id} lang={l} tasks={tasks} onToggle={onToggle} />)}
          </div>
        )}
    </>
  )
}
