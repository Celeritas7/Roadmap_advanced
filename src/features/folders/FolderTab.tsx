import type { CSSProperties } from 'react'
import type { Project } from '../../types.ts'

const FolderIcon = () => (
  <svg
    className="ficon"
    viewBox="0 0 16 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinejoin="round"
  >
    <path
      d="M1 3.5C1 2.7 1.7 2 2.5 2H6L7.5 3.5H13.5C14.3 3.5 15 4.2 15 5V11.5C15 12.3 14.3 13 13.5 13H2.5C1.7 13 1 12.3 1 11.5V3.5Z"
      fill="currentColor"
      fillOpacity="0.22"
    />
  </svg>
)

type Props = {
  project: Project
  count: number
  muted: boolean
  on: boolean
  onClick: () => void
}

export function FolderTab({ project, count, muted, on, onClick }: Props) {
  const style = { '--h': project.hue } as CSSProperties
  const className = 'folder-card' + (muted ? ' muted' : '') + (on ? ' on' : '')
  // Step 3 (minimal): card chrome + head only. `count` is the real total of
  // tasks tagged with this project (countTasksWithTag) — rendered as the
  // sub-line "N stops". A done/total split, route track, next-stop panel and
  // footer are V2-A and intentionally absent here.
  const stops = `${count} ${count === 1 ? 'stop' : 'stops'}`
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={onClick}
      title={muted ? `${project.label} — role muted` : project.label}
    >
      <div className="fc-head">
        <span className="fc-icon">
          <FolderIcon />
        </span>
        <div className="fc-titles">
          <span className="fc-name">{project.label}</span>
          <span className="fc-sub">
            {project.short} · {stops}
          </span>
        </div>
      </div>
    </button>
  )
}
