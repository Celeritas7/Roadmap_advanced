// Supabase access for product comparisons (roadmap_comparisons + items).
// Rows are written by roadmap_save_comparison (another chat's study); the app
// only reads them and updates the owner's weights and pick.
import { supabase } from '../lib/supabase.ts'
import type { Comparison, ComparisonItem } from '../types.ts'

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

export async function fetchComparisons(): Promise<{ comparisons: Comparison[]; items: ComparisonItem[] }> {
  const [c, i] = await Promise.all([
    supabase.from('roadmap_comparisons').select('*').order('updated_at', { ascending: false }),
    supabase.from('roadmap_comparison_items').select('*').order('position', { ascending: true }),
  ])
  if (c.error) throw c.error
  if (i.error) throw i.error
  // numeric columns arrive as strings from PostgREST; make them numbers once here.
  const items = (i.data ?? []).map((r) => ({
    ...r,
    price: num(r.price), quality: num(r.quality), life_years: num(r.life_years),
    warranty_months: num(r.warranty_months), rating: num(r.rating), review_count: num(r.review_count),
    pros: r.pros ?? [], cons: r.cons ?? [], extra: r.extra ?? {},
  })) as ComparisonItem[]
  return { comparisons: (c.data ?? []) as Comparison[], items }
}

export async function updateComparison(id: string, patch: Partial<Pick<Comparison, 'weights' | 'chosen_item'>>): Promise<void> {
  const { error } = await supabase.from('roadmap_comparisons').update(patch).eq('id', id)
  if (error) throw error
}
