// Quick capture sheet — opened from the header "＋", the `c` key, or a
// `?capture` link. One line per Enter; the box clears and stays open for the
// next thought. Each capture lands parked in Captured › <guessed folder> and
// can be undone for a few seconds. A live preview shows where it will go.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import { guessCapture, isNetworkError, NETWORK_MESSAGE, splitCapture } from '../../lib/capture.ts'

const UNDO_MS = 6000
type Recent = { id: string; title: string; folder: string; timer: number }

const TAG_LABEL: Record<string, string> = { outside: 'outside', 'short-burst': 'quick', keyboard: 'laptop', high: 'high priority' }

export function CaptureSheet() {
  const open = useStore((s) => s.captureOpen)
  const setOpen = useStore((s) => s.setCaptureOpen)
  const capture = useStore((s) => s.capture)
  const deleteTask = useStore((s) => s.deleteTask)
  const openCaptured = useStore((s) => s.openCaptured)
  const [line, setLine] = useState('')
  const [recent, setRecent] = useState<Recent[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(0)   // captures since the sheet opened
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) { setSaved(0); input.current?.focus() } }, [open])
  // Clear pending timers if the app unmounts.
  const recentRef = useRef(recent)
  recentRef.current = recent
  useEffect(() => () => { for (const r of recentRef.current) window.clearTimeout(r.timer) }, [])

  if (!open) return null
  const pieces = splitCapture(line)
  const g = pieces.length === 1 ? guessCapture(pieces[0]) : null

  const save = async () => {
    const pieces = splitCapture(line)
    if (!pieces.length) return
    setLine('')
    setError('')
    const failed: string[] = []
    let err: unknown = null
    // One at a time, in order; a piece that fails goes back in the box.
    for (const text of pieces) {
      try {
        const res = await capture(text)
        if (!res) continue
        const title = guessCapture(text)!.title
        const timer = window.setTimeout(() => setRecent((rs) => rs.filter((r) => r.id !== res.id)), UNDO_MS)
        setRecent((rs) => [{ id: res.id, title, folder: res.folder, timer }, ...rs].slice(0, 6))
        setSaved((n) => n + 1)
      } catch (e) {
        failed.push(text)
        err = e
      }
    }
    if (failed.length) {
      setLine(failed.join(', '))   // keep what didn't save so nothing is lost
      const msg = isNetworkError(err) ? NETWORK_MESSAGE : `Couldn't save: ${(err as Error)?.message || 'unknown error'}. Your text is kept.`
      setError(failed.length < pieces.length ? `${pieces.length - failed.length} saved. ${msg}` : msg)
    }
    input.current?.focus()
  }
  const undo = (r: Recent) => {
    window.clearTimeout(r.timer)
    setRecent((rs) => rs.filter((x) => x.id !== r.id))
    setSaved((n) => Math.max(0, n - 1))
    void deleteTask(r.id).catch(() => {})
  }

  return (
    <div className="cap-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="cap-sheet" role="dialog" aria-modal="true" aria-label="Quick capture">
        <form onSubmit={(e) => { e.preventDefault(); void save() }} className="cap-row">
          <input
            ref={input}
            className="cap-input"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
            placeholder="buy tissues · visit Itoya · fix Cost login !"
            aria-label="Capture a task"
            enterKeyHint="done"
            autoComplete="off"
          />
          <button type="submit" className="ns-chip on" disabled={!pieces.length}>{pieces.length > 1 ? `Add ${pieces.length}` : 'Add'}</button>
          <button type="button" className="ns-chip" onClick={() => setOpen(false)} aria-label="Close">Done</button>
        </form>
        <p className="cap-preview" aria-live="polite">
          {pieces.length > 1
            ? <>→ Inbox · <strong>{pieces.length} separate items</strong> (split at commas)</>
            : g
            ? <>→ Inbox › <strong>{g.folder}</strong>{g.tags.map((t) => ` · ${TAG_LABEL[t] ?? t}`).join('')}</>
            : <>Saved items wait in the <strong>Inbox</strong> under Captured. Commas make separate items. <kbd>!</kbd> marks high priority.</>}
        </p>
        {error && <p className="cap-error" role="alert">{error}</p>}
        {recent.length > 0 && (
          <ul className="cap-recent">
            {recent.map((r) => (
              <li key={r.id}>
                <span className="cap-k">Captured</span>
                <span className="cap-t">{r.title}</span>
                <span className="cap-f">Inbox › {r.folder}</span>
                <button type="button" className="ns-chip" onClick={() => undo(r)}>Undo</button>
              </li>
            ))}
          </ul>
        )}
        {saved > 0 && (
          <button type="button" className="ns-chip cap-see" onClick={openCaptured}>
            See {saved === 1 ? 'it' : `all ${saved}`} in Inbox →
          </button>
        )}
      </div>
    </div>
  )
}
