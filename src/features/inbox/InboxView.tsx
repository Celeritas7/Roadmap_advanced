// Inbox — Roadmap's own tasks tagged `parked` (e.g. the OneNote import).
// Each row: keep (unpark → the suggester may pick it) or delete, and the
// rules the engine reads, all stored as tags: place · effort · device ·
// energy. "Move to" re-parents the task under another top-level folder.
import { useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import { MIRROR_TAG, PARKED_TAG } from '../../lib/rmHub.ts'
import type { TaskRow } from '../../types.ts'

type Choice = { id: string; label: string }
const PLACES: Choice[] = [
  { id: '', label: 'any place' }, { id: 'home', label: 'home' }, { id: 'office', label: 'office' },
  { id: 'train', label: 'train' }, { id: 'cafe', label: 'cafe' }, { id: 'outside', label: 'outside' },
]
const EFFORTS: Choice[] = [{ id: 'short-burst', label: 'quick' }, { id: '', label: 'medium' }, { id: 'deep-focus', label: 'deep' }]
const DEVICES: Choice[] = [{ id: '', label: 'either' }, { id: 'keyboard', label: 'laptop' }, { id: 'phone-only', label: 'phone' }]
const ENERGY: Choice[] = [{ id: '', label: 'any' }, { id: 'low-ok', label: 'fine when tired' }, { id: 'needs-energy', label: 'needs energy' }]

const ids = (cs: Choice[]) => cs.map((c) => c.id).filter(Boolean)
const PLACE_IDS = ids(PLACES)
const EFFORT_IDS = ids(EFFORTS)
const DEVICE_IDS = ids(DEVICES)
const ENERGY_IDS = ids(ENERGY)

/** Inbox items: Roadmap's own parked tasks (WF mirrors are parked by WF, not here). */
export const isInboxItem = (t: TaskRow) => t.kind === 'task' && t.tags.includes(PARKED_TAG) && !t.tags.includes(MIRROR_TAG)

const pickOf = (t: TaskRow, family: string[]) => t.tags.find((x) => family.includes(x)) ?? ''
const withPick = (t: TaskRow, family: string[], v: string) => [...t.tags.filter((x) => !family.includes(x)), ...(v ? [v] : [])]

export function InboxView() {
  const tree = useStore((s) => s.tree)
  const resources = useStore((s) => s.resources)
  const updateTask = useStore((s) => s.updateTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const [folder, setFolder] = useState('all')

  const byId = new Map(tree.map((t) => [t.id, t]))
  const items = tree.filter(isInboxItem)
  const folderOf = (t: TaskRow) => (t.parent_id ? byId.get(t.parent_id)?.title ?? '—' : '—')
  const folders = [...new Set(items.map(folderOf))]
  const shown = items.filter((t) => folder === 'all' || folderOf(t) === folder).sort((a, b) => a.position - b.position)
  // "Move to": top-level folders that aren't the inbox's own root.
  const rootOf = (t: TaskRow): TaskRow => (t.parent_id && byId.get(t.parent_id) ? rootOf(byId.get(t.parent_id)!) : t)
  const inboxRoots = new Set(items.map((t) => rootOf(t).id))
  const targets = tree.filter((t) => t.kind === 'group' && t.parent_id === null && !inboxRoots.has(t.id)).sort((a, b) => a.position - b.position)

  const set = (t: TaskRow, family: string[], v: string) => void updateTask(t.id, { tags: withPick(t, family, v) }).catch(() => {})
  const keep = (t: TaskRow) => void updateTask(t.id, { tags: t.tags.filter((x) => x !== PARKED_TAG) }).catch(() => {})
  const move = (t: TaskRow, parent: string) => {
    if (!parent) return
    const pos = tree.filter((x) => x.parent_id === parent).length
    void updateTask(t.id, { parent_id: parent, position: pos }).catch(() => {})
  }
  const drop = (t: TaskRow) => { if (confirm(`Delete "${t.title}"?`)) void deleteTask(t.id).catch(() => {}) }

  return (
    <section className="inbox">
      <div className="ib-head">
        <h2 className="ib-title">Inbox <span className="n">{items.length}</span></h2>
        <p className="ib-hint">Parked items. <strong>Keep</strong> lets the suggester pick one; set where, how long and how much energy it needs first. <strong>Delete</strong> removes it for good.</p>
        <div className="ib-folders">
          {['all', ...folders].map((f) => (
            <button key={f} type="button" className={'vchip' + (folder === f ? ' on' : '')} onClick={() => setFolder(f)}>
              {f === 'all' ? 'All' : f} <span className="n">{f === 'all' ? items.length : items.filter((t) => folderOf(t) === f).length}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && <p className="rv-empty">✓ Inbox is empty.</p>}

      <ul className="ib-list">
        {shown.map((t) => (
          <li key={t.id} className="ib-item">
            <div className="ib-top">
              <span className="ib-name">{t.title}</span>
              <span className="ib-folder">{folderOf(t)}</span>
            </div>
            {resources.some((r) => r.task_id === t.id) && (
              <div className="ib-links">
                {resources.filter((r) => r.task_id === t.id).map((r) => (
                  <a key={r.id} className="ns-link" href={r.url} target="_blank" rel="noreferrer">{r.label}</a>
                ))}
              </div>
            )}
            <div className="ib-rules">
              <Rule label="At" value={pickOf(t, PLACE_IDS)} choices={PLACES} onPick={(v) => set(t, PLACE_IDS, v)} />
              <Rule label="Effort" value={pickOf(t, EFFORT_IDS)} choices={EFFORTS} onPick={(v) => set(t, EFFORT_IDS, v)} />
              <Rule label="On" value={pickOf(t, DEVICE_IDS)} choices={DEVICES} onPick={(v) => set(t, DEVICE_IDS, v)} />
              <Rule label="Energy" value={pickOf(t, ENERGY_IDS)} choices={ENERGY} onPick={(v) => set(t, ENERGY_IDS, v)} />
            </div>
            <div className="ib-actions">
              <button type="button" className="ns-chip on" onClick={() => keep(t)}>Keep</button>
              <select className="ns-sel" value="" onChange={(e) => move(t, e.target.value)} aria-label="Move to folder">
                <option value="">Move to…</option>
                {targets.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
              <button type="button" className="ns-chip ib-del" onClick={() => drop(t)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Rule({ label, value, choices, onPick }: { label: string; value: string; choices: Choice[]; onPick: (v: string) => void }) {
  return (
    <label className="ib-rule">
      <span className="ns-k">{label}</span>
      <select className="ns-sel" value={value} onChange={(e) => onPick(e.target.value)}>
        {choices.map((c) => <option key={c.id || 'none'} value={c.id}>{c.label}</option>)}
      </select>
    </label>
  )
}
