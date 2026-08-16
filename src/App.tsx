// V2-F — FULL REPLACEMENT for src/App.tsx
// Delta vs v2e: Plan tab renders PlanFolders (folder tiles); tier tabs
// (RolesTier) show ONLY on Plan — Home is the merged road, no tiers.
import { useEffect } from 'react'
import { useStore } from './store/useStore.ts'
import { useNow } from './hooks/useNow.ts'
import { useEffectiveRoleId } from './hooks/useEffectiveRoleId.ts'
import { PROJECT_BY_ID } from './seed.ts'
import { Header } from './features/header/Header.tsx'
import { RolesTier } from './features/roles-tier/RolesTier.tsx'
import { Subbar } from './features/subbar/Subbar.tsx'
import { PlanFolders } from './features/plan/PlanFolders.tsx'
import { PlanWindow } from './features/tree/PlanWindow.tsx'
import { HomeView } from './features/home/HomeView.tsx'
import { DebugTimeSlider } from './features/debug/DebugTimeSlider.tsx'

const planParam = new URLSearchParams(window.location.search).get('plan')

export default function App() {
  const init = useStore((s) => s.init)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const hasData = useStore((s) => s.tree.length > 0)
  const clearError = useStore((s) => s.clearError)
  const theme = useStore((s) => s.theme)
  const view = useStore((s) => s.view)

  useEffect(() => {
    void init()
  }, [init])

  useNow()

  const role = useEffectiveRoleId()
  const loadFailed = !!error && !hasData

  if (planParam) {
    const winRole = PROJECT_BY_ID[planParam]?.role ?? role
    return (
      <div className="rm" data-theme={theme} data-role={winRole}>
        <div className="rm-scroll">
          <main className="rm-pad">
            {loading ? (
              <div className="empty"><h2>Loading…</h2></div>
            ) : loadFailed ? (
              <div className="empty"><h2>Couldn't load tasks</h2><p>{error}</p></div>
            ) : (
              <PlanWindow projectId={planParam} />
            )}
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="rm" data-theme={theme} data-role={role}>
      <div className="rm-scroll">
        <header className="rm-header">
          <Header />
          {view !== 'home' && <RolesTier />}
          <Subbar />
        </header>
        <main className="rm-pad">
          {loading ? (
            <div className="empty">
              <h2>Loading…</h2>
            </div>
          ) : loadFailed ? (
            <div className="empty">
              <h2>Couldn't load tasks</h2>
              <p>{error}</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="err-banner" role="alert">
                  <span className="eb-icon" aria-hidden="true">⚠</span>
                  <span className="eb-msg">
                    Couldn't save that change — it's been undone.
                  </span>
                  <button
                    type="button"
                    className="eb-dismiss"
                    onClick={() => clearError()}
                  >
                    Dismiss
                  </button>
                </div>
              )}
              {view === 'home' ? <HomeView /> : <PlanFolders />}
            </>
          )}
        </main>
      </div>
      <DebugTimeSlider />
    </div>
  )
}
