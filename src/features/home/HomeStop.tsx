// V2-L — FULL REPLACEMENT for src/features/home/HomeStop.tsx
// Delta vs V2-B/V2-J: the streak is DERIVED from roadmap_study_sessions
// instead of read off task.streak, and every stop states how today's
// completion is known — proven by a study app, or ticked by hand. A streak
// that mixes proof and self-report without saying so is a streak you can't
// trust, so the distinction is visible, not buried.

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { PROJECT_BY_ID } from '../../seed.ts'
import { useStore } from '../../store/useStore.ts'
import type { TaskRow } from '../../types.ts'
import { LaunchPopover } from '../plan/LaunchPopover.tsx'
import { isCooled, isDaily, untilResetLabel } from '../../lib/dailyReset.ts'
import { derivedStreak, trustToday, verifiedShare } from '../../lib/sessions.ts'

type Props = {
  task: TaskRow
  dx: number
  beyond: boolean
  here: boolean
}

const TRUST_LABEL = {
  verified: 'Confirmed by the study app',
  self: 'Ticked here — not confirmed by the app',
  open: 'Launched, no completion reported yet',
  none: '',
} as const

export function HomeStop({ task, dx, beyond, here }: Props) {
  const toggleTask = useStore((s) => s.toggleTask)
  // Selector returns the stable array ref; the per-task filter is memoised so
  // this doesn't allocate a new array on every store tick.
  const allSessions = useStore((s) => s.sessions)
  const mine = useMemo(
    () => allSessions.filter((s) => s.task_id === task.id),
    [allSessions, task.id],
  )
  const daily = isDaily(task)
  const streak = daily ? derivedStreak(mine) : 0
  const trust = daily ? trustToday(mine) : 'none'
  const share = useMemo(() => verifiedShare(mine), [mine])

  const projId = task.tags.find((t) => t in PROJECT_BY_ID)
  const proj = projId ? PROJECT_BY_ID[projId] : null
  const cls = 'row' + (task.done ? ' done' : '') + (beyond ? ' beyond' : '')
  const shift = { transform: `translateX(${dx.toFixed(1)}px)` }

  const streakTitle =
    share.total > 0
      ? `${streak}-day streak · ${share.verified} of ${share.total} logged days confirmed by an app`
      : `${streak}-day streak`

  return (
    <div className={cls}>
      <div className="rail">
        <button
          type="button"
          className={
            'check station' +
            (task.done ? ' done' : '') +
            (here ? ' here' : '') +
            (trust === 'verified' ? ' verified' : '')
          }
          style={shift}
          aria-pressed={task.done}
          aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          onClick={() => void toggleTask(task.id)}
        />
      </div>
      <div className="body" style={shift}>
        <span className="title-c">{task.title}</span>
        {streak > 0 && (
          <span
            className={'streak' + (share.verified === share.total ? ' allverified' : '')}
            title={streakTitle}
          >
            🔥 {streak}
          </span>
        )}
        {trust !== 'none' && (
          <span className={'hs-trust ' + trust} title={TRUST_LABEL[trust]}>
            {trust === 'verified' ? '✓ confirmed' : trust === 'self' ? '· self' : '· open'}
          </span>
        )}
        <LaunchPopover
          taskId={task.id}
          taskTitle={task.title}
          cooledLabel={isCooled(task) ? `Done for today — re-enables at 4:00 AM (${untilResetLabel()})` : null}
        />
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
