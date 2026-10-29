// Unit test for lib/compare.ts. Run: node --experimental-strip-types scripts/harness/compare.test.mjs
import { rankItems, perYear, weightOf } from '../../src/lib/compare.ts'
const it = (id, o) => ({ id, comparison_id: 'c', name: id, brand: null, model: null, image_url: null, url: null, shop: null, price: null, currency: 'JPY', quality: null, life_years: null, warranty_months: null, size: null, rating: null, review_count: null, pros: [], cons: [], extra: {}, notes: null, position: 0, ...o })
const cheap = it('cheap', { price: 1500, quality: 2, life_years: 1 })
const solid = it('solid', { price: 3000, quality: 4, life_years: 5 })
const fancy = it('fancy', { price: 9000, quality: 5, life_years: 6 })
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fail++; console.log('FAIL', name, JSON.stringify(got)) } else console.log('ok  ', name) }
const order = (w) => rankItems([cheap, solid, fancy], w).map((r) => r.item.id)
eq('cost per year = price / life', perYear(solid), 600)
eq('no life → no cost per year', perYear(it('x', { price: 100 })), null)
eq('default weights favour the long-lasting middle option', order({})[0], 'solid')
eq('price alone → cheapest wins', order({ price: 3, per_year: 0, quality: 0, life: 0, warranty: 0, rating: 0 })[0], 'cheap')
eq('quality alone → best quality wins', order({ price: 0, per_year: 0, quality: 3, life: 0, warranty: 0, rating: 0 })[0], 'fancy')
const r = rankItems([cheap, solid, fancy], {})
eq('best-in-criterion flags', [...r.find((x) => x.item.id === 'cheap').best].sort(), ['price'])
eq('cost-per-year best goes to solid', r.find((x) => x.item.id === 'solid').best.has('per_year'), true)
eq('scores are 0…100', r.every((x) => x.score >= 0 && x.score <= 100), true)
eq('a missing value scores 0 on that criterion', rankItems([it('a', { price: 100 }), it('b', { price: 100, quality: 5 })], {})[0].item.id, 'b')
eq('out-of-range weight falls back to default', weightOf({ quality: 9 }, 'quality'), 3)
eq('one product only → no "best" flags', [...rankItems([solid], {})[0].best], [])
if (fail) { console.log(fail + ' failed'); process.exit(1) }
console.log('all passed')
