// V2-N — NEW FILE src/features/auth/LoginPage.tsx
// A real page instead of the header popover. Reached at `?login=1`, so it is
// reachable even when the header control is stale or silently unmounted —
// which is the exact failure that produced this file.
//
// Roadmap itself stays anon. This session exists only so the RLS-gated Weekly
// Focus tables accept reads/writes. Auth still lives entirely in wfAuth.ts;
// this file never touches supabase.auth directly.
import { useEffect, useRef, useState } from 'react'
import {
  onWfAuthChange,
  signInWf,
  signInWfGoogle,
  signInWfMagic,
  signOutWf,
  wfAuthState,
  wfUserEmail,
  type WfAuthState,
} from '../../lib/wfAuth.ts'

// The emailed link must land on the APP, not back on this page.
function appUrl(): string {
  const u = new URL(window.location.href)
  u.searchParams.delete('login')
  u.hash = ''
  return u.toString()
}

export function LoginPage() {
  const [auth, setAuth] = useState<WfAuthState>('unknown')
  const [who, setWho] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState<'google' | 'link' | 'password' | null>(null)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // A session that already existed when this page opened is someone visiting
  // deliberately; one that APPEARS while it is open is the magic link landing.
  // Only the second case should bounce back to the app.
  const preexisting = useRef(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const s = await wfAuthState()
      if (!live) return
      preexisting.current = s === 'signed-in'
      setAuth(s)
      setWho(await wfUserEmail())
    })()
    const off = onWfAuthChange(async (s) => {
      setAuth(s)
      setWho(await wfUserEmail())
      if (s === 'signed-in' && !preexisting.current) window.location.replace(appUrl())
    })
    return () => {
      live = false
      off()
    }
  }, [])

  const google = async () => {
    if (busy) return
    setBusy('google')
    setErr(null)
    // Full-page redirect to Google; on return detectSessionInUrl fires the
    // auth subscription above, which bounces to appUrl(). Only reaches the
    // lines below if the redirect itself failed to start.
    const message = await signInWfGoogle(appUrl())
    setBusy(null)
    if (message) setErr(message)
  }

  const sendLink = async () => {
    if (busy) return
    setBusy('link')
    setErr(null)
    const message = await signInWfMagic(email.trim(), appUrl())
    setBusy(null)
    if (message) setErr(message)
    else setSent(true)
  }

  const submitPassword = async () => {
    if (busy) return
    setBusy('password')
    setErr(null)
    const message = await signInWf(email.trim(), password)
    setBusy(null)
    if (message) setErr(message)
    // Success is handled by onWfAuthChange → replace(appUrl()).
  }

  if (auth === 'signed-in') {
    return (
      <div className="lg-page">
        <div className="lg-card">
          <div className="lg-mark" aria-hidden="true">↻</div>
          <h1 className="lg-title">Already signed in</h1>
          <p className="lg-sub">
            Weekly Focus sync is authorised in this browser{who ? ' as ' : '.'}
            {who && <span className="lg-who">{who}</span>}
          </p>
          <div className="lg-row">
            <button type="button" className="lg-btn primary" onClick={() => window.location.replace(appUrl())}>
              Back to Roadmap
            </button>
            <button
              type="button"
              className="lg-btn"
              onClick={() => void signOutWf().then(() => setSent(false))}
            >
              Sign out
            </button>
          </div>
          <p className="lg-note">
            Signing out stops Weekly Focus sync only. Roadmap's own tasks are
            anon-readable and are unaffected either way.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="lg-page">
      <div className="lg-card">
        <div className="lg-mark" aria-hidden="true">↻</div>
        <h1 className="lg-title">Connect Weekly Focus</h1>
        <p className="lg-sub">
          Sign in as the Weekly Focus account. The session is stored in this
          browser only, and exists so the RLS-gated WF tables accept the sync.
        </p>

        {sent ? (
          <div className="lg-ok" role="status">
            <strong>Link sent to {email.trim()}.</strong>
            <span>
              Open it in <em>this</em> browser — the session is picked up on
              load and you'll land back on Roadmap.
            </span>
            <button type="button" className="lg-alt" onClick={() => setSent(false)}>
              Use a different address
            </button>
          </div>
        ) : (
          <>
            <label className="lg-field">
              <span className="lg-label">Email</span>
              <input
                className="lg-input"
                type="email"
                autoComplete="username"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email.trim() && !showPw) void sendLink()
                }}
              />
            </label>

            {showPw && (
              <label className="lg-field">
                <span className="lg-label">Password</span>
                <input
                  className="lg-input"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && email.trim() && password) void submitPassword()
                  }}
                />
              </label>
            )}

            {showPw ? (
              <button
                type="button"
                className="lg-btn primary"
                disabled={!!busy || !email.trim() || !password}
                onClick={() => void submitPassword()}
              >
                {busy === 'password' ? 'Signing in…' : 'Sign in'}
              </button>
            ) : (
              <button
                type="button"
                className="lg-btn primary"
                disabled={!!busy || !email.trim()}
                onClick={() => void sendLink()}
              >
                {busy === 'link' ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            )}

            <button type="button" className="lg-alt" onClick={() => setShowPw((v) => !v)}>
              {showPw ? 'Use an emailed link instead' : 'Use a password instead'}
            </button>

            {showPw && (
              <p className="lg-note">
                The WF account has no password set, so this route fails until
                one is added in Supabase. The emailed link is the working one.
              </p>
            )}
            <div className="lg-or" aria-hidden="true"><span>or</span></div>

            <button
              type="button"
              className="lg-btn lg-google"
              disabled={!!busy}
              onClick={() => void google()}
            >
              <GoogleMark />
              {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
            </button>
          </>
        )}

        {err && (
          <p className="lg-err" role="alert">
            {err}
          </p>
        )}

        <a className="lg-back" href={appUrl()}>
          ← Continue without syncing
        </a>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg className="lg-gmark" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}
