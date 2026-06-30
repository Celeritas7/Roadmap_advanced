import { useStore } from '../../store/useStore.ts'
import { formatHour12, getDaypart } from '../../lib/time.ts'

export function DaypartPill() {
  const now = useStore((s) => s.now)
  const daypart = getDaypart(now.hour)
  return (
    <div className="daypart">
      <span className="dp-glyph">{daypart.emoji}</span>
      <div className="dp-meta">
        <span className="dp-now">{daypart.label}</span>
        <span className="dp-h">
          {formatHour12(now.hour)}
          {now.weekend ? ' · weekend' : ''}
        </span>
      </div>
    </div>
  )
}
