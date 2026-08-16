// V2-F — NEW FILE src/features/plan/PlanFolders.tsx
// The Plan tab: clean folder tiles grouped by tier — no task data inside.
// Clicking a folder opens that plan in its own window (?plan=<id>).
import type { CSSProperties } from 'react'
import { useStore } from '../../store/useStore.ts'
import { ROLES, PROJECTS } from '../../seed.ts'
import { folderProgress } from '../../store/selectors.ts'

const EMOJI: Record<string, string> = {
  dx: '🧑‍💻', fullstack: '🧱', lang: '🗣️', visa: '🛂',
  food: '🍜', exercise: '🏃', sleep: '🌙', fashion: '👔',
}

export function openPlanWindow(projectId: string) {
  window.location.href = `${window.location.pathname}?plan=${projectId}`
}

function FolderIcon({ hue, emoji }: { hue: number; emoji: string }) {
  return (
    <svg viewBox="0 0 100 78" aria-hidden="true">
      <path d="M6 16 Q6 10 12 10 L36 10 Q40 10 42 14 L45 20 L88 20 Q94 20 94 26 L94 66 Q94 72 88 72 L12 72 Q6 72 6 66 Z" fill={`hsl(${hue} 55% 62%)`} />
      <path d="M6 30 Q6 24 12 24 L88 24 Q94 24 94 30 L94 66 Q94 72 88 72 L12 72 Q6 72 6 66 Z" fill={`hsl(${hue} 68% 74%)`} />
      <text x="50" y="56" textAnchor="middle" fontSize="26">{emoji}</text>
    </svg>
  )
}

export function PlanFolders() {
  const tree = useStore((s) => s.tree)
  return (
    <div className="pf">
      {ROLES.map((role) => {
        const mine = PROJECTS.filter((p) => p.role === role.id)
        return (
          <section key={role.id} className="pf-tier" style={{ '--h': role.hue } as CSSProperties}>
            <div className="pf-tier-head">
              <span className="pf-badge">{role.badge}</span>
              <h2>{role.label}</h2>
              <span className="pf-sub">{role.subtitle} · {mine.length} plans</span>
            </div>
            <div className="pf-cards">
              {mine.map((p) => {
                const { done, total } = folderProgress(tree, p.id)
                const pct = total ? Math.round((done / total) * 100) : 0
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="pf-folder"
                    style={{ '--h': p.hue } as CSSProperties}
                    title={`Open ${p.label} in its own window`}
                    onClick={() => openPlanWindow(p.id)}
                  >
                    <FolderIcon hue={p.hue} emoji={EMOJI[p.id] ?? '📁'} />
                    <span className="pf-name">{p.label}</span>
                    <span className="pf-count">{done}/{total}</span>
                    <span className="pf-bar"><i style={{ '--pct': `${pct}%` } as CSSProperties} /></span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
