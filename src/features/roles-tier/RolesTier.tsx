import { useStore } from '../../store/useStore.ts'
import { ROLES } from '../../seed.ts'
import { roleProgress } from '../../store/selectors.ts'
import { useEffectiveRoleId } from '../../hooks/useEffectiveRoleId.ts'
import { DaypartPill } from './DaypartPill.tsx'
import { RoleChip } from './RoleChip.tsx'

export function RolesTier() {
  const tree = useStore((s) => s.tree)
  const selectRole = useStore((s) => s.selectRole)
  const effId = useEffectiveRoleId()

  // Single-focus model: exactly one chip is active (the effective role), the
  // rest idle. The only chip gesture is selectRole (toggle). cycleRole /
  // role_overrides / isRoleActive stay defined in the store & selectors — the
  // schedule still picks the DEFAULT selection through the hook's activeRoleIds
  // — but the auto/on/off override cycle has no chip trigger (see v2_backlog.md).
  return (
    <section className="rm-roles">
      <DaypartPill />
      {ROLES.map((r) => (
        <RoleChip
          key={r.id}
          role={r}
          active={r.id === effId}
          progress={roleProgress(tree, r.id)}
          onClick={() => selectRole(r.id)}
        />
      ))}
    </section>
  )
}
