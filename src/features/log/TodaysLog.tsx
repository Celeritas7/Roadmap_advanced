import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useStore } from '../../store/useStore.ts'
import { CONTEXTS } from '../../seed.ts'
import type { LogRow, TaskRow } from '../../types.ts'

export function TodaysLog() {
  const log = useStore((s) => s.log)
  const tree = useStore((s) => s.tree)
  const deleteLog = useStore((s) => s.deleteLog)

  const taskById = useMemo(() => {
    const map = new Map<string, TaskRow>()
    for (const t of tree) map.set(t.id, t)
    return map
  }, [tree])

  const today = format(new Date(), 'yyyy-MM-dd')
  const dateLabel = format(new Date(), 'EEE, MMM d')
  // v1 is today-only: entries from other days are not shown (no date nav).
  const todays = useMemo(() => log.filter((l) => l.log_date === today), [log, today])

  return (
    <section className="log">
      <h3>
        Today's log <span className="date">{dateLabel}</span>
      </h3>
      <AddLogRow today={today} />
      {todays.length === 0 ? (
        <div className="logempty">Nothing logged today — log your first entry.</div>
      ) : (
        todays.map((entry) => (
          <LogRowItem
            key={entry.id}
            entry={entry}
            taskTitle={resolveTitle(entry, taskById)}
            onDelete={() => {
              if (window.confirm('Delete this log entry?')) {
                // Failure surfaces via the error banner; swallow the rejection.
                deleteLog(entry.id).catch(() => {})
              }
            }}
          />
        ))
      )}
    </section>
  )
}

function LogRowItem({
  entry,
  taskTitle,
  onDelete,
}: {
  entry: LogRow
  taskTitle: string
  onDelete: () => void
}) {
  return (
    <div className="logrow">
      <span className="tick">●</span>
      <span className="t">{taskTitle}</span>
      <span className="where">{entry.context ? `@${entry.context}` : ''}</span>
      <span className="dur">
        {entry.duration_minutes != null ? `${entry.duration_minutes} min` : ''}
      </span>
      <button type="button" className="logdel" aria-label="Delete log entry" onClick={onDelete}>
        ×
      </button>
    </div>
  )
}

// Quick-log draft: nothing is written until a valid commit (duration > 0).
// Escape / Cancel / focus leaving the form / empty all discard — no junk row.
function AddLogRow({ today }: { today: string }) {
  const addLog = useStore((s) => s.addLog)
  // Select the stable `tree` reference, then derive — filtering *inside* the
  // selector returns a new array each render and triggers an infinite loop.
  const tree = useStore((s) => s.tree)
  const tasks = useMemo(() => tree.filter((t) => t.kind === 'task'), [tree])

  const [open, setOpen] = useState(false)
  const [taskId, setTaskId] = useState('') // '' = General -> task_id NULL
  const [context, setContext] = useState('') // '' = no context -> NULL
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')

  const reset = () => {
    setTaskId('')
    setContext('')
    setDuration('')
    setNotes('')
    setOpen(false)
  }

  const commit = () => {
    const mins = Number.parseInt(duration, 10)
    if (!Number.isFinite(mins) || mins <= 0) return // invalid: no write, keep form open
    addLog({
      task_id: taskId || null,
      context: context || null,
      duration_minutes: mins,
      notes: notes.trim() || null,
      log_date: today,
    }).catch(() => {})
    reset()
  }

  if (!open) {
    return (
      <button type="button" className="logaddbtn" onClick={() => setOpen(true)}>
        + log something
      </button>
    )
  }

  return (
    <div
      className="logdraft"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          reset()
        }
      }}
      onBlur={(e) => {
        // Focus leaving the whole form discards the draft. Deferred a tick:
        // on touch, a tap on the Log/Cancel button may not focus it before
        // blur fires, so we let an in-progress commit/cancel tap win first.
        const form = e.currentTarget
        window.setTimeout(() => {
          if (form.isConnected && !form.contains(document.activeElement)) reset()
        }, 0)
      }}
    >
      <select
        autoFocus
        className="logtask"
        aria-label="Task"
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
      >
        <option value="">General (no task)</option>
        {tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <select
        className="logctx"
        aria-label="Context"
        value={context}
        onChange={(e) => setContext(e.target.value)}
      >
        <option value="">— context —</option>
        {CONTEXTS.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        className="logdur"
        type="number"
        min="1"
        inputMode="numeric"
        placeholder="min"
        aria-label="Duration in minutes"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
      <input
        className="lognotes"
        type="text"
        placeholder="notes (optional)"
        aria-label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
      <button type="button" className="logcommit" onClick={commit}>
        Log
      </button>
      <button type="button" className="logcancel" onClick={reset}>
        Cancel
      </button>
    </div>
  )
}

function resolveTitle(entry: LogRow, taskById: Map<string, TaskRow>): string {
  if (entry.task_id) {
    const t = taskById.get(entry.task_id)
    if (t) return t.title
  }
  // task_id NULL, or orphaned (task deleted via ON DELETE SET NULL):
  // fall back to notes, then a "General" label — never crash.
  const n = entry.notes?.trim()
  return n ? n : 'General'
}
