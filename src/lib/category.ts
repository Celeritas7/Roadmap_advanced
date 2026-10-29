// Category = project (seed PROJECTS: dx, lang, food, shop, place …), pure.
// A task's category is its own project tag if it has one, else the nearest
// ancestor folder's. Seeded tasks and WF mirrors carry the tag themselves;
// OneNote-imported and captured tasks carry it only on their folder, so
// every reader must go through here rather than `t.tags.includes(id)`.
import { PROJECT_BY_ID } from '../seed.ts'
import type { TaskRow } from '../types.ts'

export type CategoryIndex = Map<string, string | null>

const ownCategory = (t: TaskRow): string | null => t.tags.find((x) => x in PROJECT_BY_ID) ?? null

/** One pass over the tree: task id → category id (or null). O(n). */
export function categoryIndex(tree: TaskRow[]): CategoryIndex {
  const byId = new Map(tree.map((t) => [t.id, t]))
  const memo: CategoryIndex = new Map()
  const resolve = (t: TaskRow, depth: number): string | null => {
    const hit = memo.get(t.id)
    if (hit !== undefined) return hit
    let c = ownCategory(t)
    if (!c && t.parent_id && depth < 64) {   // depth guard against a cyclic parent_id
      const p = byId.get(t.parent_id)
      if (p) c = resolve(p, depth + 1)
    }
    memo.set(t.id, c)
    return c
  }
  for (const t of tree) resolve(t, 0)
  return memo
}

export const categoryOf = (idx: CategoryIndex, t: TaskRow): string | null => idx.get(t.id) ?? null

/** Open-task count per category, for chips. */
export function categoryCounts(tree: TaskRow[], idx: CategoryIndex): Map<string, number> {
  const n = new Map<string, number>()
  for (const t of tree) {
    if (t.kind !== 'task' || t.done) continue
    const c = idx.get(t.id)
    if (c) n.set(c, (n.get(c) ?? 0) + 1)
  }
  return n
}
