# V2-N · APPLY

> **Status: steps 1–5 are applied** (CC, Sep 21) and the build is clean. The
> paste table below is kept as the record of what landed where. Skip to
> **Test** unless you're re-applying from scratch.

## The five pastes

Paths are relative to the Roadmap repo root (where `package.json` is).
Every step is select-all → paste. Do them in this order; the app compiles
cleanly after step 5, not before.

| # | Handoff file | → Destination | Action |
|---|---|---|---|
| 1 | `wfAuth.ts.txt` | `src/lib/wfAuth.ts` | replace whole file |
| 2 | `LoginPage.tsx.txt` | `src/features/auth/LoginPage.tsx` | **new** — create the `auth/` folder first |
| 3 | `login.css.APPEND.css` | `src/index.css` | paste at the **end** of the file |
| 4 | `App.tsx.txt` | `src/App.tsx` | replace whole file |
| 5 | `WeeklySync.tsx.txt` | `src/features/header/WeeklySync.tsx` | replace whole file |

Step 4's `App.tsx` is your current V2-F file plus one import, the `loginParam`
read, and the early return — nothing else moved. If you've edited `App.tsx`
since V2-F, diff before pasting.

---

## Supabase settings — check before testing

Authentication → URL Configuration → **Redirect URLs** must include:

```
http://localhost:5173
http://localhost:5173/
http://localhost:5173/**
```

The wildcard is not redundant. `goToLogin()` builds the login URL from
`window.location.href`, so clicking ↻ from `?plan=dx` gives `?plan=dx&login=1`
— and `appUrl()` then hands Supabase `http://localhost:5173/?plan=dx`, which
matches neither literal entry. Opening `?login=1` directly resolves to the
bare origin and is fine; this only bites via the header button.

Authentication → Providers → **Google** must be enabled. If Weekly Focus signs
in with Google already, it is — same project, same config.

---

## Test

```
npm run dev
```

**0. Close every open `localhost:5173` tab first.** Not "don't open a second
one" — close the ones already open. A Vite HMR client was attached through
the apply, and two concurrent syncs are exactly what stranded rows in pass 1.

1. Open `http://localhost:5173/?login=1` **directly** — one tab, not via the
   header button.

   **If you land on "Already signed in"**, that's expected, not a failure: the
   Sep 20 session persists (`persistSession` + `autoRefreshToken`) and the
   `preexisting` ref suppresses the auto-bounce. Skip step 2 — click
   `Back to Roadmap` and the landing itself runs the pass. To exercise the
   form instead, `Sign out` first, then reload.

2. `Email me a sign-in link` (open it in the same browser) or
   `Continue with Google` → pick the WF account.
3. You land back on `http://localhost:5173/` with a clean URL. Console shows
   exactly **one** `[wf] sync` line. The key order is the object's own, as
   logged: `imported, merged, pushed, deferred, orphaned, held`.

   **None of these are fixed numbers.** The WF board is actively written to,
   so every counter is derived from its state at the moment you sync. What to
   expect, as rules rather than values:

   | counter | expected |
   |---|---|
   | `imported` | the count of open `study:` subs **not already in `task_links`** — 0 when nothing new was added to WF, but 1+ is correct behaviour if a study task appeared |
   | `orphaned` | the count of linked subs no longer open — 0 while all 12 stay open; park one in WF and 1 is right |
   | `merged`, `pushed`, `deferred` | 0 — pass 1 is import-only, no RM-side edits |
   | `held` | a tally of non-study open subs. Drifts constantly, with no timestamp to signal it. Never match it against a number in a doc. |

   Only `merged`/`pushed`/`deferred` are unconditional zeros. The structural
   invariants that actually prove row 18 are `task_links` = 12 and
   `roadmap_tasks` = 82 with no new folders — **provided** no study task was
   added to WF since the last check.

   Because the board is live, run the **pre-flight query** below immediately
   before you sync so you know the expected `imported` / `orphaned` / `held`
   from the same minute. A number that differs from a stale expectation is
   usually WF having moved, not the sync misbehaving.

   ```sql
   with subs as (
     select e.item_key, split_part(e.item_key,':',1) as prefix, s.value as sub
     from weekly_focus_entries e
     cross join lateral jsonb_array_elements(coalesce(e.payload->'subtasks','[]'::jsonb)) s(value)
     where e.board_id = 'my_week' and e.item_key <> '__board'
   ), open_subs as (
     select * from subs
     where not coalesce((sub->>'done')::boolean,false)
       and not coalesce((sub->>'del')::boolean,false)
       and not coalesce((sub->>'lat')::boolean,false)
   ), open_study as (
     select item_key, sub->>'id' as sub_id from open_subs where prefix = 'study'
   )
   select
     (select count(*) from open_study o
        where not exists (select 1 from task_links l
          where l.wf_item_key = o.item_key and l.wf_sub_id = o.sub_id))            as expect_imported,
     (select count(*) from task_links l where l.orphaned_at is null
        and not exists (select 1 from open_study o
          where o.item_key = l.wf_item_key and o.sub_id = l.wf_sub_id))            as expect_orphaned,
     (select count(*) from open_subs where prefix <> 'study')                      as expect_held,
     (select count(*) from task_links)                                            as link_rows_before,
     (select count(*) from roadmap_tasks)                                         as rm_tasks_before,
     (select count(*) from roadmap_tasks where parent_id is null and kind='group') as top_folders_before;
   ```

   Last run 2026-09-21 04:12Z: `imported 0 · orphaned 0 · held 173`, with
   `12 / 82 / 9` before. Re-run it rather than trusting that line.
4. Confirm the session is the WF account — **from the browser console**, not
   the Supabase SQL editor (`select auth.uid()` there returns null; the editor
   isn't your session):
   ```js
   const { supabase } = await import('/src/lib/supabase.ts')
   const { data } = await supabase.auth.getSession()
   console.log(data.session?.user?.id, data.session?.user?.email)
   // expect e91a5f37-e63a-4fd0-8488-4d7a51d56822
   ```
5. The header should now read `↻ weekly`. If it still doesn't render at all,
   that is a separate Header-wiring bug — sync is no longer blocked on it.

### If something fails

| Symptom | Cause |
|---|---|
| Blank page at `?login=1` | Step 2 path wrong (`src/features/auth/LoginPage.tsx`). Check the console for the import error. |
| `?login=1` shows "Already signed in" | Not a failure — the Sep 20 session persists. `Back to Roadmap`, or `Sign out` to see the form. |
| `redirect_uri_mismatch` from Google | The origin isn't in Supabase's redirect URL list — including the `/**` wildcard if you came via the header button from a `?plan=` URL. |
| `Unsupported provider` | Google provider not enabled on the project. |
| Signed in, but `auth.uid()` is a NEW uuid | The Google account chosen isn't the WF one. Sign out, retry, pick the right account. |
| Lands back on `?login=1` instead of the app | Step 1 not applied — old `signInWfMagic` ignores the `redirectTo` argument. |
| Error text unreadable on Summit | You pasted an older `login.css.APPEND.css` — the dark rule must be scoped `[data-theme="summit"]`, not `"dark"`. |
| **Two** `[wf] sync` lines on landing | Step 5 not applied — the old `WeeklySync` still syncs on the auth-change event, racing `init()`. |
| `imported:` is not 0 | Only an alarm if no new `study:` sub was added to WF. Check that first; if none was, a second tab raced the pass or the stray-row cleanup was undone — re-check `task_links` (12) and `roadmap_tasks` (82) before syncing again. |
| `held:` isn't the number you expected | Not a failure. `held` drifts whenever anything is added, parked, or deleted in WF, with no timestamp to signal it. |
