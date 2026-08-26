// V2-H — FULL REPLACEMENT for src/features/tree/PlanWindow.tsx
// One-line behavioural change vs V2-F: the Languages plan renders the
// multi-road LanguageRoads body; every other plan keeps JourneyView.
import { useEffect, type CSSProperties } from 'react'
import { PROJECT_BY_ID, ROLE_BY_ID } from '../../seed.ts'
import { useStore } from '../../store/useStore.ts'
import { folderProgress } from '../../store/selectors.ts'
import { JourneyView } from '../plan/JourneyView.tsx'
import { LanguageRoads } from '../plan/LanguageRoads.tsx'

function goBack() {
  window.location.href = window.location.pathname
}

export function PlanWindow({ projectId }: { projectId: string }) {
  const tree = useStore((s) => s.tree)
  const p = PROJECT_BY_ID[projectId]

  useEffect(() => {
    if (p) document.title = `${p.label} · Roadmap`
  }, [p])

  if (!p) {
    return (
      <div className="empty">
        <h2>Unknown plan</h2>
        <p>No folder "{projectId}". Close this window and reopen from Plan.</p>
      </div>
    )
  }

  const { done, total } = folderProgress(tree, p.id)
  return (
    <div className="planwin" style={{ '--h': p.hue } as CSSProperties}>
      <header className="pw-head">
        <button type="button" className="pw-back" onClick={goBack}>← All plans</button>
        <span className="plan-dot" aria-hidden="true"></span>
        <h1 className="plan-title">{p.label}</h1>
        <span className="plan-tier">{ROLE_BY_ID[p.role].label}</span>
        <span className="plan-count">{done}/{total} done</span>
      </header>
      {p.id === 'lang' ? <LanguageRoads /> : <JourneyView projectId={p.id} />}
    </div>
  )
}
