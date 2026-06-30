import type { CSSProperties } from 'react'
import type { Role } from '../../types.ts'

type Props = {
  role: Role
  // Single-focus model: exactly one chip is active (the effective role).
  active: boolean
  progress: { done: number; total: number }
  onClick: () => void
}

export function RoleChip({ role, active, progress, onClick }: Props) {
  const style = { '--h': role.hue } as CSSProperties
  return (
    <button
      type="button"
      className={'role-chip' + (active ? ' active' : ' idle')}
      style={style}
      onClick={onClick}
      aria-pressed={active}
      title={active ? `${role.label} — click to unpin` : `Focus ${role.label}`}
    >
      <span className="rc-badge">{role.badge}</span>
      <span className="rc-text">
        <span className="rc-name">{role.label}</span>
        <span className="rc-sub">{role.subtitle}</span>
      </span>
      <span className="rc-mini">
        {progress.done}/{progress.total}
      </span>
    </button>
  )
}
