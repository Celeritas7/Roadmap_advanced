# V2-O · Real gate — RLS + UI gate

Roadmap stops being readable without a session. Two halves, and **both must
ship together**:

| half | file | without the other |
|---|---|---|
| data | `0003_real_gate.sql.txt` | signed-out users see an empty app, not a prompt |
| UI | `App.tsx.txt` | cosmetic — the anon key still reads every row |

Depends on V2-N (`LoginPage.tsx`, `wfAuth.ts`) being applied first.

## What is actually there today

Probed live on 2026-09-21. This corrects 0001's comments, which are stale:

| object | state | verdict |
|---|---|---|
| `roadmap_tasks`, `roadmap_daily_logs`, `roadmap_user_settings`, `roadmap_study_sessions`, `roadmap_task_resources` | RLS **on**, one policy each: `FOR ALL · TO PUBLIC · USING (true) · WITH CHECK (true)` | fully open — RLS being on bought nothing |
| `task_links`, `roadmap_contexts_map` | RLS **off**, no policy | fully open |
| `roadmap_session_days` | VIEW, no `security_invoker` | **bypasses RLS entirely** — reads study sessions as the view's owner |
| `user_id` default | zero uuid on 3 tables, **none** on `study_sessions` / `task_resources` | those rows may be NULL |

So the anon key in your client bundle can currently read *and write*
everything, and the view would have punched through the gate even if the
first draft of this migration had been applied.

Backfill scope: tasks 82, daily_logs 5, user_settings 1, plus whatever
`study_sessions` and `task_resources` hold — both NULL and zero uuid are
caught.

## Blast radius — the app is deployed

**This needs a coordinated cutover, not just a migration.** The moment the SQL
runs, the live site reads nothing until the gated build is deployed.

Correct order:

1. Deploy the **V2-N + V2-O build** (login page + `App.tsx` gate) to
   production first. It still works against the open database.
2. Sign in on production, confirm the login page and sync both work there.
3. **Then** run the migration.
4. Re-check production: signed in shows data, private window shows the login
   page.

Also breaks, by design:

- **`?plan=` share links** — currently open to anyone with the URL, gated
  afterwards. If you share roadmaps that way, that is a product decision to
  make before running; this migration has no public-link policy.
- **Any script or curl using the anon key** — seeds, one-off fixes, sweeps.
- `wfLink.ts` is fine; it already runs only with a session.

Reversible via `0003_rollback.sql.txt`, which restores the exact `_all`
policies and the old defaults.

## Steps

1. Pre-flight (SQL editor):
   ```sql
   select 'tasks' t, count(*) from roadmap_tasks where user_id is null or user_id = '00000000-0000-0000-0000-000000000000'
   union all select 'logs', count(*) from roadmap_daily_logs where user_id is null or user_id = '00000000-0000-0000-0000-000000000000'
   union all select 'settings', count(*) from roadmap_user_settings where user_id is null or user_id = '00000000-0000-0000-0000-000000000000'
   union all select 'sessions', count(*) from roadmap_study_sessions where user_id is null or user_id = '00000000-0000-0000-0000-000000000000'
   union all select 'resources', count(*) from roadmap_task_resources where user_id is null or user_id = '00000000-0000-0000-0000-000000000000';
   ```
2. Paste `App.tsx.txt` over `src/App.tsx`, build, **deploy**.
3. Verify sign-in works in production.
4. Run `0003_real_gate.sql.txt` as one transaction.
5. Shape check and row check — both are written at the foot of the migration.
6. Negative test: private window, no session → login page, and
   `supabase.from('roadmap_tasks').select('id')` returns `[]`.

## Decisions baked in

- **`user_id` becomes `default auth.uid()` + `NOT NULL`.** The app still never
  sets it. NOT NULL means a future anon insert fails loudly rather than
  writing an invisible row.
- **`task_links` is owned transitively** via `rm_task_id` — no column added.
- **`roadmap_contexts_map` is read-only to any signed-in user.** Shared
  vocabulary, not user data. (Still read by no code — Phase 1 audit.)
- **`roadmap_session_days` gets `security_invoker = on`.** Without it the view
  is a hole through everything else here.
- **The rollback keeps the backfill.** Harmless under a permissive policy, and
  the one piece worth keeping.

## Not included

Multi-user. Every policy is `user_id = auth.uid()` against a single
backfilled owner — correct for one user and the right foundation for more,
but there is no sharing, org, or invite path. That is a schema change, not a
policy change.
