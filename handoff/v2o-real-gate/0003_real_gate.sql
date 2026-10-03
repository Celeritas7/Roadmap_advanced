-- V2-O · Phase 1 revisit — supabase/migrations/0003_real_gate.sql
-- REWRITTEN against the live database (probed 2026-09-21). The earlier draft
-- was written from 0001's comments and was wrong in four ways; what follows
-- is what is actually there.
--
-- LIVE STATE BEFORE THIS MIGRATION
--   · RLS is ON for 5 tables — roadmap_tasks, roadmap_daily_logs,
--     roadmap_user_settings, roadmap_study_sessions, roadmap_task_resources —
--     but each carries one policy `<table>_all`: FOR ALL, TO PUBLIC,
--     USING (true) WITH CHECK (true). That is fully open. RLS being enabled
--     bought nothing.
--   · task_links and roadmap_contexts_map have RLS OFF and no policy at all.
--   · roadmap_session_days is a VIEW with no security_invoker, so it runs as
--     its owner and BYPASSES RLS entirely — a hole straight through any
--     policy we write. Fixed in step 5.
--   · user_id defaults to the zero uuid on tasks/daily_logs/user_settings,
--     and has NO default on study_sessions/task_resources (so those rows may
--     be NULL). Both cases are backfilled.
--
-- ORDER IS LOAD-BEARING: backfill, then defaults, then policies. Reversed,
-- the UPDATE runs under a policy no existing row satisfies and you end up
-- with a gated database containing zero readable rows.
--
-- Run the whole file as ONE transaction in the Supabase SQL editor.

begin;

-- ─── 0 · Guard ────────────────────────────────────────────────────────
-- Refuse if any row carries a user_id that is neither null, the zero uuid,
-- nor the owner — that would mean real multi-user data and a wrong backfill.
do $$
declare stray int;
begin
  select
    (select count(*) from roadmap_tasks          where user_id is not null and user_id not in ('00000000-0000-0000-0000-000000000000','e91a5f37-e63a-4fd0-8488-4d7a51d56822'))
  + (select count(*) from roadmap_daily_logs     where user_id is not null and user_id not in ('00000000-0000-0000-0000-000000000000','e91a5f37-e63a-4fd0-8488-4d7a51d56822'))
  + (select count(*) from roadmap_user_settings  where user_id is not null and user_id not in ('00000000-0000-0000-0000-000000000000','e91a5f37-e63a-4fd0-8488-4d7a51d56822'))
  + (select count(*) from roadmap_study_sessions where user_id is not null and user_id not in ('00000000-0000-0000-0000-000000000000','e91a5f37-e63a-4fd0-8488-4d7a51d56822'))
  + (select count(*) from roadmap_task_resources where user_id is not null and user_id not in ('00000000-0000-0000-0000-000000000000','e91a5f37-e63a-4fd0-8488-4d7a51d56822'))
  into stray;
  if stray > 0 then
    raise exception '% row(s) across roadmap_* carry an unexpected user_id — stop and inspect', stray;
  end if;
end $$;

-- ─── 1 · Backfill ─────────────────────────────────────────────────────
-- Expected: tasks 82, daily_logs 5, user_settings 1. study_sessions and
-- task_resources are whatever they are — both NULL and zero uuid are caught.

update roadmap_tasks          set user_id = 'e91a5f37-e63a-4fd0-8488-4d7a51d56822'
 where user_id is null or user_id = '00000000-0000-0000-0000-000000000000';
update roadmap_daily_logs     set user_id = 'e91a5f37-e63a-4fd0-8488-4d7a51d56822'
 where user_id is null or user_id = '00000000-0000-0000-0000-000000000000';
update roadmap_user_settings  set user_id = 'e91a5f37-e63a-4fd0-8488-4d7a51d56822'
 where user_id is null or user_id = '00000000-0000-0000-0000-000000000000';
update roadmap_study_sessions set user_id = 'e91a5f37-e63a-4fd0-8488-4d7a51d56822'
 where user_id is null or user_id = '00000000-0000-0000-0000-000000000000';
update roadmap_task_resources set user_id = 'e91a5f37-e63a-4fd0-8488-4d7a51d56822'
 where user_id is null or user_id = '00000000-0000-0000-0000-000000000000';

-- ─── 2 · Self-stamping columns ────────────────────────────────────────
-- Replaces the zero-uuid default (and adds one where there was none). The
-- app still never sets user_id; the DB stamps it from the JWT. NOT NULL so a
-- future anon insert fails loudly instead of writing an invisible row.

alter table roadmap_tasks          alter column user_id set default auth.uid();
alter table roadmap_daily_logs     alter column user_id set default auth.uid();
alter table roadmap_user_settings  alter column user_id set default auth.uid();
alter table roadmap_study_sessions alter column user_id set default auth.uid();
alter table roadmap_task_resources alter column user_id set default auth.uid();

alter table roadmap_tasks          alter column user_id set not null;
alter table roadmap_daily_logs     alter column user_id set not null;
alter table roadmap_study_sessions alter column user_id set not null;
alter table roadmap_task_resources alter column user_id set not null;
-- roadmap_user_settings.user_id is already NOT NULL (it is the primary key).

-- ─── 3 · Drop the permissive policies ─────────────────────────────────
-- These are the actual hole: FOR ALL, TO PUBLIC, USING (true).

drop policy if exists roadmap_tasks_all          on roadmap_tasks;
drop policy if exists roadmap_daily_logs_all     on roadmap_daily_logs;
drop policy if exists roadmap_user_settings_all  on roadmap_user_settings;
drop policy if exists roadmap_study_sessions_all on roadmap_study_sessions;
drop policy if exists roadmap_task_resources_all on roadmap_task_resources;

-- ─── 4 · Enable RLS where it is off, and write owner policies ─────────
-- Already on: the 5 above. Off: task_links, roadmap_contexts_map.

alter table task_links           enable row level security;
alter table roadmap_contexts_map enable row level security;

create policy roadmap_tasks_owner on roadmap_tasks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy roadmap_daily_logs_owner on roadmap_daily_logs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy roadmap_user_settings_owner on roadmap_user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy roadmap_study_sessions_owner on roadmap_study_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy roadmap_task_resources_owner on roadmap_task_resources
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- task_links has no user_id. It is owned transitively via rm_task_id, which
-- is NOT NULL and FK'd to roadmap_tasks — so the EXISTS is total.
create policy task_links_owner on task_links
  for all to authenticated
  using (exists (select 1 from roadmap_tasks t
                  where t.id = task_links.rm_task_id and t.user_id = auth.uid()))
  with check (exists (select 1 from roadmap_tasks t
                  where t.id = task_links.rm_task_id and t.user_id = auth.uid()));

-- Shared vocabulary, not user data: readable by any signed-in user, written
-- by migrations only.
create policy roadmap_contexts_map_read on roadmap_contexts_map
  for select to authenticated using (true);

-- ─── 5 · Close the view bypass ────────────────────────────────────────
-- Without security_invoker the view executes as its owner and ignores every
-- policy above. With it on, the view is evaluated as the querying user and
-- inherits roadmap_study_sessions' policy.

alter view roadmap_session_days set (security_invoker = on);

commit;

-- ─── Verify ───────────────────────────────────────────────────────────
-- Shape checks (SQL editor is fine — these read catalogs, not rows):
--
--   select c.relname, c.relrowsecurity, p.polname, p.polroles::regrole[],
--          pg_get_expr(p.polqual, p.polrelid)
--     from pg_class c left join pg_policy p on p.polrelid = c.oid
--    where c.relname like 'roadmap_%' or c.relname = 'task_links';
--   -- every listed TABLE: relrowsecurity true, one *_owner/_read policy,
--   -- polroles {authenticated}, and NO policy with using_expr = true.
--
--   select reloptions from pg_class where relname = 'roadmap_session_days';
--   -- {security_invoker=on}
--
-- Row checks must run from the BROWSER, signed in — auth.uid() is null in the
-- SQL editor, so every policy evaluates false there and you will see 0 rows:
--
--   const { supabase } = await import('/src/lib/supabase.ts')
--   console.log((await supabase.from('roadmap_tasks').select('id')).data?.length) // 82
--   console.log((await supabase.from('task_links').select('id')).data?.length)    // 12
--
-- And the negative test, in a private window (no session): the same calls
-- must return []. If they return rows, the gate did not take.
