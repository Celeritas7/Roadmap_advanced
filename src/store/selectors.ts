import { ROLES, PROJECT_BY_ID, CONTEXT_BY_ID } from '../seed.ts'
import { buildTree, type TreeNode } from '../lib/tree.ts'
import type {
  FilterState,
  NowState,
  Role,
  RoleOverride,
  RoleOverrides,
  TaskRow,
} from '../types.ts'

// ─── role evaluation ──────────────────────────────────────────────────

function isInTimeRange(hour: number, start: number, end: number): boolean {
  if (start <= end) return hour >= start && hour < end
  return hour >= start || hour < end // wraps midnight
}

function effectiveWindow(role: Role, weekend: boolean): { start: number; end: number } {
  if (weekend && role.weekendStart !== undefined && role.weekendEnd !== undefined) {
    return { start: role.weekendStart, end: role.weekendEnd }
  }
  return { start: role.defaultStart, end: role.defaultEnd }
}

export function isRoleActive(
  role: Role,
  now: NowState,
  override: RoleOverride | undefined,
): boolean {
  if (override === 'on') return true
  if (override === 'off') return false
  const { start, end } = effectiveWindow(role, now.weekend)
  let active = isInTimeRange(now.hour, start, end)
  if (now.weekend && role.weekendActive) active = true
  if (now.location !== 'any' && !role.locations.includes(now.location)) active = false
  return active
}

export function activeRoleIds(now: NowState, overrides: RoleOverrides): Set<string> {
  const out = new Set<string>()
  for (const role of ROLES) {
    if (isRoleActive(role, now, overrides[role.id])) out.add(role.id)
  }
  return out
}

// ─── project visibility (gated by active roles) ───────────────────────

export function visibleProjectIds(activeRoles: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const project of Object.values(PROJECT_BY_ID)) {
    if (activeRoles.has(project.role)) out.add(project.id)
  }
  return out
}

// ─── effective (single) role: the hybrid schedule/selection focus ─────
// The journey UI focuses one role at a time. An explicit manual selection
// (`selectedRole`) always wins; with no selection the schedule's active set
// picks the default — the first active role in ROLES order (which IS the
// tier order: Attackers → Mid-players → Defenders) — falling back to the
// first role when nothing is schedule-active. `activeRoleIds` (time/weekend/
// location + overrides) is unchanged; it stays the default-selection driver.
export function effectiveRoleId(
  activeRoles: Set<string>,
  selectedRole: string | null,
): string {
  if (selectedRole) return selectedRole
  for (const role of ROLES) {
    if (activeRoles.has(role.id)) return role.id
  }
  return ROLES[0].id
}

// done/total task count across a role's projects, deduped by task (a task
// multi-tagged into two of the role's projects counts once). Groups excluded.
export function roleProgress(
  tasks: TaskRow[],
  roleId: string,
): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const t of tasks) {
    if (t.kind !== 'task') continue
    const inRole = t.tags.some(
      (tag) => tag in PROJECT_BY_ID && PROJECT_BY_ID[tag].role === roleId,
    )
    if (!inRole) continue
    total++
    if (t.done) done++
  }
  return { done, total }
}

// ─── task pipeline: role gate → project OR → context AND ──────────────
// Plus campaign-mode dim: when a priority-family context filter is active,
// non-matching tasks are dimmed (opacity 0.3) rather than hidden. Other
// context families keep hide behavior.

export type PassResult = {
  pass: Set<string>
  dim: Set<string>
}

export function passingTaskIds(
  tasks: TaskRow[],
  activeRoles: Set<string>,
  filters: FilterState,
): PassResult {
  const pass = new Set<string>()
  const dim = new Set<string>()

  const dimFilters = new Set<string>()
  const hideFilters = new Set<string>()
  for (const id of filters.contexts) {
    const ctx = CONTEXT_BY_ID[id]
    if (ctx?.family === 'priority') dimFilters.add(id)
    else hideFilters.add(id)
  }

  for (const t of tasks) {
    if (t.kind !== 'task') continue

    // Role gate: any project tag must belong to an active role.
    // (Tasks with no project tag are considered ungated — visible.)
    const projectTags = t.tags.filter((tag) => tag in PROJECT_BY_ID)
    if (projectTags.length > 0) {
      const inActive = projectTags.some((p) => activeRoles.has(PROJECT_BY_ID[p].role))
      if (!inActive) continue
    }

    // Project filter (OR)
    if (filters.projects.size > 0) {
      const matched = projectTags.some((p) => filters.projects.has(p))
      if (!matched) continue
    }

    // Hide-family context filter (AND)
    let hidden = false
    for (const id of hideFilters) {
      if (!t.tags.includes(id)) {
        hidden = true
        break
      }
    }
    if (hidden) continue

    pass.add(t.id)

    // Dim-family (priority) filter — AND semantics: dim unless task has ALL.
    if (dimFilters.size > 0) {
      let allMatch = true
      for (const id of dimFilters) {
        if (!t.tags.includes(id)) {
          allMatch = false
          break
        }
      }
      if (!allMatch) dim.add(t.id)
    }
  }

  return { pass, dim }
}

// ─── group visibility (any descendant passes) ─────────────────────────

export function visibleGroupIds(tasks: TaskRow[], passingIds: Set<string>): Set<string> {
  const byParent = new Map<string | null, TaskRow[]>()
  for (const t of tasks) {
    const key = t.parent_id
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(t)
  }

  const out = new Set<string>()
  function rec(parentId: string | null): boolean {
    let anyVisible = false
    const children = byParent.get(parentId) ?? []
    for (const child of children) {
      if (child.kind === 'task') {
        if (passingIds.has(child.id)) anyVisible = true
      } else {
        const childVisible = rec(child.id)
        if (childVisible) {
          out.add(child.id)
          anyVisible = true
        }
      }
    }
    return anyVisible
  }
  rec(null)
  return out
}

// ─── V2-A: per-folder progress + next-action (read-side derived) ───────
// Both are pure derivations for the folder cards.
//  • folderProgress is ABSOLUTE — done/total over every task tagged with
//    the project, independent of filters/role. A folder's progress doesn't
//    change as you filter the tree, so it takes NO pass arg.
//  • nextAction is filter-AWARE: it picks from the caller's `pass` set,
//    which is the existing passingTaskIds() output (role gate → project OR
//    → context AND). nextAction does NOT recompute filtering — the caller
//    owns the single source of `pass`, and nextAction just orders + picks.

// done/total over ALL tasks carrying this project tag. Groups excluded.
export function folderProgress(
  tasks: TaskRow[],
  projectId: string,
): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const t of tasks) {
    if (t.kind !== 'task') continue
    if (!t.tags.includes(projectId)) continue
    total++
    if (t.done) done++
  }
  return { done, total }
}

// First INCOMPLETE task tagged with `projectId` whose id ∈ `pass`, taken in
// the app's EXISTING render/traversal order (buildTree's position-sorted DFS
// — the same order Tree.tsx renders from; no new ordering is invented).
// Returns null when no such task exists — including the case where tagged
// incompletes remain but none survive the pass set (filtered out).
export function nextAction(
  tasks: TaskRow[],
  projectId: string,
  pass: Set<string>,
): TaskRow | null {
  for (const t of tasksInRenderOrder(tasks)) {
    if (t.done) continue
    if (!t.tags.includes(projectId)) continue
    if (!pass.has(t.id)) continue
    return t
  }
  return null
}

// Linearize the tree into tasks in render order. Reuses buildTree (the
// canonical position-sorted DFS Tree.tsx renders from); groups are walked
// for their children but never emitted (they carry no project tag).
function tasksInRenderOrder(tasks: TaskRow[]): TaskRow[] {
  const out: TaskRow[] = []
  function walk(nodes: TreeNode[]) {
    for (const n of nodes) {
      if (n.kind === 'task') out.push(n)
      else walk(n.children)
    }
  }
  walk(buildTree(tasks))
  return out
}
