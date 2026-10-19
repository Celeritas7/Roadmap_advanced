// Phase 1 smoke: Keep/Delete go through an Undo strip; Undo restores; the
// write lands only after the strip expires; New folder is inline.
import { chromium } from 'playwright'
const base = process.env.HARNESS_URL || 'http://localhost:5173'
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const p = await b.newPage({ viewport: { width: 1100, height: 900 } })
const fails = []
const check = (name, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) fails.push(name) }
const tree = () => p.evaluate(() => window.rmStore.getState().tree)
const has = async (id) => (await tree()).some((t) => t.id === id)
const parked = async (id) => (await tree()).find((t) => t.id === id)?.tags.includes('parked')

await p.goto(base + '/scripts/harness/inbox.html')
await p.waitForSelector('.ib-item')
check('4 cards render', (await p.locator('.ib-item').count()) === 4)
check('no native dialogs: Delete shows a strip', await (async () => {
  p.once('dialog', (d) => { fails.push('native dialog opened: ' + d.message()); d.dismiss() })
  await p.locator('.ib-item', { hasText: 'Goi practice' }).getByRole('button', { name: 'Delete' }).click()
  return (await p.locator('.ib-strip.delete').count()) === 1
})())
check('live region announces', (await p.locator('.sr-only').textContent()).startsWith('Deleted: Goi'))
check('row still in store while strip shows', await has('t2'))
await p.locator('.ib-strip', { hasText: 'Goi practice' }).getByRole('button', { name: 'Undo' }).click()
check('Undo restores the card', (await p.locator('.ib-item', { hasText: 'Goi practice' }).count()) === 1 && await has('t2'))

await p.locator('.ib-item', { hasText: 'Sheet metal' }).getByRole('button', { name: 'Delete' }).click()
await p.locator('.ib-item', { hasText: 'Python code' }).getByRole('button', { name: 'Keep' }).click()
check('two strips', (await p.locator('.ib-strip').count()) === 2)
await p.waitForTimeout(5400)
check('after 5 s: delete written', !(await has('t4')))
check('after 5 s: keep written (unparked)', (await has('t3')) && !(await parked('t3')))
check('strips gone', (await p.locator('.ib-strip').count()) === 0)

// Inline new folder from a card's Move to…
const card = p.locator('.ib-item', { hasText: 'Mark Japanese' })
await card.getByLabel('Move to folder').selectOption('__new__')
check('inline field opens, no prompt()', (await card.locator('.ib-input').count()) === 1)
await card.locator('.ib-input').fill('Kanji drills')
await card.getByRole('button', { name: 'Create & move' }).click()
const t1 = (await tree()).find((t) => t.id === 't1')
const nf = (await tree()).find((t) => t.title === 'Kanji drills' && t.kind === 'group')
check('folder created at top level and task moved into it', !!nf && nf.parent_id === null && t1.parent_id === nf.id)

// Mechanical's two items were kept/deleted above, so its chip is gone.
check('emptied folder chip disappears', (await p.getByRole('button', { name: /^Mechanical/ }).count()) === 0)
// Folder bar: Keep all → strips for every card in the folder
await p.getByRole('button', { name: /^Japanese/ }).click()
check('folder chip filters', (await p.locator('.ib-item').count()) === 1)
await p.getByRole('button', { name: /Keep all/ }).click()
check('Keep all strips every shown card', (await p.locator('.ib-strip.keep').count()) === 1)

await p.screenshot({ path: 'scripts/harness/inbox.png', fullPage: true })
await b.close()
if (fails.length) { console.error('\n' + fails.length + ' failed'); process.exit(1) }
console.log('\nall passed')
