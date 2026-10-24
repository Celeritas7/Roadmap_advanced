// Unit test for lib/category.ts. Run: node --experimental-strip-types scripts/harness/category.test.mjs
import { categoryIndex, categoryCounts } from '../../src/lib/category.ts'
const row = (id, parent_id, kind, tags, done = false) => ({ id, parent_id, title: id, done, kind, position: 0, expanded: true, tags, streak: 0, streak_day: null, created_at: '', updated_at: '' })
const tree = [
  row('lang', null, 'group', ['lang']),
  row('ja', 'lang', 'group', []),
  row('t-own', 'ja', 'task', ['food']),            // own tag wins over the folder
  row('t-inherit', 'ja', 'task', ['home', 'parked']),
  row('cap', null, 'group', ['inbox']),            // inbox is not a category
  row('shop', 'cap', 'group', ['shop']),
  row('t-shop', 'shop', 'task', ['outside']),
  row('t-shop-done', 'shop', 'task', [], true),
  row('loose', null, 'task', []),                  // no folder, no tag
  row('cyc-a', 'cyc-b', 'group', []), row('cyc-b', 'cyc-a', 'group', []), row('t-cyc', 'cyc-a', 'task', []),
]
const idx = categoryIndex(tree)
const want = { 't-own': 'food', 't-inherit': 'lang', 't-shop': 'shop', 't-shop-done': 'shop', loose: null, 't-cyc': null, ja: 'lang' }
let fail = 0
for (const [id, c] of Object.entries(want)) {
  const got = idx.get(id) ?? null
  if (got !== c) { fail++; console.log('FAIL', id, 'got', got, 'want', c) } else console.log('ok  ', id, '→', c)
}
const counts = Object.fromEntries(categoryCounts(tree, idx))
const wantCounts = { food: 1, lang: 1, shop: 1 }
if (JSON.stringify(counts) !== JSON.stringify(wantCounts)) { fail++; console.log('FAIL counts', counts) } else console.log('ok   counts', counts)
if (fail) { console.log(fail + ' failed'); process.exit(1) }
console.log('all passed')
