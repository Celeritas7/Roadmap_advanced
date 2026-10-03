-- V2-O · ROLLBACK for 0003_real_gate.sql
-- Restores the permissive `_all` policies exactly as they were before the
-- gate: FOR ALL, TO PUBLIC, USING (true) WITH CHECK (true).
--
-- Does NOT revert the user_id backfill — the owner uuid is harmless under a
-- permissive policy, and it is the one part worth keeping.

begin;

drop policy if exists roadmap_tasks_owner          on roadmap_tasks;
drop policy if exists roadmap_daily_logs_owner     on roadmap_daily_logs;
drop policy if exists roadmap_user_settings_owner  on roadmap_user_settings;
drop policy if exists roadmap_study_sessions_owner on roadmap_study_sessions;
drop policy if exists roadmap_task_resources_owner on roadmap_task_resources;
drop policy if exists task_links_owner             on task_links;
drop policy if exists roadmap_contexts_map_read    on roadmap_contexts_map;

create policy roadmap_tasks_all          on roadmap_tasks          for all using (true) with check (true);
create policy roadmap_daily_logs_all     on roadmap_daily_logs     for all using (true) with check (true);
create policy roadmap_user_settings_all  on roadmap_user_settings  for all using (true) with check (true);
create policy roadmap_study_sessions_all on roadmap_study_sessions for all using (true) with check (true);
create policy roadmap_task_resources_all on roadmap_task_resources for all using (true) with check (true);

-- These two had RLS off entirely before the gate.
alter table task_links           disable row level security;
alter table roadmap_contexts_map disable row level security;

-- NOT NULL blocks anon inserts, which stamp null once auth.uid() is null.
alter table roadmap_tasks          alter column user_id drop not null;
alter table roadmap_daily_logs     alter column user_id drop not null;
alter table roadmap_study_sessions alter column user_id drop not null;
alter table roadmap_task_resources alter column user_id drop not null;

-- Back to the zero-uuid default where there was one; the two that had no
-- default get it dropped.
alter table roadmap_tasks          alter column user_id set default '00000000-0000-0000-0000-000000000000';
alter table roadmap_daily_logs     alter column user_id set default '00000000-0000-0000-0000-000000000000';
alter table roadmap_user_settings  alter column user_id set default '00000000-0000-0000-0000-000000000000';
alter table roadmap_study_sessions alter column user_id drop default;
alter table roadmap_task_resources alter column user_id drop default;

alter view roadmap_session_days set (security_invoker = off);

commit;
