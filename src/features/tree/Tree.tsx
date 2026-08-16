// V2-E — FULL REPLACEMENT for src/features/tree/Tree.tsx
// Plan = one separate card per folder (project), in PROJECTS order (= tier
// order: Attackers → Mid-players → Defenders) — never interleaved. Each card
// prunes the canonical tree to just that folder's tasks and carries an
// "Open ↗" that opens the plan alone in a new window (?plan=<id> — handled
// by App.tsx → PlanWindow.tsx). Folder chips narrow which cards show.
import { useMemo, type CSSProperties } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useStore } from '../../store/useStore.ts'
import { PROJECTS, ROLE_BY_ID } from '../../seed.ts'
import { planTreeFor } from './planTree.ts'
import { Group } from './Group.tsx'
import { EmptyState } from './EmptyState.tsx'
import type { TaskRow } from '../../types.ts'

export function openPlanWindow(projectId: string) {
  const url = `${window.location.pathname}?plan=${projectId}`
  window.open(url, '_blank', 'noopener,width=780,height=940')
}

// Within-parent reorder, index in position-sorted full-sibling space (the
// same wrong-basis guard the old Tree carried).
export function makeDragEnd(
  rows: TaskRow[],
  reorderTask: (id: string, newIndex: number) => Promise<void>,
) {
  return (event: DragEndEvent) => {
    const { active: dragged, over } = event
    if (!over || dragged.id === over.id) return
    const draggedId = String(dragged.id)
    const overId = String(over.id)
    const draggedRow = rows.find((r) => r.id === draggedId)
    const overRow = rows.find((r) => r.id === overId)
    if (!draggedRow || !overRow) return
    if (draggedRow.parent_id !== overRow.parent_id) return
    const siblings = rows
      .filter((r) => r.parent_id === draggedRow.parent_id)
      .sort((a, b) => a.position - b.position)
    const newIndex = siblings.findIndex((r) => r.id === overId)
    if (newIndex === -1) return
    void reorderTask(draggedId, newIndex)
  }
}

export function Tree() {
  const rows = useStore((s) => s.tree)
  const reorderTask = useStore((s) => s.reorderTask)
  const filters = useStore((s) => s.filters)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Folder chips narrow which plans render; no chips ⇒ every folder, tier order.
  const projects =
    filters.projects.size > 0
      ? PROJECTS.filter((p) => filters.projects.has(p.id))
      : PROJECTS

  const plans = useMemo(
    () => projects.map((p) => ({ p, ...planTreeFor(rows, p.id, filters) })),
    [rows, projects, filters],
  )

  const handleDragEnd = makeDragEnd(rows, reorderTask)

  if (plans.every((x) => x.pruned.length === 0)) {
    return (
      <EmptyState
        noActiveRoles={false}
        filterActive={filters.projects.size > 0 || filters.contexts.size > 0}
      />
    )
  }

  return (
    <div className="plans">
      {plans.map(({ p, pruned, dim, open, total }) => {
        if (pruned.length === 0) return null
        return (
          <section
            key={p.id}
            className="plan-card"
            style={{ '--h': p.hue } as CSSProperties}
          >
            <header className="plan-head">
              <span className="plan-dot" aria-hidden="true"></span>
              <h2 className="plan-title">{p.label}</h2>
              <span className="plan-tier">{ROLE_BY_ID[p.role].badge}</span>
              <span className="plan-count">{total - open}/{total}</span>
              <button
                type="button"
                className="plan-open"
                title={`Open ${p.label} in its own window`}
                onClick={() => openPlanWindow(p.id)}
              >
                Open ↗
              </button>
            </header>
            <div className="plan-body">
              {/* Own DndContext per card: a task tagged into two folders renders
                  in both cards, and duplicate sortable ids must never share one
                  context. Reorder stays within-parent, as before. */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                {pruned.map((node) => (
                  <Group key={node.id} node={node} depth={0} dim={dim} />
                ))}
              </DndContext>
            </div>
          </section>
        )
      })}
    </div>
  )
}
