# V2-N · Login page for Roadmap

Replaces the header sign-in popover with a real route at **`?login=1`**.

The popover is the wrong shape for this problem regardless of why it wasn't
clickable: it only exists if `<WeeklySync />` renders, and it puts the one
screen you need when the app is broken inside the app's header. A URL you can
type always works.

> **The header bug is NOT explained by this handoff.** A later audit found
> `<Header />` mounted unconditionally at `App.tsx:60`, `<WeeklySync />`
> rendered at `Header.tsx:63`, no hiding CSS, and a clean build — so there is
> no code path where the button renders nothing. `?login=1` unblocks sign-in
> either way, but if the header is still blank after applying this, that is a
> real unexplained bug, not something V2-N fixed. Check
> `document.querySelector('.rm-meta')` before assuming otherwise.

## Files

| File | Destination |
|---|---|
| `wfAuth.ts.txt` | `src/lib/wfAuth.ts` (full replacement) |
| `LoginPage.tsx.txt` | `src/features/auth/LoginPage.tsx` (new) |
| `login.css.APPEND.css` | append to `src/index.css` |
| `App.tsx.txt` | `src/App.tsx` (full replacement) |
| `WeeklySync.tsx.txt` | `src/features/header/WeeklySync.tsx` (full replacement) |

Apply in that order — see `APPLY.md`. Every step is select-all → paste.

## Behaviour

- **Signed out** — email field with `Email me a sign-in link` as the primary
  action, `Use a password instead` as a disclosed fallback carrying the note
  that the WF account has no password set, then `Continue with Google` under
  an `or` divider — it resolves to the same `auth.uid()` as WF (an account with
  no `encrypted_password` is what a Google-created account looks like).
  `← Continue without syncing` returns to Roadmap; Roadmap's own data is anon
  and works fine unsynced.
- **Link sent** — confirmation naming the address, and the constraint that
  matters (same browser), with an escape back to the field.
- **Link lands** — `detectSessionInUrl` picks the session up, the auth
  subscription fires, and the page `replace()`s itself with the app URL
  (`?login` stripped, hash cleared) so the token never sits in history.
- **Already signed in** — names the account, `Back to Roadmap` / `Sign out`.
  Guarded by a ref, so deliberately visiting `?login=1` while signed in shows
  this panel instead of bouncing you straight out of it.

## One sync per landing

`WeeklySync` no longer syncs on the auth-change event. The post-login landing
already runs `init()` → `syncWeekly()`, and `wfSyncing` only guards within a
single tab — firing on sign-in too would race that pass. That race is what
produced the duplicate "Languages" folder and the orphaned insert in pass 1.
The button's label still flips live; only the extra sync is gone.

## Still to verify (the V2-D step 3 that was blocked)

1. `npm run dev`, then go to `http://localhost:5173/?login=1` **directly** —
   do not rely on the header button.
2. `Email me a sign-in link` and open it in the same browser, or
   `Continue with Google` and pick the WF account. Keep **one tab open** —
   concurrent syncs are what stranded rows in pass 1. You should land on the
   app with a clean URL and see exactly one `[wf] sync` line in the console.
3. Confirm `auth.uid()` is `e91a5f37-e63a-4fd0-8488-4d7a51d56822`.
4. Then the header button should read `↻ weekly`. If it still doesn't render,
   that's a *separate* Header-wiring bug — the sync path is no longer blocked
   on it, but it is also not fixed by this handoff (see the note at the top).

## Known leftovers after applying

- The old `.wf-wrap` / `.wf-pop*` / `.wf-input` rules in `index.css` (~20
  lines) become dead once the popover is gone. The `data-wf-deferred` and
  `data-wf-signin` tints stay live — don't delete those.
- Signing out on the login page and then signing in *without reloading* won't
  auto-bounce you to the app (`preexisting` is still true). Harmless: both
  working routes are full-page redirects.
- V2-N prevents a recurrence of the pass-1 race but cleans nothing up — the
  two stray rows (duplicate `Languages` folder + orphaned insert) are still
  pending deletion.

`http://localhost:5173/` must be in the Supabase project's allowed redirect
URLs or the link bounces.
