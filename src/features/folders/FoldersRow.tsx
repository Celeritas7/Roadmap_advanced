// V2-C — FULL REPLACEMENT for src/features/folders/FoldersRow.tsx
// Two chip rows: focused tier's folders on top, all other tiers' below
// (dimmed, separated by a dashed rule). nextAction/pass no longer needed
// here — next-stop details live on Home.
import { useStore } from '../../store/useStore.ts'
import { PROJECTS, ROLE_BY_ID } from '../../seed.ts'
import { folderProgress } from '../../store/selectors.ts'
import { useEffectiveRoleId } from '../../hooks/useEffectiveRoleId.ts'
import { FolderTab } from './FolderTab.tsx'

export function FoldersRow() {
  const tree = useStore((s) => s.tree)
  const filters = useStore((s) => s.filters)
  const toggleFilter = useStore((s) => s.toggleFilter)
  const effId = useEffectiveRoleId()

  const mine = PROJECTS.filter((p) => p.role === effId)
  const others = PROJECTS.filter((p) => p.role !== effId)
  const chip = (p: (typeof PROJECTS)[number], muted: boolean) => (
    <FolderTab
      key={p.id}
      project={p}
      muted={muted}
      on={filters.projects.has(p.id)}
      onClick={() => toggleFilter('project', p.id)}
      progress={folderProgress(tree, p.id)}
    />
  )

  return (
    <div className="fbar">
      <span className="flabel">Folders · {ROLE_BY_ID[effId].label}</span>
      <div className="fchips">{mine.map((p) => chip(p, false))}</div>
      <div className="fchips fchips-others">{others.map((p) => chip(p, true))}</div>
    </div>
  )
}
