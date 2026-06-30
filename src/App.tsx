import { useEffect } from 'react'
import { useStore } from './store/useStore.ts'
import { useNow } from './hooks/useNow.ts'
import { useEffectiveRoleId } from './hooks/useEffectiveRoleId.ts'
import { Header } from './features/header/Header.tsx'
import { RolesTier } from './features/roles-tier/RolesTier.tsx'
import { Subbar } from './features/subbar/Subbar.tsx'
import { FoldersRow } from './features/folders/FoldersRow.tsx'
import { Tree } from './features/tree/Tree.tsx'
import { TodaysLog } from './features/log/TodaysLog.tsx'
import { DebugTimeSlider } from './features/debug/DebugTimeSlider.tsx'

export default function App() {
  const init = useStore((s) => s.init)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const hasData = useStore((s) => s.tree.length > 0)
  const clearError = useStore((s) => s.clearError)
  const theme = useStore((s) => s.theme)

  useEffect(() => {
    void init()
  }, [init])

  useNow()

  // Step 2: data-role now tracks the effective (single) focused role — the
  // hybrid model's source of truth (manual selectRole > schedule default), via
  // the shared hook. effectiveRoleId always returns one of
  // attackers/midplayers/defenders, matching the [data-role] tokens in index.css
  // (replaces the Step 1 hardcoded data-role="attackers").
  const role = useEffectiveRoleId()

  // A load failure (no data yet) gets the full error screen. A failed mutation
  // after data is loaded must NOT blank the tree — it surfaces as a dismissible
  // banner while the optimistic rollback keeps the tree intact.
  const loadFailed = !!error && !hasData

  return (
    // The redesign shell: `.rm` is the token + positioning context; `.rm-scroll`
    // is the height-constrained inner scroll region. `.rm-header` is sticky
    // INSIDE `.rm-scroll`; `.rm-pad` is the scrolling body. The portaled mobile
    // filter sheet and DebugTimeSlider sit on `.rm` itself, outside the scroll.
    <div className="rm" data-theme={theme} data-role={role}>
      <div className="rm-scroll">
        <header className="rm-header">
          <Header />
          <RolesTier />
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
                // .err-banner markup contract (index.css): icon + msg + dismiss.
                // Retry is deferred to Step 5. Copy reflects the optimistic
                // rollback — the failed edit is reverted, not "kept locally".
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
              <FoldersRow />
              <Tree />
              <TodaysLog />
            </>
          )}
        </main>
      </div>
      <DebugTimeSlider />
    </div>
  )
}
