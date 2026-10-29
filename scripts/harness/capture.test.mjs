// Unit test for lib/capture.ts. Run: node --experimental-strip-types scripts/harness/capture.test.mjs
import { guessCapture, splitCapture, isNetworkError } from '../../src/lib/capture.ts'
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
  ['send the monthly report to boss', 'work', ['office'], false],
  ['会議の資料', 'work', ['office'], false],
  ['do laundry', 'house', ['home'], false],
  ['掃除する', 'house', ['home'], false],
  ['buy cleaning spray', 'shop', ['outside', 'short-burst'], false],
  ['fix the report export bug', 'dx', ['keyboard'], false],
  ['   !!  ', null, null, null],
]
let fail = 0
for (const [line, cat, tags, high] of cases) {
  const g = guessCapture(line)
  const ok = cat === null ? g === null : g && g.category === cat && JSON.stringify(g.tags) === JSON.stringify(tags) && g.high === high && !g.title.includes('!')
  if (!ok) { fail++; console.log('FAIL', JSON.stringify(line), '→', JSON.stringify(g)) }
  else console.log('ok  ', JSON.stringify(line), '→', g ? g.category : null)
}
const splits = [
  ['trail1, trail2, trail3', ['trail1', 'trail2', 'trail3']],
  ['buy milk、卵，bread ;  ,, ', ['buy milk', '卵', 'bread']],
  ['visit Itoya\nfix login !', ['visit Itoya', 'fix login !']],
  ['call mama', ['call mama']],
  [' , !! , ', []],
]
for (const [text, want] of splits) {
  const got = splitCapture(text)
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fail++; console.log('FAIL split', JSON.stringify(text), '→', JSON.stringify(got)) } else console.log('ok   split', JSON.stringify(text), '→', got.length)
}
const net = [[new TypeError('Failed to fetch'), true], [new TypeError('NetworkError when attempting to fetch resource.'), true], [new TypeError('Load failed'), true], [new Error('new row violates row-level security policy'), false], [null, false]]
for (const [e, want] of net) {
  if (isNetworkError(e) !== want) { fail++; console.log('FAIL isNetworkError', String(e)) } else console.log('ok   isNetworkError', String(e), want)
}
if (fail) { console.log(fail + ' failed'); process.exit(1) }
console.log('all passed')
