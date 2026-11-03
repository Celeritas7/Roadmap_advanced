// V2-R — FULL REPLACEMENT for src/lib/supabase.ts
// Delta vs V2-Q: storageKey 'rm_sb_auth' (STEP1-answers item 6). On GitHub Pages
// every app shares one origin, so Supabase's default key would be the SAME slot
// for Roadmap and Weekly Focus — signing out of one signed out the other.
// Side effect, once: the current session lives under the old key, so everyone
// is signed out on first load of this build and signs in again.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in the values.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storageKey: 'rm_sb_auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { headers: { 'x-akatsuki-app': 'rm' } },
})

// Akatsuki broadcast overlay: load the hub script once, start it with this client.
if (typeof document !== 'undefined') {
  const s = document.createElement('script')
  s.src = 'https://celeritas7.github.io/Akatsuki/js/akatsuki-broadcast.js'
  s.onload = () => (window as any).AkatsukiBroadcast?.(supabase, 'rm').start()
  document.head.appendChild(s)
}
