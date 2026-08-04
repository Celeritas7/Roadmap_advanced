import { useStore } from '../../store/useStore.ts'
import { PROJECTS } from '../../seed.ts'
import { visibleProjectIds } from '../../store/selectors.ts'
import { useEffectiveRoleId } from '../../hooks/useEffectiveRoleId.ts'
import { countTasksWithTag } from '../../lib/tree.ts'
import { FolderTab } from './FolderTab.tsx'

export function FoldersRow() {
  const tree = useStore((s) => s.tree)
  const filters = useStore((s) => s.filters)
  const toggleFilter = useStore((s) => s.toggleFilter)
  const effId = useEffectiveRoleId()

  // Single-focus visibility: only the effective (focused) role's projects are
  // un-muted — was the schedule's active-role union. The filter trigger + Clear
  // now live in the Subbar (one filter button), so this row is folder tabs only.
  const visible = visibleProjectIds(new Set([effId]))

  return (
    <div className="fbar">
      <span className="flabel">Folders</span>
      <div className="focus-grid">
        {PROJECTS.map((p) => (
          <FolderTab
            key={p.id}
            project={p}
            count={countTasksWithTag(tree, p.id)}
            muted={!visible.has(p.id)}
            on={filters.projects.has(p.id)}
            onClick={() => toggleFilter('project', p.id)}
          />
        ))}
      </div>
    </div>
  )
}
