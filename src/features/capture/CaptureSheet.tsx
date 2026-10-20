// Quick capture sheet — opened from the header "＋", the `c` key, or a
// `?capture` link. One line per Enter; the box clears and stays open for the
// next thought. Each capture lands parked in Captured › <guessed folder> and
// can be undone for a few seconds. A live preview shows where it will go.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import { guessCapture } from '../../lib/capture.ts'

const UNDO_MS = 6000
type Recent = { id: string; title: string; folder: string; timer: number }

const TAG_LABEL: Record<string, string> = { outside: 'outside', 'short-burst': 'quick', keyboard: 'laptop', high: 'high priority' }

export function CaptureSheet() {
  const open = useStore((s) => s.captureOpen)
  const setOpen = useStore((s) => s.setCaptureOpen)
  const capture = useStore((s) => s.capture)
  const deleteTask = useStore((s) => s.deleteTask)
  const [line, setLine] = useState('')
  const [recent, setRecent] = useState<Recent[]>([])
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) input.current?.focus() }, [open])
  // Clear pending timers if the app unmounts.
  const recentRef = useRef(recent)
  recentRef.current = recent
  useEffect(() => () => { for (const r of recentRef.current) window.clearTimeout(r.timer) }, [])

  if (!open) return null
  const g = guessCapture(line)

  const save = async () => {
    const text = line
    if (!guessCapture(text)) return
    setLine('')
    setError('')
    try {
      const res = await capture(text)
      if (!res) return
      const title = guessCapture(text)!.title
      const timer = window.setTimeout(() => setRecent((rs) => rs.filter((r) => r.id !== res.id)), UNDO_MS)
      setRecent((rs) => [{ id: res.id, title, folder: res.folder, timer }, ...rs].slice(0, 4))
    } catch (e) {
      setLine(text)   // keep what was typed so nothing is lost
      setError((e as Error).message || "Couldn't save — try again.")
    }
    input.current?.focus()
  }
  const undo = (r: Recent) => {
    window.clearTimeout(r.timer)
    setRecent((rs) => rs.filter((x) => x.id !== r.id))
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
          <button type="submit" className="ns-chip on" disabled={!g}>Add</button>
          <button type="button" className="ns-chip" onClick={() => setOpen(false)} aria-label="Close">Done</button>
        </form>
        <p className="cap-preview" aria-live="polite">
          {g
            ? <>→ <strong>{g.folder}</strong>{g.tags.map((t) => ` · ${TAG_LABEL[t] ?? t}`).join('')} · parked in Inbox</>
            : <>Enter saves and keeps the box open. <kbd>!</kbd> marks high priority. Esc closes.</>}
        </p>
        {error && <p className="cap-error" role="alert">{error}</p>}
        {recent.length > 0 && (
          <ul className="cap-recent">
            {recent.map((r) => (
              <li key={r.id}>
                <span className="cap-k">Captured</span>
                <span className="cap-t">{r.title}</span>
                <span className="cap-f">{r.folder}</span>
                <button type="button" className="ns-chip" onClick={() => undo(r)}>Undo</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
