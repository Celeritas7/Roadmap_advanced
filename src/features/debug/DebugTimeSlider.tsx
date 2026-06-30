import { useStore } from '../../store/useStore.ts'
import { formatHour12 } from '../../lib/time.ts'

// DEV-gated as well as env-gated: this can never ship in a production build
// even if VITE_DEBUG_TIME is accidentally set on the deploy host.
const enabled =
  import.meta.env.DEV &&
  (import.meta.env.VITE_DEBUG_TIME === 'true' || import.meta.env.VITE_DEBUG_TIME === '1')

export function DebugTimeSlider() {
  const now = useStore((s) => s.now)
  const setHour = useStore((s) => s.setHour)
  if (!enabled) return null
  return (
    <div className="dbg-time">
      <span className="lbl">Hour</span>
      <input
        type="range"
        min={0}
        max={23}
        step={1}
        value={now.hour}
        onChange={(e) => setHour(Number(e.target.value))}
      />
      <span className="val">{now.hour.toString().padStart(2, '0')}</span>
      <span className="hint">{formatHour12(now.hour)}</span>
    </div>
  )
}
