// Fair rotation — narrows the suggester's candidates before RmHub.pick.
// Pure: no store, no I/O.
//
// Category = the WF item_key prefix (study / app / office). Slot = one WF
// item inside it (one language, one app). A slot is "served" when a
// suggestion for it was started or done; a skip or a miss keeps its turn.
//
//  1. The category served longest ago goes next (never served = first).
//  2. A category serves one slot per logical day: once a slot was served
//     today, only that slot is offered for the category until the reset.
//  3. Otherwise the slot served longest ago gets the day, so every slot
//     gets a turn before any slot repeats.
//  4. Ties at either level go to the higher priority (best task score).
//  5. A category or slot with nothing doable right now is passed over and
//     keeps its place in the queue.
// RmHub.pick then takes the highest-priority task inside the chosen slot.
import { dayKey } from './dailyReset.ts'
import type { SuggestCtx, SuggestTask, WfAddr } from '../types.ts'

export type Served = { task: WfAddr; at: string }
type Score = (t: SuggestTask, ctx: SuggestCtx) => number

export const categoryOf = (itemKey: string): string => itemKey.split(':')[0]

function groupBy(ts: SuggestTask[], key: (t: SuggestTask) => string): Map<string, SuggestTask[]> {
  const m = new Map<string, SuggestTask[]>()
  for (const t of ts) {
    const k = key(t)
    const list = m.get(k)
    if (list) list.push(t)
    else m.set(k, [t])
  }
  return m
}

export function rotate(cands: SuggestTask[], ctx: SuggestCtx, served: Served[], score: Score, today = dayKey()): SuggestTask[] {
  const scored = new Map<SuggestTask, number>()
  for (const c of cands) {
    const s = score(c, ctx)
    if (s > -Infinity) scored.set(c, s)
  }
  if (!scored.size) return []

  const lastSlot = new Map<string, number>()
  const lastCat = new Map<string, number>()
  const todaySlot = new Map<string, { key: string; at: number }>()   // category → slot served today
  for (const s of served) {
    const at = Date.parse(s.at)
    if (Number.isNaN(at)) continue
    const k = s.task.item_key
    const cat = categoryOf(k)
    if (at > (lastSlot.get(k) ?? -Infinity)) lastSlot.set(k, at)
    if (at > (lastCat.get(cat) ?? -Infinity)) lastCat.set(cat, at)
    const cur = todaySlot.get(cat)
    if (dayKey(new Date(at)) === today && (!cur || at > cur.at)) todaySlot.set(cat, { key: k, at })
  }

  const best = (ts: SuggestTask[]) => Math.max(...ts.map((t) => scored.get(t)!))
  // Longest wait first; equal waits (e.g. both never served) → higher priority.
  const byTurn = (last: Map<string, number>) => (a: [string, SuggestTask[]], b: [string, SuggestTask[]]) => {
    const wa = last.get(a[0]) ?? -Infinity
    const wb = last.get(b[0]) ?? -Infinity
    if (wa !== wb) return wa < wb ? -1 : 1
    return best(b[1]) - best(a[1])
  }

  const cats = [...groupBy([...scored.keys()], (t) => categoryOf(t.addr.item_key))].sort(byTurn(lastCat))
  for (const [cat, ts] of cats) {
    const slots = groupBy(ts, (t) => t.addr.item_key)
    const locked = todaySlot.get(cat)
    if (locked) {
      const hit = slots.get(locked.key)
      if (hit) return hit
      continue   // today's slot has nothing doable now: no other slot of this category today
    }
    return [...slots].sort(byTurn(lastSlot))[0][1]
  }
  return []
}
