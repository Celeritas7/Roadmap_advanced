// V2-N — FULL REPLACEMENT for src/lib/wfAuth.ts — the ONE place Roadmap
// touches Supabase auth.
//
// Roadmap itself stays anon: roadmap_tasks is USING (true) and its user_id
// default is the zero uuid, so nothing about Roadmap's own reads/writes
// changes when a session exists. The session exists purely so the WF tables
// (RLS: auth.uid()::text = user_id::text, role `authenticated`) accept us.
//
// supabase.ts already has persistSession + autoRefreshToken + detectSessionInUrl,
// so one successful sign-in survives reloads until it is revoked.
//
// Delta vs V2-D: signInWfMagic takes an optional redirect target (the login
// page lives at ?login=1 and must NOT be where the link lands); new
// signInWfGoogle and wfUserEmail.

import { supabase } from './supabase.ts'

export type WfAuthState = 'unknown' | 'signed-out' | 'signed-in'

export async function hasWfSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  return !!data.session
}

export async function wfAuthState(): Promise<WfAuthState> {
  return (await hasWfSession()) ? 'signed-in' : 'signed-out'
}

/** The signed-in account's email, or null when signed out. Display only. */
export async function wfUserEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.email ?? null
}

/** Email + password — FALLBACK ONLY. The WF account currently has no password
 *  set (no encrypted_password in auth.users), so this fails until one is added. */
export async function signInWf(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? error.message : null
}

/** PRIMARY email route. Magic link — the WF account has no password.
 *  `redirectTo` (default: current origin + path) must be in the Supabase
 *  project's allowed redirect URLs; detectSessionInUrl picks the session up on
 *  load. The link must be opened in the SAME browser as Roadmap. */
export async function signInWfMagic(
  email: string,
  redirectTo?: string,
): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo ?? window.location.origin + window.location.pathname,
    },
  })
  return error ? error.message : null
}

/** Google OAuth — full-page redirect. The WF account has no encrypted_password,
 *  which is what a Google-created account looks like; this returns the SAME
 *  auth.uid(), it does not mint a new user. Resolves only if the redirect
 *  could not even start. */
export async function signInWfGoogle(redirectTo?: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo ?? window.location.origin + window.location.pathname,
      queryParams: { prompt: 'select_account' },
    },
  })
  return error ? error.message : null
}

export async function signOutWf(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' })
}

/** Subscribe to session changes; returns the unsubscribe fn. */
export function onWfAuthChange(cb: (state: WfAuthState) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_e, session) => {
    cb(session ? 'signed-in' : 'signed-out')
  })
  return () => data.subscription.unsubscribe()
}
