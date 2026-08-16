// V2-E — NEW FILE src/features/tree/planTree.ts
// Shared derivation for the per-folder plan cards (Plan view + PlanWindow):
// prune the canonical tree down to ONE project's tasks. Role gate is opened
// to all roles here — a plan card shows its whole folder regardless of the
// schedule's focus; context filters (hide-family) still apply via 'filters'.
import { ROLES } from '../../seed.ts'
import { buildTree, type TreeNode } from '../../lib/tree.ts'
import { passingTaskIds, visibleGroupIds } from '../../store/selectors.ts'
import type { FilterState, TaskRow } from '../../types.ts'

export const ALL_ROLE_IDS: Set<string> = new Set(ROLES.map((r) => r.id))

export type PlanTree = {
  pruned: TreeNode[]
  dim: Set<string>
  open: number
  total: number
}

export function planTreeFor(
  rows: TaskRow[],
  projectId: string,
  filters: FilterState,
): PlanTree {
  const { pass, dim } = passingTaskIds(rows, ALL_ROLE_IDS, filters)
  const planPass = new Set<string>()
  for (const t of rows) {
    if (t.kind === 'task' && t.tags.includes(projectId) && pass.has(t.id)) {
      planPass.add(t.id)
    }
  }
  const visGroups = visibleGroupIds(rows, planPass)
  const pruned = prune(buildTree(rows), planPass, visGroups)
  let open = 0
  let total = 0
  for (const t of rows) {
    if (t.kind !== 'task' || !t.tags.includes(projectId)) continue
    total++
    if (!t.done) open++
  }
  return { pruned, dim, open, total }
}

// Same pruneTree Plan always used, hoisted here so both surfaces share it.
function prune(tree: TreeNode[], pass: Set<string>, visGroups: Set<string>): TreeNode[] {
  return tree.flatMap((node) => {
    if (node.kind === 'task') return pass.has(node.id) ? [node] : []
    if (!visGroups.has(node.id)) return []
    return [{ ...node, children: prune(node.children, pass, visGroups) }]
  })
}
