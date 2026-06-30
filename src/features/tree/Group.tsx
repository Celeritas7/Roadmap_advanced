import { useState, type CSSProperties } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useStore } from '../../store/useStore.ts'
import { subtreeIds, type TreeNode } from '../../lib/tree.ts'
import { TaskRow } from './TaskRow.tsx'

type Props = {
  node: TreeNode
  depth: number
  dim: Set<string>
}

export function Group({ node, depth, dim }: Props) {
  const toggleGroup = useStore((s) => s.toggleGroup)
  const deleteTask = useStore((s) => s.deleteTask)
  const collapsed = !node.expanded
  const tasksHere = node.children.filter((c) => c.kind === 'task')
  // Only tasks are sortable; sub-groups are rendered but not draggable (v1).
  const sortableIds = tasksHere.map((c) => c.id)
  const total = tasksHere.length
  const done = tasksHere.filter((t) => t.done).length
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <div className={`group depth-${depth}`}>
      <div
        className={'ghead' + (collapsed ? ' col' : '')}
        onClick={() => void toggleGroup(node.id)}
        role="button"
      >
        <span className="twist">▾</span>
        <h2>{node.title}</h2>
        {total > 0 && (
          <span className="meta">
            <span>
              {done}/{total}
            </span>
            {/* depth-0 segments carry a slim progress bar; nested sub-groups
                show the count only (reskinned chrome — same done/total). */}
            {depth === 0 && (
              <span className="bar" style={{ '--pct': `${pct}%` } as CSSProperties} />
            )}
          </span>
        )}
        <button
          type="button"
          className="gdel"
          aria-label={`Delete group ${node.title}`}
          onClick={(e) => {
            e.stopPropagation() // don't toggle the group open/closed
            const rows = useStore.getState().tree
            const ids = subtreeIds(rows, node.id)
            const n = rows.filter(
              (r) => ids.has(r.id) && r.id !== node.id && r.kind === 'task',
            ).length
            const ok = window.confirm(
              `Delete group "${node.title}" and its ${n} task${n === 1 ? '' : 's'}? This can't be undone.`,
            )
            // Failure is surfaced via the error banner; swallow the rejection.
            if (ok) deleteTask(node.id).catch(() => {})
          }}
        >
          ×
        </button>
      </div>
      {!collapsed && (
        <div className="rows">
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {node.children.map((child) => {
              if (child.kind === 'group') {
                return <Group key={child.id} node={child} depth={depth + 1} dim={dim} />
              }
              return <TaskRow key={child.id} task={child} dim={dim.has(child.id)} />
            })}
          </SortableContext>
          <AddTaskRow parentId={node.id} />
        </div>
      )}
    </div>
  )
}

// Add affordance: a local-only draft. Nothing is written to the DB until
// Enter with a non-empty (trimmed) name. Escape / blur / empty-Enter all
// discard the draft, so a never-named add never strands a blank row.
// (The inline-input pattern here — Enter commits, Escape cancels — is the same
// shape Step 3 will reuse for renaming existing rows. Flagged so the Step 2/3
// boundary stays explicit; this component does NOT edit existing tasks.)
function AddTaskRow({ parentId }: { parentId: string }) {
  const addTask = useStore((s) => s.addTask)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const title = draft.trim()
    if (title) void addTask(parentId, title)
    setAdding(false)
    setDraft('')
  }
  const cancel = () => {
    setAdding(false)
    setDraft('')
  }

  return (
    <div className="addrow">
      <span aria-hidden />
      <span aria-hidden />
      {adding ? (
        <input
          className="addinput"
          autoFocus
          placeholder="Task name…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          onBlur={cancel}
        />
      ) : (
        <button type="button" className="addbtn" onClick={() => setAdding(true)}>
          + add task
        </button>
      )}
    </div>
  )
}
