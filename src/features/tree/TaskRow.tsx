import { useState, type CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../../store/useStore.ts'
import type { TaskRow as TaskRowType } from '../../types.ts'
import { PROJECT_BY_ID, CONTEXT_BY_ID } from '../../seed.ts'

type Props = {
  task: TaskRowType
  dim?: boolean
}

export function TaskRow({ task, dim }: Props) {
  const toggleTask = useStore((s) => s.toggleTask)
  const updateTask = useStore((s) => s.updateTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // Same draft/commit shape as AddTaskRow. Never write a blank title to an
  // existing row: empty/whitespace-only Enter (and Escape/blur) revert to the
  // original. Only a non-empty, changed, trimmed title is committed.
  const commitEdit = () => {
    const title = draft.trim()
    if (title && title !== task.title) void updateTask(task.id, { title })
    setEditing(false)
  }
  const cancelEdit = () => setEditing(false)
  const startEdit = () => {
    setDraft(task.title)
    setEditing(true)
  }

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const rowClass = 'row' + (task.done ? ' done' : '') + (isDragging ? ' dragging' : '')
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(dim ? { opacity: 0.3 } : null),
    ...(isDragging ? { opacity: 0.5, zIndex: 1 } : null),
  }

  return (
    <div ref={setNodeRef} className={rowClass} style={style}>
      {/* Rail: the route spine column. The drag handle and the station node
          (the restyled done checkbox) live here, sitting on the spine line. */}
      <div className="rail">
        {/* Drag handle: listeners/attributes live on the grip ONLY, so row taps
            and edit/delete affordances aren't hijacked by the sensor. */}
        <span
          ref={setActivatorNodeRef}
          className="grip"
          style={{ touchAction: 'none', cursor: 'grab' }}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </span>
        {/* Station node = the done checkbox. Hollow ring = todo, filled +
            check = done. Reads task.done ONLY (no next/progress — that's V2-A). */}
        <button
          type="button"
          className={'check station' + (task.done ? ' done' : '')}
          style={{ cursor: 'pointer' }}
          aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
          aria-pressed={task.done}
          onClick={() => void toggleTask(task.id)}
        />
      </div>
      {/* Body: title + tags + row actions (the existing stop content). */}
      <div className="body">
        {editing ? (
          <input
            className="addinput"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitEdit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancelEdit()
              }
            }}
            onBlur={cancelEdit}
          />
        ) : (
          <span className="title-c" onDoubleClick={startEdit} title="Double-click to rename">
            {task.title}
          </span>
        )}
        <span className="tags">
          {task.tags.map((tagId) => <Tag key={tagId} tagId={tagId} />)}
        </span>
        {/* Touch rename trigger — visible only on mobile (CSS); desktop renames
            via double-click on the title. Same startEdit path either way. */}
        <button
          type="button"
          className="rowedit"
          aria-label={`Rename ${task.title}`}
          onClick={(e) => {
            e.stopPropagation()
            startEdit()
          }}
        >
          ✎
        </button>
        <button
          type="button"
          className="rowdel"
          aria-label={`Delete ${task.title}`}
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm(`Delete "${task.title}"? This can't be undone.`)) {
              // Failure is surfaced via the error banner; swallow the rejection.
              deleteTask(task.id).catch(() => {})
            }
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}

function Tag({ tagId }: { tagId: string }) {
  const proj = PROJECT_BY_ID[tagId]
  if (proj) {
    const style = { '--h': proj.hue } as CSSProperties
    return (
      <span className="tag proj" style={style}>
        <span className="pdot" />
        {proj.short}
      </span>
    )
  }
  const ctx = CONTEXT_BY_ID[tagId]
  if (!ctx) return <span className="tag ctx">{tagId}</span>
  const bare = ctx.label.replace(/^@/, '')
  return (
    <span className="tag ctx">
      <span className="at">@</span>
      {bare}
    </span>
  )
}
