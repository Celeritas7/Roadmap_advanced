// Inbox — Roadmap's own tasks tagged `parked` (e.g. the OneNote import).
// Each row: keep (unpark → the suggester may pick it) or delete, and the
// rules the engine reads, all stored as tags: place · effort · device ·
// energy. "Move to" re-parents a task under any folder (or a new one).
// With a folder chip picked: keep the whole folder, or move the folder
// itself to the main list or into another folder.
//
// Phase 4: Review mode shows one item at a time with the engine's current
// context (where you are, your energy) so rules are set against the real
// situation. Keys: k keep · d delete · s / → skip · ← back · 1 2 3 effort ·
// u undo · Esc back to the list. Sort applies to both views; a daily
// counter shows how many items were decided today.
//
// Phase 3: multi-select. Each card has a checkbox (shift-click selects a
// range); a sticky bar acts on the selection: Keep, Delete (one Undo strip
// for the batch), Move to, Set rule. Batches write through updateTasks /
// deleteTasks: one optimistic state change, one rollback.
//
// Phase 2: the four rules render as tag pills; tapping one opens a 44 px-row
// picker (one open at a time, Esc/outside click closes). Cards are a title
// row, optional links, then pills left / actions right.
//
// Phase 1 (review plan): Keep and Delete are one tap with Undo. The card
// collapses to a strip for UNDO_MS; the write happens only when the strip
// expires (or the view unmounts), so Undo is a plain cancel — no reverse
// write. New folder is an inline field, not a prompt().
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useStore } from '../../store/useStore.ts'
import { MIRROR_TAG, PARKED_TAG } from '../../lib/rmHub.ts'
import { dayKey } from '../../lib/dailyReset.ts'
import { readCheckin, resolvePlace } from '../../lib/suggester.ts'
import { KEPT_TAG, STALE_DAYS, STALE_TAG } from '../../lib/stale.ts'
import { PROJECTS } from '../../seed.ts'
import type { TaskRow } from '../../types.ts'

type Choice = { id: string; label: string }
const PLACES: Choice[] = [
  { id: '', label: 'any place' }, { id: 'home', label: 'home' }, { id: 'office', label: 'office' },
  { id: 'train', label: 'train' }, { id: 'cafe', label: 'cafe' }, { id: 'outside', label: 'outside' },
]
const EFFORTS: Choice[] = [{ id: 'short-burst', label: 'quick' }, { id: '', label: 'medium' }, { id: 'deep-focus', label: 'deep' }]
const DEVICES: Choice[] = [{ id: '', label: 'either' }, { id: 'keyboard', label: 'laptop' }, { id: 'phone-only', label: 'phone' }]
const ENERGY: Choice[] = [{ id: '', label: 'any energy' }, { id: 'low-ok', label: 'fine when tired' }, { id: 'needs-energy', label: 'needs energy' }]
type Family = { key: string; label: string; choices: Choice[]; ids: string[] }
const FAMILIES: Family[] = [
  { key: 'place', label: 'Where', choices: PLACES, ids: PLACES.map((c) => c.id).filter(Boolean) },
  { key: 'effort', label: 'Effort', choices: EFFORTS, ids: EFFORTS.map((c) => c.id).filter(Boolean) },
  { key: 'device', label: 'Device', choices: DEVICES, ids: DEVICES.map((c) => c.id).filter(Boolean) },
  { key: 'energy', label: 'Energy', choices: ENERGY, ids: ENERGY.map((c) => c.id).filter(Boolean) },
  { key: 'priority', label: 'Priority', choices: [{ id: '', label: 'normal' }, { id: 'high', label: 'high priority' }], ids: ['high'] },
  // Own category tag; unset = inherit from the folder (lib/category.ts).
  { key: 'category', label: 'Category', choices: [{ id: '', label: 'from folder' }, ...PROJECTS.map((p) => ({ id: p.id, label: p.label }))], ids: PROJECTS.map((p) => p.id) },
]
// A link whose label says nothing ("link", "Link2", "hhh", "444") shows its host instead.
const BLANK_LABEL = /^(link\d*|here|pc|launch|hhh|\d+)$/i
export const linkLabel = (label: string, url: string): string => {
  if (!BLANK_LABEL.test(label.trim())) return label
  try { return new URL(url).host.replace(/^www\./, '') } catch { return label }
}

const NEW = '__new__'
const TOP = '__top__'
const UNDO_MS = 5000
type SortKey = 'folder' | 'oldest' | 'newest' | 'links'
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'folder', label: 'by folder' }, { id: 'oldest', label: 'oldest first' },
  { id: 'newest', label: 'newest first' }, { id: 'links', label: 'with links first' },
]
const REVIEWED_KEY = () => 'rm-inbox-reviewed-' + dayKey()
const readReviewed = () => { try { return Number(localStorage.getItem(REVIEWED_KEY()) || 0) } catch { return 0 } }

/** Inbox items: Roadmap's own parked tasks (WF mirrors are parked by WF, not here). */
export const isInboxItem = (t: TaskRow) => t.kind === 'task' && t.tags.includes(PARKED_TAG) && !t.tags.includes(MIRROR_TAG)

const pickOf = (t: TaskRow, family: string[]) => t.tags.find((x) => family.includes(x)) ?? ''
const withPick = (t: TaskRow, family: string[], v: string) => [...t.tags.filter((x) => !family.includes(x)), ...(v ? [v] : [])]

type PendingKind = 'keep' | 'delete'
// `batch` groups items acted on together: one strip, one timer, one Undo.
type Pending = { kind: PendingKind; timer: number; batch?: string }
// Where an inline "new folder" field is open: a task id (move that task) or
// 'folder' (move the picked folder).
type NewFor = { target: string; title: string } | null

export function InboxView() {
  const tree = useStore((s) => s.tree)
  const resources = useStore((s) => s.resources)
  const updateTask = useStore((s) => s.updateTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const updateTasks = useStore((s) => s.updateTasks)
  const deleteTasks = useStore((s) => s.deleteTasks)
  const addFolder = useStore((s) => s.addFolder)
  const [folder, setFolder] = useState('all')   // a parent id, or 'all'
  const [pending, setPending] = useState<Map<string, Pending>>(new Map())
  const [newFor, setNewFor] = useState<NewFor>(null)
  const [live, setLive] = useState('')   // aria-live announcement
  const [open, setOpen] = useState<{ id: string; key: string } | null>(null)   // the one open pill picker
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)   // last checkbox clicked, for shift-ranges
  const [mode, setMode] = useState<'list' | 'review'>('list')
  const [sort, setSort] = useState<SortKey>('folder')
  const [cursor, setCursor] = useState(0)   // review position in the ordered list
  const [reviewed, setReviewed] = useState(readReviewed)
  const bumpReviewed = (n: number) => setReviewed((r) => {
    const v = Math.max(0, r + n)
    try { localStorage.setItem(REVIEWED_KEY(), String(v)) } catch { /* private mode: counter is per-visit */ }
    return v
  })

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
    else ok(updateTask(id, keptTags(t)))
  }
  // Keep = unpark, drop any stale mark, and remember it came through the Inbox
  // (KEPT_TAG) so stale recall can bring it back if it goes untouched.
  const keptTags = (t: TaskRow) => ({ tags: [...t.tags.filter((x) => x !== PARKED_TAG && x !== STALE_TAG && x !== KEPT_TAG), KEPT_TAG] })
  const unpark = (t: TaskRow) => ({ id: t.id, patch: keptTags(t) })
  const commitBatch = (ids: string[], kind: PendingKind) => {
    const rows = ids.map((id) => treeRef.current.find((x) => x.id === id)).filter((t): t is TaskRow => !!t)
    if (!rows.length) return
    if (kind === 'delete') ok(deleteTasks(rows.map((t) => t.id)))
    else ok(updateTasks(rows.map(unpark)))
  }
  const settle = (id: string) => setPending((m) => { const n = new Map(m); n.delete(id); return n })
  const settleMany = (ids: string[]) => setPending((m) => { const n = new Map(m); for (const id of ids) n.delete(id); return n })
  const pendBatch = (ts: TaskRow[], kind: PendingKind) => {
    const ids = ts.filter((t) => !pendingRef.current.has(t.id)).map((t) => t.id)
    if (!ids.length) return
    if (ids.length === 1) { pend(ts.find((t) => t.id === ids[0])!, kind); return }
    const batch = 'b' + Date.now().toString(36)
    const timer = window.setTimeout(() => { commitBatch(ids, kind); settleMany(ids) }, UNDO_MS)
    setPending((m) => { const n = new Map(m); for (const id of ids) n.set(id, { kind, timer, batch }); return n })
    bumpReviewed(ids.length)
    setSelected(new Set())
    setLive(`${kind === 'keep' ? 'Kept' : 'Deleted'} ${ids.length} items. Undo available.`)
  }
  const undoBatch = (batch: string) => {
    const ids = [...pendingRef.current].filter(([, p]) => p.batch === batch).map(([id]) => id)
    const p = pendingRef.current.get(ids[0])
    if (p) window.clearTimeout(p.timer)
    settleMany(ids)
    bumpReviewed(-ids.length)
    setLive(`Restored ${ids.length} items.`)
  }
  const pend = (t: TaskRow, kind: PendingKind) => {
    const prev = pendingRef.current.get(t.id)
    if (prev) window.clearTimeout(prev.timer)
    else bumpReviewed(1)
    const timer = window.setTimeout(() => { commit(t.id, kind); settle(t.id) }, UNDO_MS)
    setPending((m) => new Map(m).set(t.id, { kind, timer }))
    setLive(`${kind === 'keep' ? 'Kept' : 'Deleted'}: ${t.title}. Undo available.`)
  }
  const undo = (t: TaskRow) => {
    const p = pendingRef.current.get(t.id)
    if (p) { window.clearTimeout(p.timer); bumpReviewed(-1) }
    settle(t.id)
    setLive(`Restored: ${t.title}.`)
  }
  // Leaving the Inbox (tab switch, sign-out) commits whatever is still on a strip.
  useEffect(() => () => {
    const batches = new Map<string, { kind: PendingKind; ids: string[] }>()
    for (const [id, p] of pendingRef.current) {
      window.clearTimeout(p.timer)
      if (!p.batch) { commit(id, p.kind); continue }
      const b = batches.get(p.batch) ?? { kind: p.kind, ids: [] }
      b.ids.push(id)
      batches.set(p.batch, b)
    }
    for (const b of batches.values()) commitBatch(b.ids, b.kind)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(tree.map((t) => [t.id, t]))
  const items = tree.filter(isInboxItem)
  const titleOf = (id: string | null) => (id ? byId.get(id)?.title ?? '—' : '—')
  const pathOf = (g: TaskRow): string => (g.parent_id && byId.get(g.parent_id) ? pathOf(byId.get(g.parent_id)!) + ' › ' : '') + g.title
  const folderIds = [...new Set(items.map((t) => t.parent_id ?? ''))]
  const count = (fid: string) => items.filter((t) => (t.parent_id ?? '') === fid).length
  // Chip label: the folder's name, or "Parent › Name" when two inbox folders share a name.
  const chipLabel = (fid: string) => {
    const g = fid ? byId.get(fid) : undefined
    if (!g) return '—'
    const clash = folderIds.some((o) => o !== fid && titleOf(o || null) === g.title)
    const parent = g.parent_id ? byId.get(g.parent_id) : undefined
    return clash && parent ? `${parent.title} › ${g.title}` : g.title
  }
  const hasLinks = new Set(resources.map((r) => r.task_id))
  const order: Record<SortKey, (a: TaskRow, b: TaskRow) => number> = {
    folder: (a, b) => titleOf(a.parent_id).localeCompare(titleOf(b.parent_id)) || a.position - b.position,
    oldest: (a, b) => a.created_at.localeCompare(b.created_at) || a.position - b.position,
    newest: (a, b) => b.created_at.localeCompare(a.created_at) || a.position - b.position,
    links: (a, b) => Number(hasLinks.has(b.id)) - Number(hasLinks.has(a.id)) || order.folder(a, b),
  }
  const shown = items.filter((t) => folder === 'all' || (t.parent_id ?? '') === folder).sort(order[sort])
  const picked = folder !== 'all' ? byId.get(folder) : undefined
  // Selection only counts cards that are on screen and not on an Undo strip.
  const visible = shown.filter((t) => !pending.has(t.id))
  const sel = visible.filter((t) => selected.has(t.id))
  const at = visible.length ? Math.min(cursor, visible.length - 1) : 0
  const current = mode === 'review' ? visible[at] : undefined
  const step = (d: number) => setCursor(visible.length ? (at + d + visible.length) % visible.length : 0)
  const lastSingle = [...pending].filter(([, p]) => !p.batch).pop()?.[0]
  const toggle = (t: TaskRow, range: boolean) => {
    const next = new Set(selected)
    const on = !next.has(t.id)
    const a = range && anchor ? visible.findIndex((x) => x.id === anchor) : -1
    const b = visible.findIndex((x) => x.id === t.id)
    if (a >= 0 && b >= 0) for (const x of visible.slice(Math.min(a, b), Math.max(a, b) + 1)) on ? next.add(x.id) : next.delete(x.id)
    else on ? next.add(t.id) : next.delete(t.id)
    setSelected(next)
    setAnchor(t.id)
  }
  const allOn = visible.length > 0 && sel.length === visible.length
  const selectAll = () => setSelected(allOn ? new Set() : new Set(visible.map((t) => t.id)))
  // One strip per batch, counting only items in the current folder view.
  const batches = new Map<string, { kind: PendingKind; n: number }>()
  for (const t of shown) {
    const p = pending.get(t.id)
    if (!p?.batch) continue
    const b = batches.get(p.batch) ?? { kind: p.kind, n: 0 }
    b.n++
    batches.set(p.batch, b)
  }

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
  // Close the open picker on an outside click or Esc.
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest('.ib-pill-wrap')) setOpen(null) }
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  const endOf = (parent: string | null) => tree.filter((x) => x.parent_id === parent).length
  const reparent = (id: string, parent: string | null) => ok(updateTask(id, { parent_id: parent, position: endOf(parent) }))
  const reparentMany = (ts: TaskRow[], parent: string) => {
    const base = endOf(parent)
    ok(updateTasks(ts.map((t, i) => ({ id: t.id, patch: { parent_id: parent, position: base + i } }))))
    setSelected(new Set())
    setLive(`Moved ${ts.length} items to ${titleOf(parent)}.`)
  }
  const setRuleMany = (v: string) => {
    const [key, id] = v.split(':')
    const f = FAMILIES.find((x) => x.key === key)
    if (!f) return
    ok(updateTasks(sel.map((t) => ({ id: t.id, patch: { tags: withPick(t, f.ids, id) } }))))
    setLive(`Set ${f.label.toLowerCase()} on ${sel.length} items.`)
  }
  // A "Move to" pick: TOP → main list, NEW → open the inline field, else a folder id.
  const onMove = (target: string, v: string) => {
    if (!v) return
    if (v === NEW) { setNewFor({ target, title: '' }); return }
    const parent = v === TOP ? null : v
    if (target === 'folder') { if (picked && parent !== picked.id) reparent(picked.id, parent) }
    else if (target === 'selection') { if (parent !== null) reparentMany(sel, parent) }
    else if (parent !== null) reparent(target, parent)
  }
  const saveNew = async () => {
    if (!newFor) return
    const title = newFor.title.trim()
    if (!title) return
    const id = await addFolder(null, title)
    if (newFor.target === 'folder') { if (picked) reparent(picked.id, id) }
    else if (newFor.target === 'selection') reparentMany(sel, id)
    else reparent(newFor.target, id)
    setNewFor(null)
  }
  const keepAll = () => pendBatch(shown, 'keep')

  // Review-mode keys. Ignored while typing, in a select, or with a picker open.
  const keyRef = useRef<(e: globalThis.KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    if (mode !== 'review' || open || newFor) return
    const el = e.target as HTMLElement
    if (el.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key.toLowerCase()
    const effort: Record<string, string> = { '1': 'short-burst', '2': '', '3': 'deep-focus' }
    if (k === 'escape') setMode('list')
    else if (k === 'u') { const t = lastSingle && byId.get(lastSingle); if (t) undo(t) }
    else if (!current) return
    else if (k === 'k') pend(current, 'keep')
    else if (k === 'd') pend(current, 'delete')
    else if (k === 's' || k === 'arrowright') step(1)
    else if (k === 'arrowleft') step(-1)
    else if (k in effort) set(current, FAMILIES[1].ids, effort[k])
    else return
    e.preventDefault()
  }
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => keyRef.current(e)
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

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
        <div className="ib-tools">
          <div className="ib-modes" role="group" aria-label="View">
            {(['list', 'review'] as const).map((m) => (
              <button key={m} type="button" className={'ns-chip' + (mode === m ? ' on' : '')} aria-pressed={mode === m} onClick={() => { setMode(m); setCursor(0) }}>
                {m === 'list' ? 'List' : 'Review one by one'}
              </button>
            ))}
          </div>
          <select className="ns-sel" value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setCursor(0) }} aria-label="Sort">
            {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <span className="ns-note ib-count">{reviewed} decided today</span>
        </div>
        <div className="ib-folders">
          <button type="button" className={'vchip' + (folder === 'all' ? ' on' : '')} aria-pressed={folder === 'all'} onClick={() => setFolder('all')}>All <span className="n">{items.length}</span></button>
          {folderIds.map((fid) => (
            <button key={fid} type="button" className={'vchip' + (folder === fid ? ' on' : '')} aria-pressed={folder === fid} onClick={() => setFolder(fid)}>
              {chipLabel(fid)} <span className="n">{count(fid)}</span>
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

      {mode === 'review' && (
        <>
          {shown.filter((t) => pending.get(t.id) && !pending.get(t.id)!.batch).map((t) => (
            <div key={t.id} className={'ib-strip ' + pending.get(t.id)!.kind}>
              <span className="ib-strip-k">{pending.get(t.id)!.kind === 'keep' ? 'Kept' : 'Deleted'}</span>
              <span className="ib-strip-t">{t.title}</span>
              <button type="button" className="ns-chip" onClick={() => undo(t)}>Undo <kbd>u</kbd></button>
            </div>
          ))}
          {current ? (
            <ReviewCard
              t={current}
              pos={at + 1}
              total={visible.length}
              folder={titleOf(current.parent_id)}
              links={resources.filter((r) => r.task_id === current.id)}
              pills={FAMILIES.map((f) => (
                <Pill
                  key={f.key}
                  family={f}
                  value={pickOf(current, f.ids)}
                  open={open?.id === current.id && open.key === f.key}
                  onOpen={(o) => setOpen(o ? { id: current.id, key: f.key } : null)}
                  onPick={(v) => { set(current, f.ids, v); setOpen(null) }}
                />
              ))}
              onKeep={() => pend(current, 'keep')}
              onDelete={() => pend(current, 'delete')}
              onSkip={() => step(1)}
              onBack={() => step(-1)}
            />
          ) : shown.length > 0 && <p className="rv-empty">✓ Nothing left to review in this view.</p>}
        </>
      )}

      {mode === 'list' && visible.length > 0 && (
        <label className="ib-selall">
          <input type="checkbox" className="ib-check" checked={allOn} onChange={selectAll} />
          <span>{allOn ? 'Clear selection' : `Select all ${visible.length}`}</span>
          {sel.length > 0 && !allOn && <span className="ns-note">{sel.length} selected · shift-click selects a range</span>}
        </label>
      )}

      {[...batches].map(([batch, b]) => (
        <div key={batch} className={'ib-strip ' + b.kind}>
          <span className="ib-strip-k">{b.kind === 'keep' ? 'Kept' : 'Deleted'}</span>
          <span className="ib-strip-t">{b.n} items</span>
          <button type="button" className="ns-chip" onClick={() => undoBatch(batch)}>Undo</button>
        </div>
      ))}

      {mode === 'list' && <ul className="ib-list">
        {shown.map((t) => {
          const p = pending.get(t.id)
          if (p?.batch) return null
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
            <li key={t.id} className={'ib-item' + (selected.has(t.id) ? ' sel' : '')}>
              <div className="ib-top">
                <input
                  type="checkbox"
                  className="ib-check"
                  checked={selected.has(t.id)}
                  onChange={() => {}}
                  onClick={(e) => toggle(t, e.shiftKey)}
                  aria-label={`Select ${t.title}`}
                />
                <span className="ib-name">{t.title}</span>
                {t.tags.includes(STALE_TAG) && <span className="ib-stale" title={`Kept, then untouched for ${STALE_DAYS}+ days`}>back · untouched {STALE_DAYS}d</span>}
                {folder === 'all' && <span className="ib-folder">{titleOf(t.parent_id)}</span>}
              </div>
              {resources.some((r) => r.task_id === t.id) && (
                <div className="ib-links">
                  {resources.filter((r) => r.task_id === t.id).map((r) => (
                    <a key={r.id} className="ns-link" href={r.url} target="_blank" rel="noreferrer">{linkLabel(r.label, r.url)}</a>
                  ))}
                </div>
              )}
              <div className="ib-row">
                <div className="ib-pills">
                  {FAMILIES.map((f) => (
                    <Pill
                      key={f.key}
                      family={f}
                      value={pickOf(t, f.ids)}
                      open={open?.id === t.id && open.key === f.key}
                      onOpen={(o) => setOpen(o ? { id: t.id, key: f.key } : null)}
                      onPick={(v) => { set(t, f.ids, v); setOpen(null) }}
                    />
                  ))}
                </div>
                <div className="ib-actions">
                  <button type="button" className="ns-chip on" onClick={() => pend(t, 'keep')}>Keep</button>
                  <select className="ns-sel ib-move" value="" onChange={(e) => onMove(t.id, e.target.value)} aria-label="Move to folder">
                    <option value="">Move to…</option>
                    {moveOptions(false)}
                  </select>
                  <button type="button" className="ns-chip ib-del" onClick={() => pend(t, 'delete')}>Delete</button>
                </div>
              </div>
              {newField(t.id)}
            </li>
          )
        })}
      </ul>}

      {mode === 'list' && sel.length > 0 && (
        <div className="ib-bar" role="toolbar" aria-label="Selected items">
          <span className="ib-bar-n">{sel.length} selected</span>
          <button type="button" className="ns-chip on" onClick={() => pendBatch(sel, 'keep')}>Keep</button>
          <select className="ns-sel" value="" onChange={(e) => onMove('selection', e.target.value)} aria-label="Move selected to folder">
            <option value="">Move to…</option>
            {moveOptions(false)}
          </select>
          <select className="ns-sel" value="" onChange={(e) => { if (e.target.value) setRuleMany(e.target.value) }} aria-label="Set a rule on selected">
            <option value="">Set rule…</option>
            {FAMILIES.map((f) => (
              <optgroup key={f.key} label={f.label}>
                {f.choices.map((c) => <option key={c.id || 'none'} value={`${f.key}:${c.id}`}>{c.label}</option>)}
              </optgroup>
            ))}
          </select>
          <button type="button" className="ns-chip ib-del" onClick={() => pendBatch(sel, 'delete')}>Delete</button>
          <button type="button" className="ns-chip" onClick={() => setSelected(new Set())}>Clear</button>
          {newField('selection')}
        </div>
      )}
    </section>
  )
}

// A rule as a tag pill. Unset shows the family's default, muted. Tapping
// opens a picker of 44 px rows; arrows move, Enter picks, Esc closes.
function Pill({ family, value, open, onOpen, onPick }: {
  family: Family; value: string; open: boolean; onOpen: (o: boolean) => void; onPick: (v: string) => void
}) {
  const cur = family.choices.find((c) => c.id === value) ?? family.choices[0]
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) (listRef.current?.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus()
  }, [open])
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus() }
  }
  return (
    <span className="ib-pill-wrap">
      <button
        type="button"
        className={'ib-pill' + (value ? ' set' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${family.label}: ${cur.label}`}
        onClick={() => onOpen(!open)}
      >
        {cur.label}
      </button>
      {open && (
        <div ref={listRef} className="ib-pop" role="listbox" aria-label={family.label} onKeyDown={onKey}>
          <div className="ib-pop-h">{family.label}</div>
          {family.choices.map((c) => (
            <div
              key={c.id || 'none'}
              role="option"
              tabIndex={-1}
              aria-selected={c.id === cur.id}
              className={'ib-opt' + (c.id === cur.id ? ' on' : '')}
              onClick={() => onPick(c.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(c.id) } }}
            >
              {c.label}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}

// One item, large, with the engine's current context beside it.
function ReviewCard({ t, pos, total, folder, links, pills, onKeep, onDelete, onSkip, onBack }: {
  t: TaskRow; pos: number; total: number; folder: string
  links: { id: string; label: string; url: string }[]
  pills: ReactNode
  onKeep: () => void; onDelete: () => void; onSkip: () => void; onBack: () => void
}) {
  const where = resolvePlace()
  const energy = readCheckin()?.energy ?? 'not checked in'
  return (
    <article className="ib-review" aria-label={`Reviewing ${pos} of ${total}`}>
      <div className="ib-rv-meta">
        <span>{pos} / {total} · {folder}</span>
        <span>Right now: {where.src === 'none' ? 'place unknown' : where.label} · energy {energy}</span>
      </div>
      <h3 className="ib-rv-title">{t.title}</h3>
      {t.tags.includes(STALE_TAG) && <span className="ib-stale">Kept, then untouched for {STALE_DAYS}+ days — still worth it?</span>}
      {links.length > 0 && (
        <div className="ib-links">
          {links.map((r) => <a key={r.id} className="ns-link" href={r.url} target="_blank" rel="noreferrer">{linkLabel(r.label, r.url)}</a>)}
        </div>
      )}
      <div className="ib-pills">{pills}</div>
      <p className="ns-note ib-keys">Keys: <kbd>1</kbd> quick · <kbd>2</kbd> medium · <kbd>3</kbd> deep effort · <kbd>u</kbd> undo · <kbd>Esc</kbd> list</p>
      <div className="ib-rv-actions">
        <button type="button" className="ns-chip" onClick={onBack}>Back <kbd>←</kbd></button>
        <button type="button" className="ns-chip ib-del" onClick={onDelete}>Delete <kbd>d</kbd></button>
        <button type="button" className="ns-chip" onClick={onSkip}>Skip <kbd>s</kbd></button>
        <button type="button" className="ns-chip on" onClick={onKeep}>Keep <kbd>k</kbd></button>
      </div>
    </article>
  )
}
