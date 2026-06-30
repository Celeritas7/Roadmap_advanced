type Props = {
  noActiveRoles: boolean
  filterActive: boolean
}

export function EmptyState({ noActiveRoles, filterActive }: Props) {
  if (noActiveRoles) {
    return (
      <div className="empty">
        <h2>All roles are muted</h2>
        <p>Un-mute a role above (or wait for the hour to roll into one) to bring its folders back.</p>
      </div>
    )
  }
  if (filterActive) {
    return (
      <div className="empty">
        <h2>No tasks match the current filters</h2>
        <p>Clear filters or pick different ones.</p>
      </div>
    )
  }
  return (
    <div className="empty">
      <h2>Nothing here</h2>
      <p>No tasks in the active scope.</p>
    </div>
  )
}
