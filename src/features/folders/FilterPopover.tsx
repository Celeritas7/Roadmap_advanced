import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store/useStore.ts'
import { useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { CONTEXTS_BY_FAMILY } from '../../seed.ts'

// The three context families and how each behaves when active. Where/Mode
// HIDE non-matching tasks; Priority DIMS them (~30%) but keeps them on screen.
// (Hide/dim is enforced in store/selectors.ts → passingTaskIds.)
const GROUPS = [
  { family: 'where' as const, label: 'Where', mode: 'hides others' },
  { family: 'mode' as const, label: 'Mode', mode: 'hides others' },
  { family: 'priority' as const, label: 'Priority', mode: 'dims others' },
]

export function FilterPopover() {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)
  const filters = useStore((s) => s.filters)
  const toggleFilter = useStore((s) => s.toggleFilter)
  const active = filters.contexts.size
  const isMobile = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    // Desktop only: click-outside / Escape dismiss. On mobile the sheet is
    // portaled outside `wrap`, so this would mis-fire — the backdrop and the
    // close button handle dismissal there instead.
    if (!open || isMobile) return
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
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
  }, [open, isMobile])

  // Shared panel. On desktop it renders in place (absolute popover). On mobile
  // it's portaled (with a backdrop) into the `.rm` root — escaping the header's
  // `backdrop-filter`, which would otherwise be the containing block for the
  // absolute-positioned sheet and anchor it to the header instead of the viewport.
  const panel = (
    <div className="filter-pop" role="dialog" aria-label="Filters">
      <div className="filter-head">
        <h4>Filter</h4>
        <button
          type="button"
          className="filter-close"
          aria-label="Close filters"
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </div>
      {GROUPS.map((g) => (
        <div className="filter-group" key={g.family}>
          <div className="filter-glabel">
            {g.label}
            <span className="tag-mode">{g.mode}</span>
          </div>
          <div className="filter-opts">
            {CONTEXTS_BY_FAMILY[g.family].map((it) => (
              <FilterChip
                key={it.id}
                label={it.label}
                active={filters.contexts.has(it.id)}
                prio={g.family === 'priority'}
                onClick={() => toggleFilter('context', it.id)}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="filter-foot">
        <span className="ct">{active === 0 ? 'no filters' : `${active} active`}</span>
        <button
          type="button"
          className="rm-clear"
          disabled={!active}
          onClick={() => {
            for (const id of Array.from(filters.contexts)) toggleFilter('context', id)
          }}
        >
          Clear all
        </button>
      </div>
    </div>
  )

  const portalTarget = wrap.current?.closest('.rm') ?? null

  return (
    <div className="filterwrap" ref={wrap}>
      <button
        type="button"
        className={'rm-btn' + (active ? ' live' : '')}
        aria-label="Filter"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1 3h12M3 7h8M5 11h4" />
        </svg>
        <span>Filter</span>
        {active > 0 && <span className="badge">{active}</span>}
      </button>
      {open &&
        (isMobile && portalTarget
          ? createPortal(
              <>
                <div className="filter-backdrop" onClick={() => setOpen(false)} aria-hidden />
                {panel}
              </>,
              portalTarget,
            )
          : panel)}
    </div>
  )
}

function FilterChip({
  active,
  label,
  prio,
  onClick,
}: {
  active: boolean
  label: string
  prio: boolean
  onClick: () => void
}) {
  const at = label.startsWith('@')
  return (
    <button
      type="button"
      className={'fchip' + (active ? ' on' : '') + (prio ? ' prio' : '')}
      onClick={onClick}
    >
      {at ? (
        <>
          <span className="at">@</span>
          {label.slice(1)}
        </>
      ) : (
        label
      )}
    </button>
  )
}
