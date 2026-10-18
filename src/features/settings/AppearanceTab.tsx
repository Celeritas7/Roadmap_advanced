import { useStore } from '../../store/useStore.ts'
import { THEME_OPTIONS, ThemeIcon } from './themes.tsx'

// The theme is a per-device preference (localStorage), so it applies on click
// rather than waiting for Save — the modal itself is the preview.
export function AppearanceTab() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  return (
    <div className="st-themes" role="radiogroup" aria-label="Theme">
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={theme === o.id}
          className={'st-theme' + (theme === o.id ? ' on' : '')}
          onClick={() => setTheme(o.id)}
        >
          <span className="st-theme-ic"><ThemeIcon id={o.id} /></span>
          <span className="st-theme-t">{o.label}</span>
          <span className="st-theme-n">{o.note}</span>
        </button>
      ))}
    </div>
  )
}
