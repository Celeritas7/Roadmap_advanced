// Product comparison for one shopping task. Another chat saves the study
// (roadmap_save_comparison); here the owner sees every product ranked by
// what matters to them — not only price but quality, life, cost per year,
// warranty and reviews — and marks a pick. Buying stays with Cost (Phase 7).
import { useMemo } from 'react'
import { useStore } from '../../store/useStore.ts'
import { CRITERIA, WEIGHT_LABEL, perYear, rankItems, weightOf, type CriterionId } from '../../lib/compare.ts'
import type { ComparisonItem } from '../../types.ts'

const money = (v: number | null, cur: string) => {
  if (v == null) return '—'
  try { return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: cur || 'JPY', maximumFractionDigits: 0 }).format(v) } catch { return `${Math.round(v)} ${cur}` }
}
const stars = (v: number) => '★'.repeat(Math.round(v)) + '☆'.repeat(Math.max(0, 5 - Math.round(v)))

/** "Compare 3" on any task that has a saved comparison; nothing otherwise. */
export function CompareButton({ taskId, compact = false }: { taskId: string; compact?: boolean }) {
  const comparisons = useStore((s) => s.comparisons)
  const items = useStore((s) => s.comparisonItems)
  const open = useStore((s) => s.setCompareOpen)
  const c = comparisons.find((x) => x.task_id === taskId)
  if (!c) return null
  const n = items.filter((i) => i.comparison_id === c.id).length
  const picked = c.chosen_item ? items.find((i) => i.id === c.chosen_item) : undefined
  return (
    <button type="button" className={'ns-chip cmp-btn' + (compact ? ' compact' : '')} onClick={() => open(c.id)} title={picked ? `Your pick: ${picked.name}` : undefined}>
      ⚖ Compare {n}{picked && !compact ? ' · picked' : ''}
    </button>
  )
}

function Fact({ label, value, best }: { label: string; value: string; best?: boolean }) {
  return (
    <div className={'cmp-fact' + (best ? ' best' : '')}>
      <span className="cmp-fl">{label}{best && <span className="cmp-best">best</span>}</span>
      <span className="cmp-fv">{value}</span>
    </div>
  )
}

export function CompareSheet() {
  const openId = useStore((s) => s.compareOpen)
  const setOpen = useStore((s) => s.setCompareOpen)
  const comparisons = useStore((s) => s.comparisons)
  const allItems = useStore((s) => s.comparisonItems)
  const setWeights = useStore((s) => s.setCompareWeights)
  const choose = useStore((s) => s.chooseCompareItem)
  const c = comparisons.find((x) => x.id === openId)
  const items = useMemo(() => allItems.filter((i) => i.comparison_id === openId), [allItems, openId])
  const ranked = useMemo(() => rankItems(items, c?.weights), [items, c?.weights])
  if (!c) return null

  const used = CRITERIA.filter((k) => items.some((i) => k.value(i) != null))
  const cycle = (id: CriterionId) => {
    const next = (weightOf(c.weights, id) + 1) % 4
    void setWeights(c.id, { ...Object.fromEntries(CRITERIA.map((k) => [k.id, weightOf(c.weights, k.id)])), [id]: next })
  }
  const has = (k: keyof ComparisonItem) => items.some((i) => i[k] != null && i[k] !== '')

  return (
    <div className="cmp-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null) }}>
      <div className="cmp" role="dialog" aria-modal="true" aria-label={`Compare: ${c.title}`} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(null) }}>
        <div className="cmp-h">
          <div className="cmp-ht">
            <h2>{c.title}</h2>
            {c.need && <p className="cmp-need">{c.need}</p>}
            <p className="ns-note">{items.length} products{c.source ? ` · studied by ${c.source}` : ''} · {new Date(c.updated_at).toLocaleDateString()}</p>
          </div>
          <button type="button" className="ns-chip" onClick={() => setOpen(null)} autoFocus>Close</button>
        </div>

        {used.length > 0 && (
          <div className="cmp-weights" role="group" aria-label="What matters to you">
            <span className="ns-k">What matters</span>
            {used.map((k) => {
              const w = weightOf(c.weights, k.id)
              return (
                <button key={k.id} type="button" className={'cmp-w w' + w} onClick={() => cycle(k.id)} aria-label={`${k.label}: ${WEIGHT_LABEL[w]}. Tap to change.`}>
                  {k.label} <b>{WEIGHT_LABEL[w]}</b>
                </button>
              )
            })}
          </div>
        )}

        <ol className="cmp-list">
          {ranked.map(({ item: i, score, best }, rank) => {
            const pick = c.chosen_item === i.id
            return (
              <li key={i.id} className={'cmp-card' + (pick ? ' pick' : '') + (rank === 0 ? ' top' : '')}>
                <div className="cmp-top">
                  <span className="cmp-rank">#{rank + 1}</span>
                  {i.image_url && <img className="cmp-img" src={i.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                  <div className="cmp-name">
                    <strong>{i.name}</strong>
                    {(i.brand || i.model) && <span className="ns-note">{[i.brand, i.model].filter(Boolean).join(' · ')}</span>}
                    {i.shop && <span className="ns-note">at {i.shop}</span>}
                  </div>
                  <div className="cmp-score" title="Overall fit with what matters to you">
                    <span>{score}</span>
                    <i style={{ width: `${score}%` }} />
                  </div>
                </div>
                {pick && <span className="cmp-pickb">Your pick</span>}
                <div className="cmp-facts">
                  <Fact label="Price" value={money(i.price, i.currency)} best={best.has('price')} />
                  {has('life_years') && <Fact label="Cost / year" value={money(perYear(i), i.currency)} best={best.has('per_year')} />}
                  {has('quality') && <Fact label="Quality" value={i.quality != null ? `${stars(i.quality)} ${i.quality}/5` : '—'} best={best.has('quality')} />}
                  {has('life_years') && <Fact label="Life" value={i.life_years != null ? `${i.life_years} yr${i.life_years === 1 ? '' : 's'}` : '—'} best={best.has('life')} />}
                  {has('warranty_months') && <Fact label="Warranty" value={i.warranty_months != null ? `${i.warranty_months} mo` : '—'} best={best.has('warranty')} />}
                  {has('rating') && <Fact label="Reviews" value={i.rating != null ? `${i.rating.toFixed(1)}${i.review_count != null ? ` (${i.review_count.toLocaleString()})` : ''}` : '—'} best={best.has('rating')} />}
                  {has('size') && <Fact label="Size / fit" value={i.size ?? '—'} />}
                  {Object.entries(i.extra).map(([k, v]) => <Fact key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
                </div>
                {(i.pros.length > 0 || i.cons.length > 0) && (
                  <div className="cmp-pc">
                    {i.pros.length > 0 && <ul className="cmp-pros">{i.pros.map((x, n) => <li key={n}>{x}</li>)}</ul>}
                    {i.cons.length > 0 && <ul className="cmp-cons">{i.cons.map((x, n) => <li key={n}>{x}</li>)}</ul>}
                  </div>
                )}
                {i.notes && <p className="cmp-notes">{i.notes}</p>}
                <div className="cmp-actions">
                  <button type="button" className={'ns-chip' + (pick ? '' : ' on')} onClick={() => void choose(c.id, pick ? null : i.id)}>
                    {pick ? 'Unpick' : 'Pick this'}
                  </button>
                  {i.url && <a className="ns-chip" href={i.url} target="_blank" rel="noreferrer">Open shop page ↗</a>}
                </div>
              </li>
            )
          })}
        </ol>
        {c.notes && <p className="cmp-notes">{c.notes}</p>}
      </div>
    </div>
  )
}
