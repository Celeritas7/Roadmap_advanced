-- Applied externally; do not re-run. Reference only.
-- Roadmap v1 schema, applied to Supabase project "General_apps".
-- All tables prefixed `roadmap_` to namespace within the shared project.
--
-- Updated 2026-05-25: single-user mode.
--   - RLS disabled on all roadmap_* tables.
--   - Foreign keys to auth.users dropped.
--   - user_id defaults at the DB layer; the app never sets it on insert/update.

-- ─── tables ───────────────────────────────────────────────────────────

create table if not exists roadmap_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,                            -- default supplied by the DB; app never sets this
  parent_id   uuid references roadmap_tasks on delete cascade,
  title       text not null,
  done        bool not null default false,
  kind        text not null check (kind in ('task', 'group')),
  position    int  not null default 0,
  expanded    bool not null default true,
  tags        text[] not null default '{}'::text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists roadmap_tasks_user_parent_pos_idx
  on roadmap_tasks (user_id, parent_id, position);

create table if not exists roadmap_daily_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid,                       -- default supplied by the DB; app never sets this
  task_id          uuid references roadmap_tasks on delete set null,
  log_date         date not null default current_date,
  context          text,
  duration_minutes int,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists roadmap_daily_logs_user_date_idx
  on roadmap_daily_logs (user_id, log_date desc);

create table if not exists roadmap_user_settings (
  user_id         uuid primary key,            -- default supplied by the DB; app never sets this
  role_overrides  jsonb not null default '{}'::jsonb,
  custom_rules    jsonb not null default '{}'::jsonb,
  preferences     jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- ─── auto-touch updated_at ────────────────────────────────────────────

create or replace function roadmap_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists roadmap_tasks_touch on roadmap_tasks;
create trigger roadmap_tasks_touch
  before update on roadmap_tasks
  for each row execute function roadmap_touch_updated_at();

drop trigger if exists roadmap_user_settings_touch on roadmap_user_settings;
create trigger roadmap_user_settings_touch
  before update on roadmap_user_settings
  for each row execute function roadmap_touch_updated_at();

-- ─── RLS: disabled (single-user mode) ─────────────────────────────────
-- alter table roadmap_tasks         disable row level security;
-- alter table roadmap_daily_logs    disable row level security;
-- alter table roadmap_user_settings disable row level security;
