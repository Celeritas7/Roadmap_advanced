// Product comparison scoring — pure, no store or I/O.
// Each criterion is scaled 0…1 across the products that have a value for it
// (best = 1). A product's score is the weighted mean over the criteria that
// at least one product has; a product missing a value scores 0 there, so a
// study that skipped a field never wins on it by accident.
import type { ComparisonItem } from '../types.ts'

export type CriterionId = 'price' | 'per_year' | 'quality' | 'life' | 'warranty' | 'rating'
export type Criterion = { id: CriterionId; label: string; better: 'low' | 'high'; value: (i: ComparisonItem) => number | null }

/** Price per year of expected life — the cheap thing that breaks costs more. */
export const perYear = (i: ComparisonItem): number | null =>
  i.price != null && i.life_years != null && i.life_years > 0 ? i.price / i.life_years : null

export const CRITERIA: Criterion[] = [
  { id: 'price', label: 'Price', better: 'low', value: (i) => i.price },
  { id: 'per_year', label: 'Cost per year', better: 'low', value: perYear },
  { id: 'quality', label: 'Quality', better: 'high', value: (i) => i.quality },
  { id: 'life', label: 'Life', better: 'high', value: (i) => i.life_years },
  { id: 'warranty', label: 'Warranty', better: 'high', value: (i) => i.warranty_months },
  { id: 'rating', label: 'Reviews', better: 'high', value: (i) => i.rating },
]

/** Used when a comparison has no weights of its own yet. */
export const DEFAULT_WEIGHTS: Record<CriterionId, number> = { price: 2, per_year: 2, quality: 3, life: 2, warranty: 1, rating: 1 }
export const WEIGHT_LABEL = ['Off', 'Low', 'Medium', 'High']

export const weightOf = (w: Record<string, number> | null | undefined, id: CriterionId): number => {
  const v = w?.[id]
  return typeof v === 'number' && v >= 0 && v <= 3 ? Math.round(v) : DEFAULT_WEIGHTS[id]
}

export type Ranked = {
  item: ComparisonItem
  score: number                         // 0…100
  best: Set<CriterionId>                // criteria where this product is (joint) best
}

export function rankItems(items: ComparisonItem[], weights: Record<string, number> | null | undefined): Ranked[] {
  const used = CRITERIA.filter((c) => items.some((i) => c.value(i) != null))
  const span = new Map(used.map((c) => {
    const vs = items.map(c.value).filter((v): v is number => v != null)
    return [c.id, { min: Math.min(...vs), max: Math.max(...vs) }]
  }))
  const scale = (c: Criterion, v: number | null): number => {
    if (v == null) return 0
    const { min, max } = span.get(c.id)!
    if (max === min) return 1
    return c.better === 'high' ? (v - min) / (max - min) : (max - v) / (max - min)
  }
  const total = used.reduce((a, c) => a + weightOf(weights, c.id), 0)
  const ranked = items.map((item) => {
    const best = new Set<CriterionId>()
    let s = 0
    for (const c of used) {
      const v = c.value(item)
      const k = scale(c, v)
      if (v != null && k === 1 && items.filter((x) => c.value(x) != null).length > 1) best.add(c.id)
      s += weightOf(weights, c.id) * k
    }
    return { item, score: total ? Math.round((s / total) * 100) : 0, best }
  })
  return ranked.sort((a, b) => b.score - a.score || (a.item.price ?? Infinity) - (b.item.price ?? Infinity) || a.item.position - b.item.position)
}
