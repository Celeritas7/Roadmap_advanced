// Inbox — Roadmap's own tasks tagged `parked` (e.g. the OneNote import).
// Each row: keep (unpark → the suggester may pick it) or delete, and the
// rules the engine reads, all stored as tags: place · effort · device ·
// energy. "Move to" re-parents a task under any folder (or a new one).
// With a folder chip picked: keep the whole folder, or move the folder
// itself to the main list or into another folder.
//
// Phase 1 (review plan): Keep and Delete are one tap with Undo. The card
// collapses to a strip for UNDO_MS; the write happens only when the strip
// expires (or the view unmounts), so Undo is a plain cancel — no reverse
// write. New folder is an inline field, not a prompt().
import { useEffect, useRef, useState } from 'react'
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
const NEW = '__new__'
const TOP = '__top__'
const UNDO_MS = 5000

/** Inbox items: Roadmap's own parked tasks (WF mirrors are parked by WF, not here). */
export const isInboxItem = (t: TaskRow) => t.kind === 'task' && t.tags.includes(PARKED_TAG) && !t.tags.includes(MIRROR_TAG)

const pickOf = (t: TaskRow, family: string[]) => t.tags.find((x) => family.includes(x)) ?? ''
const withPick = (t: TaskRow, family: string[], v: string) => [...t.tags.filter((x) => !family.includes(x)), ...(v ? [v] : [])]

type PendingKind = 'keep' | 'delete'
type Pending = { kind: PendingKind; timer: number }
// Where an inline "new folder" field is open: a task id (move that task) or
// 'folder' (move the picked folder).
type NewFor = { target: string; title: string } | null

export function InboxView() {
  const tree = useStore((s) => s.tree)
  const resources = useStore((s) => s.resources)
  const updateTask = useStore((s) => s.updateTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const addFolder = useStore((s) => s.addFolder)
  const [folder, setFolder] = useState('all')   // a parent id, or 'all'
  const [pending, setPending] = useState<Map<string, Pending>>(new Map())
  const [newFor, setNewFor] = useState<NewFor>(null)
  const [live, setLive] = useState('')   // aria-live announcement

  // Writes are deferred while a card shows its Undo strip. The ref mirrors
  // `pending` so the unmount cleanup can flush what's still waiting.
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const treeRef = useRef(tree)
  treeRef.current = tree

  const ok = (p: Promise<unknown>) => void p.catch(() => {})
  const commit = (id: string, kind: PendingKind) => {
    const t = treeRef.current.find((x) => x.id === id)
    if (!t) return
    if (kind === 'delete') ok(deleteTask(id))
    else ok(updateTask(id, { tags: t.tags.filter((x) => x !== PARKED_TAG) }))
  }
  const settle = (id: string) => setPending((m) => { const n = new Map(m); n.delete(id); return n })
  const pend = (t: TaskRow, kind: PendingKind) => {
    const prev = pendingRef.current.get(t.id)
    if (prev) window.clearTimeout(prev.timer)
    const timer = window.setTimeout(() => { commit(t.id, kind); settle(t.id) }, UNDO_MS)
    setPending((m) => new Map(m).set(t.id, { kind, timer }))
    setLive(`${kind === 'keep' ? 'Kept' : 'Deleted'}: ${t.title}. Undo available.`)
  }
  const undo = (t: TaskRow) => {
    const p = pendingRef.current.get(t.id)
    if (p) window.clearTimeout(p.timer)
    settle(t.id)
    setLive(`Restored: ${t.title}.`)
  }
  // Leaving the Inbox (tab switch, sign-out) commits whatever is still on a strip.
  useEffect(() => () => {
    for (const [id, p] of pendingRef.current) { window.clearTimeout(p.timer); commit(id, p.kind) }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(tree.map((t) => [t.id, t]))
  const items = tree.filter(isInboxItem)
  const titleOf = (id: string | null) => (id ? byId.get(id)?.title ?? '—' : '—')
  const pathOf = (g: TaskRow): string => (g.parent_id && byId.get(g.parent_id) ? pathOf(byId.get(g.parent_id)!) + ' › ' : '') + g.title
  const folderIds = [...new Set(items.map((t) => t.parent_id ?? ''))]
  const count = (fid: string) => items.filter((t) => (t.parent_id ?? '') === fid).length
  const shown = items.filter((t) => folder === 'all' || (t.parent_id ?? '') === folder).sort((a, b) => a.position - b.position)
  const picked = folder !== 'all' ? byId.get(folder) : undefined

  // Move targets: every folder outside the inbox's own root folder(s), by path;
  // same-path duplicates collapse to the first.
  const rootOf = (t: TaskRow): TaskRow => (t.parent_id && byId.get(t.parent_id) ? rootOf(byId.get(t.parent_id)!) : t)
  const inboxRoots = new Set(items.map((t) => rootOf(t).id).filter((id) => byId.get(id)?.tags.includes('inbox')))
  const seen = new Set<string>()
  const targets = tree
    .filter((g) => g.kind === 'group' && !inboxRoots.has(rootOf(g).id))
    .map((g) => ({ id: g.id, path: pathOf(g) }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .filter((g) => (seen.has(g.path) ? false : (seen.add(g.path), true)))

  const set = (t: TaskRow, family: string[], v: string) => ok(updateTask(t.id, { tags: withPick(t, family, v) }))
  const endOf = (parent: string | null) => tree.filter((x) => x.parent_id === parent).length
  const reparent = (id: string, parent: string | null) => ok(updateTask(id, { parent_id: parent, position: endOf(parent) }))
  // A "Move to" pick: TOP → main list, NEW → open the inline field, else a folder id.
  const onMove = (target: string, v: string) => {
    if (!v) return
    if (v === NEW) { setNewFor({ target, title: '' }); return }
    const parent = v === TOP ? null : v
    if (target === 'folder') { if (picked && parent !== picked.id) reparent(picked.id, parent) }
    else if (parent !== null) reparent(target, parent)
  }
  const saveNew = async () => {
    if (!newFor) return
    const title = newFor.title.trim()
    if (!title) return
    const id = await addFolder(null, title)
    if (newFor.target === 'folder') { if (picked) reparent(picked.id, id) }
    else reparent(newFor.target, id)
    setNewFor(null)
  }
  const keepAll = () => { for (const t of shown) if (!pending.has(t.id)) pend(t, 'keep') }

  const moveOptions = (top: boolean) => (
    <>
      {top && <option value={TOP}>Main list (top level)</option>}
      {targets.map((g) => <option key={g.id} value={g.id}>{g.path}</option>)}
      <option value={NEW}>＋ New folder…</option>
    </>
  )
  const newField = (target: string) => newFor?.target === target && (
    <form className="ib-new" onSubmit={(e) => { e.preventDefault(); ok(saveNew()) }}>
      <input
        className="ib-input"
        autoFocus
        placeholder="New folder name"
        value={newFor.title}
        onChange={(e) => setNewFor({ target, title: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Escape') setNewFor(null) }}
        aria-label="New folder name"
      />
      <button type="submit" className="ns-chip on" disabled={!newFor.title.trim()}>Create &amp; move</button>
      <button type="button" className="ns-chip" onClick={() => setNewFor(null)}>Cancel</button>
    </form>
  )

  return (
    <section className="inbox">
      <div className="ib-head">
        <h2 className="ib-title">Inbox <span className="n">{items.length}</span></h2>
        <p className="ib-hint">Parked items are never suggested. <strong>Keep</strong> puts one into the suggestions; <strong>Delete</strong> removes it. Both can be undone for a few seconds.</p>
        <div className="ib-folders">
          <button type="button" className={'vchip' + (folder === 'all' ? ' on' : '')} aria-pressed={folder === 'all'} onClick={() => setFolder('all')}>All <span className="n">{items.length}</span></button>
          {folderIds.map((fid) => (
            <button key={fid} type="button" className={'vchip' + (folder === fid ? ' on' : '')} aria-pressed={folder === fid} onClick={() => setFolder(fid)}>
              {titleOf(fid || null)} <span className="n">{count(fid)}</span>
            </button>
          ))}
        </div>
        {picked && shown.length > 0 && (
          <div className="ib-bulk">
            <span className="ns-k">This folder</span>
            <button type="button" className="ns-chip on" onClick={keepAll}>Keep all {shown.length}</button>
            <select className="ns-sel" value="" onChange={(e) => onMove('folder', e.target.value)} aria-label="Move this folder">
              <option value="">Move folder to…</option>
              {moveOptions(true)}
            </select>
            <span className="ns-note">now in {picked.parent_id ? pathOf(byId.get(picked.parent_id)!) : 'the main list'}</span>
            {newField('folder')}
          </div>
        )}
      </div>

      <div className="sr-only" aria-live="polite">{live}</div>

      {shown.length === 0 && <p className="rv-empty">✓ Inbox is empty.</p>}

      <ul className="ib-list">
        {shown.map((t) => {
          const p = pending.get(t.id)
          if (p) {
            return (
              <li key={t.id} className={'ib-strip ' + p.kind}>
                <span className="ib-strip-k">{p.kind === 'keep' ? 'Kept' : 'Deleted'}</span>
                <span className="ib-strip-t">{t.title}</span>
                <button type="button" className="ns-chip" onClick={() => undo(t)}>Undo</button>
              </li>
            )
          }
          return (
            <li key={t.id} className="ib-item">
              <div className="ib-top">
                <span className="ib-name">{t.title}</span>
                {folder === 'all' && <span className="ib-folder">{titleOf(t.parent_id)}</span>}
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
                <button type="button" className="ns-chip on" onClick={() => pend(t, 'keep')}>Keep</button>
                <select className="ns-sel ib-move" value="" onChange={(e) => onMove(t.id, e.target.value)} aria-label="Move to folder">
                  <option value="">Move to…</option>
                  {moveOptions(false)}
                </select>
                <button type="button" className="ns-chip ib-del" onClick={() => pend(t, 'delete')}>Delete</button>
              </div>
              {newField(t.id)}
            </li>
          )
        })}
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
