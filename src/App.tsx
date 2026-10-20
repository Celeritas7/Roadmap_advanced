// V2-O — FULL REPLACEMENT for src/App.tsx
// Delta vs V2-N: the app is gated. No session → LoginPage, before any data
// view renders. This is the UI half of the gate; 0003_real_gate.sql is the
// half that actually protects the data. Shipping either alone is a mistake:
//   · migration without this → signed-out users see an empty app, not a prompt
//   · this without the migration → cosmetic, the anon key still reads everything
import { useEffect, useState } from 'react'
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
import { LoginPage } from './features/auth/LoginPage.tsx'
import { DebugTimeSlider } from './features/debug/DebugTimeSlider.tsx'
import { onWfAuthChange, wfAuthState, type WfAuthState } from './lib/wfAuth.ts'
import { bootHub } from './lib/rmHub.ts'
import { NowStrip } from './features/home/NowStrip.tsx'
import { InboxView } from './features/inbox/InboxView.tsx'
import { CaptureSheet } from './features/capture/CaptureSheet.tsx'

const search = new URLSearchParams(window.location.search)
const planParam = search.get('plan')
const loginParam = search.has('login')

export default function App() {
  const init = useStore((s) => s.init)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const hasData = useStore((s) => s.tree.length > 0)
  const clearError = useStore((s) => s.clearError)
  const theme = useStore((s) => s.theme)
  const view = useStore((s) => s.view)
  const [auth, setAuth] = useState<WfAuthState>('unknown')

  useEffect(() => {
    let live = true
    void wfAuthState().then((s) => {
      if (live) setAuth(s)
    })
    const off = onWfAuthChange((s) => setAuth(s))
    return () => {
      live = false
      off()
    }
  }, [])

  // init() only once there is a session to read with. Under RLS an anon fetch
  // returns [] rather than an error, which would render as a convincing empty
  // app — worse than not loading at all.
  useEffect(() => {
    if (auth === 'signed-in') void init()
  }, [auth, init])

  // V2-Q: the hub starts once — signed in AND the store loaded. AKATSUKI.md:
  // "consume only after the app's own state has loaded — signed in is not enough".
  // Not gated on hasData: an empty tree is a valid loaded state (the first
  // mirrors would be what fills it).
  useEffect(() => {
    if (auth === 'signed-in' && !loading && !error) void bootHub(useStore)
  }, [auth, loading, error])

  // Quick capture: `?capture` opens the sheet once the store is loaded (a
  // home-screen shortcut); `c` opens it from anywhere, except while typing.
  const ready = auth === 'signed-in' && !loading
  useEffect(() => {
    if (!ready) return
    if (search.has('capture')) useStore.getState().setCaptureOpen(true)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      if (useStore.getState().captureOpen || document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      useStore.getState().setCaptureOpen(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ready])

  useNow()
  
  const role = useEffectiveRoleId()
  const loadFailed = !!error && !hasData

  if (loginParam) {
    return (
      <div className="rm" data-theme={theme} data-role={role}>
        <LoginPage />
      </div>
    )
  }

  // 'unknown' is the pre-resolution frame. Render nothing rather than flash
  // the login page at a user who has a perfectly good persisted session.
  if (auth === 'unknown') {
    return <div className="rm" data-theme={theme} data-role={role} />
  }

  if (auth === 'signed-out') {
    return (
      <div className="rm" data-theme={theme} data-role={role}>
        <LoginPage />
      </div>
    )
  }

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
        {ready && !loadFailed && <CaptureSheet />}
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
              {view === 'home' ? (
                <>
                  <NowStrip />
                  <HomeView />
                </>
              ) : view === 'inbox' ? (
                <InboxView />
              ) : (
                <PlanFolders />
              )}
            </>
          )}
        </main>
      </div>
      <DebugTimeSlider />
    </div>
  )
}
