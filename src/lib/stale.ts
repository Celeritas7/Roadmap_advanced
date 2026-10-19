// Stale recall — pure, no store or I/O.
// A task kept from the Inbox (tag `kept`) that nobody has touched for
// STALE_DAYS goes back to the Inbox, tagged `stale`, for a keep/drop call.
// "Touched" = the row changed (updated_at, bumped by the DB trigger on any
// update) or a suggestion for it was started or done.
import type { TaskRow } from '../types.ts'
import type { Served } from './rotation.ts'

export const STALE_DAYS = 30
export const KEPT_TAG = 'kept'
export const STALE_TAG = 'stale'

export function staleIds(tree: TaskRow[], served: Served[], now = Date.now()): string[] {
  const cutoff = now - STALE_DAYS * 86_400_000
  const lastServed = new Map<string, number>()
  for (const s of served) {
    const at = Date.parse(s.at)
    const id = s.task.sub_id
    if (!Number.isNaN(at) && at > (lastServed.get(id) ?? -Infinity)) lastServed.set(id, at)
  }
  return tree
    .filter((t) =>
      t.kind === 'task' && !t.done &&
      t.tags.includes(KEPT_TAG) && !t.tags.includes('parked') &&
      !t.tags.includes('wf') && !t.tags.includes('daily-routine') &&
      Date.parse(t.updated_at) < cutoff &&
      (lastServed.get(t.id) ?? -Infinity) < cutoff)
    .map((t) => t.id)
}
