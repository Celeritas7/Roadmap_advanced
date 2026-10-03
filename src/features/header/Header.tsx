// V2-B — FULL REPLACEMENT for src/features/header/Header.tsx
// Delta vs current: Home|Plan tabs between the ⌘K hint and the mood line.
import { format, getISOWeek } from 'date-fns'
import { ROLE_BY_ID } from '../../seed.ts'
import { useEffectiveRoleId } from '../../hooks/useEffectiveRoleId.ts'
import { useStore } from '../../store/useStore.ts'
import { ThemeSwitcher } from './ThemeSwitcher.tsx'
import { WeeklySync } from './WeeklySync.tsx'

export function Header() {
  // The mood tagline tracks the effective (single) role — shared derivation so
  // it can't drift from the data-role wash / active chip.
  const effId = useEffectiveRoleId()
  const mood = ROLE_BY_ID[effId]?.mood ?? ''
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)

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
          Roadmap
        </h1>
        <span className="rm-kbd">⌘K to jump</span>
        {/* V2-B nav: Home | Plan (Contexts parked) */}
        <div className="rm-tabs" role="tablist" aria-label="View">
          {(['home', 'plan'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={'rm-tab' + (view === id ? ' active' : '')}
              onClick={() => setView(id)}
            >
              {id === 'home' ? 'Home' : 'Plan'}
            </button>
          ))}
        </div>
        <span className="rm-mood">{mood}</span>
      </div>
      <div className="rm-meta">
        <span className="rm-datepill">{pill}</span>
        <span className="rm-week">{week}</span>
        <WeeklySync />
        <ThemeSwitcher />
      </div>
    </div>
  )
}
