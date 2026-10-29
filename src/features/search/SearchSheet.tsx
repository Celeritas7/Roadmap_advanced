// Search every task and folder by a word. Opened from the header 🔍, ⌘K /
// Ctrl+K anywhere, or "/" when not typing. ↑ ↓ move, Enter opens, Esc closes.
// Opening a result:
//   · an Inbox item  → the Inbox, on its folder, with the item highlighted
//   · an Inbox folder → the Inbox on that folder
//   · anything else  → its category's plan page, scrolled to the task
//   · no category    → Home
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import { searchTasks, type SearchHit } from '../../lib/search.ts'
import { categoryIndex } from '../../lib/category.ts'
import { isInboxItem } from '../inbox/InboxView.tsx'
import { MIRROR_TAG } from '../../lib/rmHub.ts'
import { PROJECT_BY_ID } from '../../seed.ts'
import type { TaskRow } from '../../types.ts'

export function openHit(t: TaskRow) {
  const st = useStore.getState()
  const byId = new Map(st.tree.map((x) => [x.id, x]))
  let root: TaskRow | undefined = t
  for (let i = 0; root?.parent_id && i < 64; i++) root = byId.get(root.parent_id)
  const inInbox = !!root?.tags.includes('inbox')
  st.setSearchOpen(false)
  if (isInboxItem(t)) {
    useStore.setState({ view: 'inbox', inboxFolder: t.parent_id ?? 'all', focusId: t.id })
    return
  }
  if (t.kind === 'group' && inInbox) {
    useStore.setState({ view: 'inbox', inboxFolder: t.id === root?.id ? 'all' : t.id })
    return
  }
  const cat = categoryIndex(st.tree).get(t.id)
  if (cat) {
    window.location.href = `${window.location.pathname}?plan=${cat}&focus=${encodeURIComponent(t.id)}`
    return
  }
  useStore.setState({ view: 'home' })
}

// Wrap each matched word in <mark>.
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const n = text.normalize('NFKC').toLowerCase()
  const marks = new Array(text.length).fill(false)
  if (n.length === text.length) {
    for (const w of terms) {
      for (let i = n.indexOf(w); i >= 0; i = n.indexOf(w, i + 1)) for (let k = i; k < i + w.length; k++) marks[k] = true
    }
  }
  const out: { s: string; m: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1]
    if (last && last.m === marks[i]) last.s += text[i]
    else out.push({ s: text[i], m: marks[i] })
  }
  return <>{out.map((p, i) => (p.m ? <mark key={i}>{p.s}</mark> : <span key={i}>{p.s}</span>))}</>
}

export function SearchSheet() {
  const open = useStore((s) => s.searchOpen)
  const setOpen = useStore((s) => s.setSearchOpen)
  const tree = useStore((s) => s.tree)
  const resources = useStore((s) => s.resources)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => { if (open) { setQ(''); setAt(0); input.current?.focus() } }, [open])
  const hits: SearchHit[] = useMemo(() => (open ? searchTasks(tree, q, resources) : []), [open, tree, q, resources])
  const cats = useMemo(() => (open ? categoryIndex(tree) : new Map()), [open, tree])
  useEffect(() => { setAt(0) }, [q])
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [at])

  if (!open) return null
  const terms = q.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(i + 1, hits.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && hits[at]) { e.preventDefault(); openHit(hits[at].t) }
  }

  return (
    <div className="cap-backdrop srch-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="cap-sheet srch" role="dialog" aria-modal="true" aria-label="Search tasks">
        <div className="cap-row">
          <input
            ref={input}
            className="cap-input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search tasks, folders, links…"
            aria-label="Search tasks"
            aria-controls="srch-list"
            aria-activedescendant={hits[at] ? 'srch-' + hits[at].t.id : undefined}
            enterKeyHint="search"
            autoComplete="off"
          />
          <button type="button" className="ns-chip" onClick={() => setOpen(false)}>Close</button>
        </div>
        {!terms.length ? (
          <p className="cap-preview">Type any word. Every word must match the title, folder or a link. <kbd>↑</kbd><kbd>↓</kbd> move, <kbd>Enter</kbd> opens.</p>
        ) : hits.length === 0 ? (
          <p className="cap-preview">Nothing matches “{q.trim()}”.</p>
        ) : (
          <>
            <p className="cap-preview" aria-live="polite">{hits.length === 40 ? 'Top 40 matches' : `${hits.length} match${hits.length === 1 ? '' : 'es'}`}</p>
            <ul id="srch-list" ref={list} className="srch-list" role="listbox" aria-label="Results">
              {hits.map((h, i) => {
                const cat = cats.get(h.t.id)
                const where = isInboxItem(h.t) ? 'Inbox' : cat ? PROJECT_BY_ID[cat]?.label : ''
                return (
                  <li
                    key={h.t.id}
                    id={'srch-' + h.t.id}
                    role="option"
                    aria-selected={i === at}
                    className={'srch-hit' + (i === at ? ' on' : '') + (h.t.done ? ' done' : '')}
                    onMouseEnter={() => setAt(i)}
                    onClick={() => openHit(h.t)}
                  >
                    <span className="srch-t">
                      {h.t.kind === 'group' && <span className="srch-k">folder</span>}
                      <Highlight text={h.t.title} terms={terms} />
                    </span>
                    <span className="srch-sub">
                      {where && <span className={'srch-badge' + (where === 'Inbox' ? ' ib' : '')}>{where}</span>}
                      {h.t.done && <span className="srch-badge">done</span>}
                      {h.t.tags.includes(MIRROR_TAG) && <span className="srch-badge">Weekly Focus</span>}
                      {h.path && <span className="srch-path"><Highlight text={h.path} terms={terms} /></span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
