// Phone pieces for the Inbox: a bottom sheet, the Move sheet (recent folders
// first, then a filterable list), swipe on the review card, and long-press to
// select a row. The desktop Inbox keeps its selects and full cards.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'

export const TOP = '__top__'
const RECENT_KEY = 'rm-inbox-recent-moves'
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }
const pushRecent = (id: string) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 4))) } catch { /* private mode */ }
}

/** A panel that slides up from the bottom; tap outside or Esc closes it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="ib-sheet-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ib-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ib-sheet-h">
          <strong>{title}</strong>
          <button type="button" className="ns-chip" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export type Target = { id: string; path: string }

/** Pick a folder: recent ones first, a filter box, then every folder by path. */
export function MoveSheet({ title, targets, allowTop, onPick, onNew, onClose }: {
  title: string; targets: Target[]; allowTop: boolean
  onPick: (id: string) => void; onNew: (name: string) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [name, setName] = useState<string | null>(null)
  const byId = new Map(targets.map((t) => [t.id, t]))
  const recent = readRecent().map((id) => byId.get(id)).filter((t): t is Target => !!t)
  const shown = q.trim() ? targets.filter((t) => t.path.toLowerCase().includes(q.trim().toLowerCase())) : targets
  const pick = (id: string) => { if (id !== TOP) pushRecent(id); onPick(id); onClose() }
  return (
    <Sheet title={title} onClose={onClose}>
      {name === null ? (
        <>
          <input className="ib-input ib-sheet-q" placeholder="Find a folder" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a folder" />
          <div className="ib-sheet-list">
            {!q && recent.length > 0 && (
              <>
                <div className="ib-pop-h">Recent</div>
                {recent.map((t) => <button key={'r' + t.id} type="button" className="ib-opt" onClick={() => pick(t.id)}>{t.path}</button>)}
                <div className="ib-pop-h">All folders</div>
              </>
            )}
            {allowTop && !q && <button type="button" className="ib-opt" onClick={() => pick(TOP)}>Main list (top level)</button>}
            {shown.map((t) => <button key={t.id} type="button" className="ib-opt" onClick={() => pick(t.id)}>{t.path}</button>)}
            {shown.length === 0 && <p className="ns-note ib-sheet-none">No folder matches “{q}”.</p>}
          </div>
          <button type="button" className="ns-chip ib-sheet-new" onClick={() => setName(q.trim())}>＋ New folder{q.trim() ? ` “${q.trim()}”` : '…'}</button>
        </>
      ) : (
        <form className="ib-new" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onNew(name.trim()); onClose() } }}>
          <input className="ib-input" autoFocus placeholder="New folder name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New folder name" />
          <button type="submit" className="ns-chip on" disabled={!name.trim()}>Create &amp; move</button>
          <button type="button" className="ns-chip" onClick={() => setName(null)}>Back</button>
        </form>
      )}
    </Sheet>
  )
}

const SWIPE_PX = 90
/** Horizontal swipe: right past the line → onRight, left → onLeft. Taps on
 *  buttons, links and inputs are left alone; vertical drags scroll. */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const [dx, setDx] = useState(0)
  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    if ((e.target as Element).closest('button, a, input, select, textarea, .ib-pop')) return
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    const x = e.clientX - s.x
    if (Math.abs(x) < 8 || Math.abs(x) < Math.abs(e.clientY - s.y)) return
    setDx(x)
  }
  const end = () => {
    const x = dx
    start.current = null
    setDx(0)
    if (x >= SWIPE_PX) onRight()
    else if (x <= -SWIPE_PX) onLeft()
  }
  const dir = dx >= SWIPE_PX ? 'right' : dx <= -SWIPE_PX ? 'left' : dx > 0 ? 'r' : dx < 0 ? 'l' : ''
  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: () => { start.current = null; setDx(0) } },
    style: dx ? { transform: `translateX(${dx}px) rotate(${dx / 40}deg)` } : undefined,
    dir,
  }
}

/** Press and hold (450 ms) without moving → onLong; a normal tap → onTap. */
export function useLongPress(onLong: () => void, onTap: () => void) {
  const timer = useRef<number | null>(null)
  const fired = useRef(false)
  const at = useRef<{ x: number; y: number } | null>(null)
  const clear = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null }
  return {
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      if ((e.target as Element).closest('button, a, input, select')) return
      fired.current = false
      at.current = { x: e.clientX, y: e.clientY }
      timer.current = window.setTimeout(() => { fired.current = true; onLong() }, 450)
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      if (at.current && Math.hypot(e.clientX - at.current.x, e.clientY - at.current.y) > 10) clear()
    },
    onPointerUp: (e: RPointerEvent<HTMLElement>) => {
      clear()
      if (!fired.current && at.current && !(e.target as Element).closest('button, a, input, select')) onTap()
      at.current = null
    },
    onPointerCancel: () => { clear(); at.current = null },
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  }
}
