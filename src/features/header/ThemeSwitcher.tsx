import { useStore } from '../../store/useStore.ts'
import type { ThemeName } from '../../store/useStore.ts'

type Option = { id: ThemeName; label: string }

const OPTIONS: Option[] = [
  { id: 'trailhead', label: 'Trailhead — light' },
  { id: 'summit', label: 'Summit — dark' },
  { id: 'fieldguide', label: 'Field Guide — editorial' },
]

function Icon({ id }: { id: ThemeName }) {
  // stroke=currentColor → inherits the button's color (ink-3, or accent when active)
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (id === 'trailhead')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  if (id === 'summit')
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" />
    </svg>
  )
}

export function ThemeSwitcher() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  return (
    <div className="rm-theme-switch" role="group" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`rm-theme-btn${theme === o.id ? ' active' : ''}`}
          aria-pressed={theme === o.id}
          title={o.label}
          onClick={() => setTheme(o.id)}
        >
          <Icon id={o.id} />
        </button>
      ))}
    </div>
  )
}
