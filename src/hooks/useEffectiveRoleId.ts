import { useStore } from '../store/useStore.ts'
import { activeRoleIds, effectiveRoleId } from '../store/selectors.ts'

// Single source of truth for the journey UI's focused role. Manual selection
// (`selectedRole`) wins; otherwise the schedule's active set picks the default
// (see effectiveRoleId). Header (mood), RolesTier (active chip), and App
// (data-role + visibility gate) all derive from THIS hook so they can't drift
// out of sync. Reads the store's `now`, so the debug time-slider flows through.
export function useEffectiveRoleId(): string {
  const now = useStore((s) => s.now)
  const settings = useStore((s) => s.settings)
  const selectedRole = useStore((s) => s.selectedRole)
  const overrides = settings?.role_overrides ?? {}
  return effectiveRoleId(activeRoleIds(now, overrides), selectedRole)
}
