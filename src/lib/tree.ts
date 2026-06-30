import type { TaskRow } from '../types.ts'

export type TreeNode = TaskRow & { children: TreeNode[] }

// Builds a nested tree from the flat row list, sorted by `position` within
// each parent. Tasks (kind='task') always have children = [].
export function buildTree(rows: TaskRow[]): TreeNode[] {
  const byParent = new Map<string | null, TaskRow[]>()
  for (const row of rows) {
    const key = row.parent_id
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(row)
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.position - b.position)
  }

  function build(parentId: string | null): TreeNode[] {
    return (byParent.get(parentId) ?? []).map((row) => ({
      ...row,
      children: row.kind === 'group' ? build(row.id) : [],
    }))
  }
  return build(null)
}

// All ids in the subtree rooted at `rootId`, including `rootId` itself.
// Used to mirror the DB's ON DELETE CASCADE in local state on delete.
export function subtreeIds(rows: TaskRow[], rootId: string): Set<string> {
  const byParent = new Map<string | null, TaskRow[]>()
  for (const r of rows) {
    const arr = byParent.get(r.parent_id) ?? []
    arr.push(r)
    byParent.set(r.parent_id, arr)
  }
  const ids = new Set<string>([rootId])
  const stack = [rootId]
  while (stack.length) {
    const parent = stack.pop()!
    for (const child of byParent.get(parent) ?? []) {
      if (!ids.has(child.id)) {
        ids.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return ids
}

// Count tasks (anywhere in the tree) tagged with a given id.
export function countTasksWithTag(rows: TaskRow[], tagId: string): number {
  let n = 0
  for (const r of rows) {
    if (r.kind === 'task' && r.tags.includes(tagId)) n++
  }
  return n
}
