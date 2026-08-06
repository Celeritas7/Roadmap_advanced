// V2-B — src/features/home/HomeStop.tsx
// One stop on the Home road: numbered station (reuses Step 4 .check.station
// chrome) riding the road curve via dx, title + project chip.
// PORT NOTE (CC probe at apply): align the project-chip markup with the tag
// chips TaskRow.tsx renders, so Home and Plan chips match. Plain span.tag
// fallback below. No PriorityPill — the app has no priority field (V2-B
// design default; render order stands in for priority).

import type { CSSProperties } from 'react'
import { PROJECT_BY_ID } from '../../seed.ts'
import { useStore } from '../../store/useStore.ts'
import type { TaskRow } from '../../types.ts'

type Props = {
  task: TaskRow
  dx: number
  beyond: boolean
  here: boolean
}

export function HomeStop({ task, dx, beyond, here }: Props) {
  const toggleTask = useStore((s) => s.toggleTask)
  const projId = task.tags.find((t) => t in PROJECT_BY_ID)
  const proj = projId ? PROJECT_BY_ID[projId] : null
  const cls = 'row' + (task.done ? ' done' : '') + (beyond ? ' beyond' : '')
  const shift = { transform: `translateX(${dx.toFixed(1)}px)` }
  return (
    <div className={cls}>
      <div className="rail">
        <button
          type="button"
          className={'check station' + (task.done ? ' done' : '') + (here ? ' here' : '')}
          style={shift}
          aria-pressed={task.done}
          aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          onClick={() => void toggleTask(task.id)}
        />
      </div>
      <div className="body" style={shift}>
        <span className="title-c">{task.title}</span>
        {proj && (
          <span className="tags">
            <span className="tag" style={{ '--h': proj.hue } as CSSProperties}>
              {proj.short}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
