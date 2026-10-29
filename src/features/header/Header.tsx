// V2-B — FULL REPLACEMENT for src/features/header/Header.tsx
// Delta vs current: Home|Plan tabs between the ⌘K hint and the mood line.
import { useState } from 'react'
import { format, getISOWeek } from 'date-fns'
import { ROLE_BY_ID } from '../../seed.ts'
import { useEffectiveRoleId } from '../../hooks/useEffectiveRoleId.ts'
import { useStore } from '../../store/useStore.ts'
import { SettingsModal } from '../settings/SettingsModal.tsx'
import { WeeklySync } from './WeeklySync.tsx'
import { isInboxItem } from '../inbox/InboxView.tsx'

export function Header() {
  // The mood tagline tracks the effective (single) role — shared derivation so
  // it can't drift from the data-role wash / active chip.
  const effId = useEffectiveRoleId()
  const mood = ROLE_BY_ID[effId]?.mood ?? ''
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const inboxCount = useStore((s) => s.tree.filter(isInboxItem).length)
  const setCaptureOpen = useStore((s) => s.setCaptureOpen)
  const setSearchOpen = useStore((s) => s.setSearchOpen)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const today = new Date()
  const pill = format(today, 'EEE · MMM d')
  const week = `Week ${getISOWeek(today)}`

  return (
    <div className="rm-toprow">
      <div className="rm-brand">
        <h1 className="rm-mark">
          <span className="glyph">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="5" cy="19" r="2.4" fill="var(--accent)" stroke="none" />
              <circle cx="19" cy="5" r="2.4" />
              <path d="M5 16.6C5 11 9 9 12 9s5-1.6 5-4" strokeDasharray="0.1 3.4" />
            </svg>
          </span>
          <span className="rm-word">Roadmap</span>
        </h1>
        <button type="button" className="rm-kbd" onClick={() => setSearchOpen(true)}>⌘K to search</button>
        {/* V2-B nav: Home | Plan (Contexts parked) */}
        <div className="rm-tabs" role="tablist" aria-label="View">
          {(['home', 'plan', 'inbox'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={'rm-tab' + (view === id ? ' active' : '')}
              onClick={() => setView(id)}
            >
              {id === 'home' ? 'Home' : id === 'plan' ? 'Plan' : 'Inbox'}
              {id === 'inbox' && inboxCount > 0 && <span className="n">{inboxCount}</span>}
            </button>
          ))}
        </div>
        <span className="rm-mood">{mood}</span>
      </div>
      <div className="rm-meta">
        <span className="rm-datepill">{pill}</span>
        <span className="rm-week">{week}</span>
        <button
          type="button"
          className="rm-search"
          title="Search (⌘K or /)"
          aria-label="Search tasks"
          aria-haspopup="dialog"
          onClick={() => setSearchOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        </button>
        <button
          type="button"
          className="rm-capture"
          title="Quick capture (c)"
          aria-haspopup="dialog"
          onClick={() => setCaptureOpen(true)}
        >
          ＋<span className="rm-capture-l"> Capture</span>
        </button>
        <WeeklySync />
        {/* V2-V: the theme switcher moved into Settings · Appearance. */}
        <button
          type="button"
          className="rm-gear"
          aria-label="Settings"
          title="Settings"
          aria-haspopup="dialog"
          onClick={() => setSettingsOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
