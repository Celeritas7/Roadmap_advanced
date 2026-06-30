import { useStore } from '../../store/useStore.ts'
import { ROLE_BY_ID } from '../../seed.ts'
import { useEffectiveRoleId } from '../../hooks/useEffectiveRoleId.ts'
import { FilterPopover } from '../folders/FilterPopover.tsx'

export function Subbar() {
  const filters = useStore((s) => s.filters)
  const clearFilters = useStore((s) => s.clearFilters)
  const effId = useEffectiveRoleId()
  const roleLabel = ROLE_BY_ID[effId]?.label ?? ''
  const totalActive = filters.projects.size + filters.contexts.size

  // Focus view title: "Focus / {effective role}". No vt-back here — that's the
  // expanded-route (drill-in) control, which lands in Step 4. The filter
  // trigger + popover and Clear are relocated here from FoldersRow (the same
  // FilterPopover component, not a copy); FoldersRow drops its pair in file 5
  // so exactly one filter button exists.
  return (
    <div className="rm-subbar">
      <div className="rm-viewtitle">
        <span>Focus</span>
        <span className="vt-crumb">/ {roleLabel}</span>
      </div>
      <div className="rm-tools">
        <FilterPopover />
        <button
          type="button"
          className="rm-clear"
          disabled={totalActive === 0}
          onClick={clearFilters}
        >
          {totalActive ? `Clear (${totalActive})` : 'Clear'}
        </button>
      </div>
    </div>
  )
}
