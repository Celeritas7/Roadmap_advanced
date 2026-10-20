// Unit test for lib/stale.ts. Run: node --experimental-strip-types scripts/harness/stale.test.mjs
import { staleIds } from '../../src/lib/stale.ts'
const now = Date.parse('2026-11-30T00:00:00Z')
const day = 86_400_000
const ago = (d) => new Date(now - d * day).toISOString()
const row = (id, tags, updated, extra = {}) => ({ id, parent_id: null, title: id, done: false, kind: 'task', position: 0, expanded: true, tags, streak: 0, streak_day: null, created_at: ago(90), updated_at: updated, ...extra })
const tree = [
  row('old-kept', ['kept'], ago(31)),                    // stale
  row('fresh-kept', ['kept'], ago(5)),                   // touched recently
  row('old-not-kept', [], ago(60)),                      // never came through the Inbox
  row('old-parked', ['kept', 'parked'], ago(60)),        // already back in the Inbox
  row('old-done', ['kept'], ago(60), { done: true }),
  row('old-daily', ['kept', 'daily-routine'], ago(60)),
  row('old-mirror', ['kept', 'wf'], ago(60)),
  row('old-served', ['kept'], ago(60)),                  // started via a suggestion 3 days ago
  row('old-served-long-ago', ['kept'], ago(60)),         // last started 40 days ago
  row('folder', ['kept'], ago(60), { kind: 'group' }),
]
const served = [
  { task: { board_id: 'rm', item_key: 'x:y', sub_id: 'old-served' }, at: ago(3) },
  { task: { board_id: 'rm', item_key: 'x:y', sub_id: 'old-served-long-ago' }, at: ago(40) },
]
const got = staleIds(tree, served, now).sort().join(',')
const want = 'old-kept,old-served-long-ago'
console.log(got === want ? 'ok   staleIds picks only untouched Inbox-kept tasks' : `FAIL staleIds: got ${got}, want ${want}`)
if (got !== want) process.exit(1)
