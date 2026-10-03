// V2-Q — NEW FILE src/features/home/NowStrip.tsx
// Home's half of the suggester: the inputs it can't read for itself (energy,
// mood, device, place), the tag correction for the current suggestion, and the
// Friday review. The suggestion TEXT belongs to the banner alone — Home never
// renders its own copy, so the two cannot disagree.
import { Fragment, useEffect, useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import {
  clearCheckin, needsCheckin, readCheckin, readDevice, readPlace, reviewDue,
  saveCheckin, saveDevice, savePlace, weekReview, weekStart, type WeekReview,
} from '../../lib/suggester.ts'
import { addrKey, correctTag, hubInstance, hubTags, tagAddr } from '../../lib/rmHub.ts'
import type { Device, Energy } from '../../types.ts'

const ENERGY: Energy[] = ['high', 'mid', 'low']
const DEVICES: Device[] = ['phone', 'laptop', 'either']
const FALLBACK_MOOD = ['down', 'even', 'up']

export function NowStrip() {
  const hubState = useStore((s) => s.hubState)
  useStore((s) => s.hubRev) // re-render on hub / context changes
  const [, force] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 60_000)
    return () => window.clearInterval(t)
  }, [])

  if (hubState !== 'live') return null
  const hub = hubInstance()
  const moodVocab = hub?.enums('mood') ?? []
  const moods = moodVocab.length >= 3 ? moodVocab.slice(0, 3) : FALLBACK_MOOD
  const places = ['anywhere', ...(hub?.enums('place') ?? []).filter((p) => p !== 'anywhere')]
  const checkin = readCheckin()
  const device = readDevice()
  const place = readPlace()

  const cur = window.rm?.banner.current() ?? null
  const live = cur && Date.parse(cur.until) > Date.now() ? cur : null
  const tag = live ? hubTags().find((r) => addrKey(tagAddr(r)) === addrKey(live.task)) : undefined
  // Always offer the current value, even if the vocab list is missing it.
  const withCur = (list: string[], v?: string | null) => (v && !list.includes(v) ? [v, ...list] : list)
  const types = withCur(hub?.enums('type') ?? [], tag?.type)
  const efforts = withCur(hub?.enums('effort') ?? [], tag?.effort)

  return (
    <section className="ns" aria-label="Right now">
      {needsCheckin() ? (
        <div className="ns-check">
          <div className="ns-q">How's the tank?</div>
          <div className="ns-grid" style={{ gridTemplateColumns: `auto repeat(${moods.length}, minmax(0, 1fr))` }}>
            <span />
            {moods.map((m) => <span key={m} className="ns-h">{m}</span>)}
            {ENERGY.map((e) => (
              <Fragment key={e}>
                <span className="ns-h ns-hr">{e}</span>
                {moods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="ns-cell"
                    data-energy={e}
                    onClick={() => saveCheckin(e, m)}
                    aria-label={`Energy ${e}, mood ${m}`}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      ) : (
        <div className="ns-row">
          <span className="ns-k">Feeling</span>
          <button type="button" className="ns-chip" onClick={clearCheckin} title="Ask me again">
            {checkin?.energy} · {checkin?.mood}
          </button>
        </div>
      )}

      <div className="ns-row">
        <span className="ns-k">On</span>
        <div className="ns-seg" role="radiogroup" aria-label="Device">
          {DEVICES.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={device === d} className={'ns-chip' + (device === d ? ' on' : '')} onClick={() => saveDevice(d)}>
              {d}
            </button>
          ))}
        </div>
        <span className="ns-k">At</span>
        <select className="ns-sel" value={place} onChange={(e) => savePlace(e.target.value)} aria-label="Place">
          {places.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {live && tag && (
        <div className="ns-row">
          <span className="ns-k">Tagged</span>
          <select className="ns-sel" value={tag.type ?? ''} onChange={(e) => void correctTag(live.task, { type: e.target.value })} aria-label="Type">
            {!tag.type && <option value="">—</option>}
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="ns-sel" value={tag.effort ?? ''} onChange={(e) => void correctTag(live.task, { effort: e.target.value })} aria-label="Effort">
            {!tag.effort && <option value="">—</option>}
            {efforts.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="ns-note">{tag.guessed === false ? 'yours' : 'a guess — correct it'}</span>
        </div>
      )}

      <WeeklyReview />
    </section>
  )
}

function WeeklyReview() {
  const key = 'rm-ak-review-' + weekStart().toISOString().slice(0, 10)
  const [data, setData] = useState<WeekReview | null>(null)
  const [hidden, setHidden] = useState(() => localStorage.getItem(key) === '1')
  const due = reviewDue()

  useEffect(() => {
    if (due && !hidden) weekReview().then(setData).catch(() => {})
  }, [due, hidden])

  if (!due || hidden || !data) return null
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="ns-review">
      <div className="ns-rh">
        <strong>This week</strong>
        <span>{data.misses.length} missed · {data.skips.length} skipped · {data.done} done · streak {data.streak}d</span>
        <button type="button" className="ns-x" aria-label="Hide until next week" onClick={() => { localStorage.setItem(key, '1'); setHidden(true) }}>×</button>
      </div>
      {data.misses.length > 0 && (
        <ul className="ns-list">
          {data.misses.map((m) => (
            <li key={m.id}><span>{m.title}</span><time>{when(m.made_at)}</time></li>
          ))}
        </ul>
      )}
      {data.skips.length > 0 && (
        <ul className="ns-list ns-skips">
          {data.skips.map((m) => (
            <li key={m.id}><span>{m.title}</span><em>{m.reason}</em></li>
          ))}
        </ul>
      )}
    </div>
  )
}
