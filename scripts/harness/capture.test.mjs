// Unit test for lib/capture.ts. Run: node --experimental-strip-types scripts/harness/capture.test.mjs
import { guessCapture } from '../../src/lib/capture.ts'
const cases = [
  ['buy tissue paper', 'shop', ['outside', 'short-burst'], false],
  ['Buy facewash !', 'shop', ['outside', 'short-burst', 'high'], true],
  ['ティッシュを買う', 'shop', ['outside', 'short-burst'], false],
  ['visit the new ramen place in Shimbashi', 'place', ['outside'], false],
  ['check out Itoya Ginza', 'place', ['outside'], false],
  ['fix the Cost app login bug', 'dx', ['keyboard'], false],
  ['practice N3 kanji', 'lang', [], false],
  ['get together with Amy bhai', 'other', [], false],
  ['get new earphones', 'shop', ['outside', 'short-burst'], false],
  ['call mama', 'other', [], false],
  ['   !!  ', null, null, null],
]
let fail = 0
for (const [line, cat, tags, high] of cases) {
  const g = guessCapture(line)
  const ok = cat === null ? g === null : g && g.category === cat && JSON.stringify(g.tags) === JSON.stringify(tags) && g.high === high && !g.title.includes('!')
  if (!ok) { fail++; console.log('FAIL', JSON.stringify(line), '→', JSON.stringify(g)) }
  else console.log('ok  ', JSON.stringify(line), '→', g ? g.category : null)
}
if (fail) { console.log(fail + ' failed'); process.exit(1) }
console.log('all passed')
