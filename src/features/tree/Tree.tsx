import { useMemo } from 'react'
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
import { useEffectiveRoleId } from '../../hooks/useEffectiveRoleId.ts'
import { buildTree, type TreeNode } from '../../lib/tree.ts'
import {
  passingTaskIds,
  visibleGroupIds,
} from '../../store/selectors.ts'
import { Group } from './Group.tsx'
import { EmptyState } from './EmptyState.tsx'

export function Tree() {
  const rows = useStore((s) => s.tree)
  const reorderTask = useStore((s) => s.reorderTask)
  const filters = useStore((s) => s.filters)
  const effId = useEffectiveRoleId()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Single-focus role gate: only the effective role's tasks pass (was the
  // schedule's active-role union). Mirrors FoldersRow so the two never diverge.
  const active = useMemo(() => new Set([effId]), [effId])
  const { pass, dim } = useMemo(
    () => passingTaskIds(rows, active, filters),
    [rows, active, filters],
  )
  const visGroups = useMemo(() => visibleGroupIds(rows, pass), [rows, pass])
  const tree = useMemo(() => buildTree(rows), [rows])
  const pruned = useMemo(() => pruneTree(tree, pass, visGroups), [tree, pass, visGroups])

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event
    if (!over || dragged.id === over.id) return
    const draggedId = String(dragged.id)
    const overId = String(over.id)
    const draggedRow = rows.find((r) => r.id === draggedId)
    const overRow = rows.find((r) => r.id === overId)
    if (!draggedRow || !overRow) return
    // Within-parent only. A cross-parent drop is a no-op (snaps back);
    // cross-parent DnD is v2. Never silently move across parents.
    if (draggedRow.parent_id !== overRow.parent_id) return
    // reorderTask expects newIndex in *position-sorted full-sibling* space,
    // not the rendered/pruned array index. Rebuild that same basis here so
    // the index we pass matches what reorderTask sorts internally — this is
    // the wrong-basis off-by-one the spec warned about.
    const siblings = rows
      .filter((r) => r.parent_id === draggedRow.parent_id)
      .sort((a, b) => a.position - b.position)
    const newIndex = siblings.findIndex((r) => r.id === overId)
    if (newIndex === -1) return
    void reorderTask(draggedId, newIndex)
  }

  if (pass.size === 0) {
    return (
      <EmptyState
        noActiveRoles={active.size === 0}
        filterActive={filters.projects.size > 0 || filters.contexts.size > 0}
      />
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {pruned.map((node) => (
        <Group key={node.id} node={node} depth={0} dim={dim} />
      ))}
    </DndContext>
  )
}

function pruneTree(
  tree: TreeNode[],
  pass: Set<string>,
  visGroups: Set<string>,
): TreeNode[] {
  return tree.flatMap((node) => {
    if (node.kind === 'task') {
      return pass.has(node.id) ? [node] : []
    }
    if (!visGroups.has(node.id)) return []
    return [{ ...node, children: pruneTree(node.children, pass, visGroups) }]
  })
}
