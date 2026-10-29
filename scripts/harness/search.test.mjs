// Unit test for lib/search.ts. Run: node --experimental-strip-types scripts/harness/search.test.mjs
import { searchTasks } from '../../src/lib/search.ts'
const r = (id, title, parent_id = null, kind = 'task', extra = {}) => ({ id, title, parent_id, kind, tags: [], done: false, position: 0, updated_at: '2026-10-01', created_at: '', ...extra })
const tree = [
  r('g1', 'Shopping', null, 'group'),
  r('a', 'Garlic crusher, cutting board', 'g1'),
  r('b', 'Buy the UB hub', 'g1'),
  r('g2', 'Languages', null, 'group'), r('g3', 'Japanese', 'g2', 'group'),
  r('c', 'Kanji N3 drills', 'g3'),
  r('d', 'Old kanji list', 'g3', 'task', { done: true }),
  r('e', 'ＪＬＰＴ mock test', 'g3'),
  r('f', 'Hub wiring diagram', null),
]
let fail = 0
const ids = (q, links) => searchTasks(tree, q, links).map((h) => h.t.id)
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fail++; console.log('FAIL', name, JSON.stringify(got)) } else console.log('ok  ', name) }
eq('empty query finds nothing', ids('  '), [])
eq('title word, any case', ids('GARLIC'), ['a'])
eq('all words must match, any order', ids('board garlic'), ['a'])
eq('a folder name finds what is inside it', ids('japanese drills'), ['c'])
eq('title hits outrank path-only hits', ids('shopping').slice(0, 1), ['g1'])
eq('open tasks rank above done ones', ids('kanji'), ['c', 'd'])
eq('full-width text matches half-width', ids('jlpt'), ['e'])
eq('word start beats mid-word', ids('hub'), ['f', 'b'])
eq('link labels are searched', ids('youtube', [{ task_id: 'c', label: 'YouTube playlist' }]), ['c'])
eq('path is returned', searchTasks(tree, 'drills')[0].path, 'Languages › Japanese')
if (fail) { console.log(fail + ' failed'); process.exit(1) }
console.log('all passed')
