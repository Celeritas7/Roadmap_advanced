// V2-Q — FULL REPLACEMENT for src/features/header/WeeklySync.tsx
// The V2-D "↻ weekly" sync is gone with wfLink.ts — nothing syncs any more,
// the hub streams. This button is now the hub's status, plus the ··· account
// button. (Folds in the pending V2-N re-paste — skip that one.)
//   · no session   → '↻ sign in'      → login page
//   · booting      → '🌑 …'
//   · live         → '🌑 hub'  /  '🌑 N waiting' (ticks sent, WF hasn't replied)
//   · error        → '🌑 hub error'   → reload
// Header.tsx imports this as <WeeklySync /> — name kept so Header is untouched.
import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import { onWfAuthChange, wfAuthState, type WfAuthState } from '../../lib/wfAuth.ts'
import { BUILD_ID, pollReplies } from '../../lib/rmHub.ts'

function goToLogin() {
  const u = new URL(window.location.href)
  u.searchParams.set('login', '1')
  window.location.assign(u.toString())
}

export function WeeklySync() {
  const hubState = useStore((s) => s.hubState)
  const hubError = useStore((s) => s.hubError)
  const pending = useStore((s) => s.pendingDone.length)
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

  const signedOut = auth === 'signed-out'
  const label = signedOut
    ? '↻ sign in'
    : hubState === 'live'
      ? pending ? `🌑 ${pending} waiting` : '🌑 hub'
      : hubState === 'error'
        ? '🌑 hub error'
        : '🌑 …'

  const title = signedOut
    ? 'Sign in — the hub needs your session'
    : hubState === 'error'
      ? `Not connected to Akatsuki: ${hubError ?? 'unknown error'} — click to reload · build ${BUILD_ID}`
      : pending
        ? `${pending} tick(s) sent to Weekly Focus — waiting for its reply · build ${BUILD_ID}`
        : `Connected to Akatsuki · build ${BUILD_ID}`

  const onClick = () => {
    if (signedOut) return goToLogin()
    if (hubState === 'error') return window.location.reload()
    void pollReplies()
    void window.rm?.banner.refresh()
  }

  return (
    <>
      <button
        type="button"
        className="rm-tab"
        disabled={hubState === 'booting'}
        data-wf-deferred={(!signedOut && pending > 0) || undefined}
        data-wf-signin={signedOut || hubState === 'error' || undefined}
        onClick={onClick}
        title={title}
      >
        {label}
      </button>
      {!signedOut && (
        <button
          type="button"
          className="rm-tab rm-tab-icon"
          onClick={goToLogin}
          title="Account — sign out"
          aria-label="Account"
        >
          ···
        </button>
      )}
    </>
  )
}
