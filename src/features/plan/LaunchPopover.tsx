// V2-I — NEW FILE src/features/plan/LaunchPopover.tsx
// The ↗ launch affordance on a road stop + its resource popover.
// Click: 1 resource → launch directly; 0 or 2+ → popover (list + add/delete).
// Right-click (or long-press context menu) always opens the popover, so
// single-resource tasks stay editable.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import { launchResource, showToast } from './launch.ts'

export function LaunchPopover({ taskId, taskTitle, cooledLabel = null }: { taskId: string; taskTitle: string; cooledLabel?: string | null }) {
  const resources = useStore((s) => s.resources)
  const addResource = useStore((s) => s.addResource)
  const deleteResource = useStore((s) => s.deleteResource)
  const mine = resources
    .filter((r) => r.task_id === taskId)
    .sort((a, b) => a.position - b.position)
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onClick = () => {
    if (cooledLabel && mine.length) {
      showToast(cooledLabel)
      return
    }
    if (mine.length === 1) launchResource(mine[0], taskId)
    else setOpen((v) => !v)
  }

  const commitAdd = () => {
    const u = url.trim()
    if (!u) {
      setAdding(false)
      return
    }
    const fallback = u.replace(/^https?:\/\//i, '').slice(0, 40)
    void addResource(taskId, label.trim() || fallback, u).catch(() => {})
    setLabel('')
    setUrl('')
    setAdding(false)
  }

  return (
    <div className="lr-launchwrap" ref={ref}>
      <button
        type="button"
        className={'lr-launch' + (mine.length ? ' has' : '') + (cooledLabel ? ' cool' : '')}
        aria-label={
          mine.length === 1
            ? `Open ${mine[0].label} for "${taskTitle}"`
            : `Resources for "${taskTitle}" (${mine.length})`
        }
        aria-expanded={open}
        title={mine.length === 1 ? mine[0].label : 'Resources'}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
      >
        ↗{mine.length > 1 && <span className="n">{mine.length}</span>}
      </button>
      {open && (
        <div className="lr-pop" role="menu" aria-label={`Resources for ${taskTitle}`}>
          {mine.map((r) => (
            <div key={r.id} className="lr-popitem">
              <button
                type="button"
                className="lr-poplaunch"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  launchResource(r, taskId)
                }}
              >
                <span className="ic" aria-hidden="true">{r.kind === 'app' ? '📱' : '🌐'}</span>
                <span className="lb">{r.label}</span>
              </button>
              <button
                type="button"
                className="lr-popdel"
                aria-label={`Remove ${r.label}`}
                onClick={() => void deleteResource(r.id).catch(() => {})}
              >
                ×
              </button>
            </div>
          ))}
          {!mine.length && !adding && <p className="lr-popempty">No links yet.</p>}
          {adding ? (
            <div className="lr-popform">
              <input
                autoFocus
                placeholder="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              />
              <input
                placeholder="https://… or app://"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitAdd()
                  } else if (e.key === 'Escape') setAdding(false)
                }}
              />
              <button type="button" className="lr-popadd" onClick={commitAdd}>Add</button>
            </div>
          ) : (
            <button type="button" className="lr-popaddrow" onClick={() => setAdding(true)}>
              ＋ Add link
            </button>
          )}
        </div>
      )}
    </div>
  )
}
