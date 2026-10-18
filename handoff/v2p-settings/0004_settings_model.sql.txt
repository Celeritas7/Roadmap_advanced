-- V2-P · Settings — supabase/migrations/0004_settings_model.sql
-- Rev Oct 4: re-runnable (drop policy if exists) · 'wf'/'weekly' projects removed
-- (dropped from seed.ts in V2-Q) · runs after 0005/0006 — numbering is history only.
-- Moves roles, projects, and locations out of seed.ts and into the database.
-- seed.ts stays in the repo as the "Restore defaults" source only; nothing
-- reads it at runtime after the UI half ships.
--
-- Depends on 0003_real_gate.sql (RLS, auth.uid() ownership). Every table
-- here follows the same pattern: user_id NOT NULL DEFAULT auth.uid(), RLS on,
-- one owner policy, TO authenticated.
--
-- KEYING: (id, user_id) composite primary key. The text id stays readable
-- because folder tags (`tags @> ['dx']`) and `?plan=dx` URLs are built from
-- it, and the composite makes a second user non-colliding without uuid churn.
-- Every FK between these tables is composite for the same reason.
--
-- This migration is UI-independent: run it, verify, and the app keeps working
-- off seed.ts until the Settings modal ships.

begin;

-- ─── locations ────────────────────────────────────────────────────────
-- Roadmap's own vocabulary — where you physically are. Deliberately NOT the
-- same list as roadmap_contexts_map: three ids overlap (home/office/train)
-- but @deep-work, @phone-only and the two Claude contexts are modes, not
-- places. Settings shows the overlap; nothing syncs between them.

create table if not exists roadmap_locations (
  id       text not null,
  user_id  uuid not null default auth.uid(),
  label    text not null,
  position int  not null default 0,
  primary key (id, user_id)
);

-- ─── roles ────────────────────────────────────────────────────────────
-- Hours are ints 0–23, matching seed.ts's defaultStart / defaultEnd.
-- weekend_start / weekend_end are null unless the role overrides its window
-- at the weekend (only Defenders does today: 09–21).

create table if not exists roadmap_roles (
  id             text not null,
  user_id        uuid not null default auth.uid(),
  label          text not null,
  subtitle       text not null default '',
  badge          text not null default '',
  mood           text not null default '',
  hue            int  not null default 220 check (hue between 0 and 360),
  start_hour     int  not null default 9  check (start_hour between 0 and 23),
  end_hour       int  not null default 19 check (end_hour   between 0 and 23),
  weekend_active bool not null default false,
  weekend_start  int  check (weekend_start between 0 and 23),
  weekend_end    int  check (weekend_end   between 0 and 23),
  position       int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (id, user_id)
);

-- Which locations a role runs in. Join table rather than text[] so a renamed
-- or deleted location cannot leave a dangling string behind.
create table if not exists roadmap_role_locations (
  role_id     text not null,
  location_id text not null,
  user_id     uuid not null default auth.uid(),
  primary key (role_id, location_id, user_id),
  foreign key (role_id, user_id)     references roadmap_roles (id, user_id)     on delete cascade,
  foreign key (location_id, user_id) references roadmap_locations (id, user_id) on delete cascade
);

-- ─── projects ─────────────────────────────────────────────────────────
-- role_id is NULLABLE: null means Unassigned, which is where a project lands
-- if its role is deleted without reassignment. Deleting a PROJECT does not
-- cascade to tasks — tasks are untagged by the app, and surface under the
-- Unassigned card on Home.

create table if not exists roadmap_projects (
  id         text not null,
  user_id    uuid not null default auth.uid(),
  label      text not null,
  short      text not null default '',
  hue        int  not null default 220 check (hue between 0 and 360),
  role_id    text,
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id),
  foreign key (role_id, user_id) references roadmap_roles (id, user_id) on delete set null
);

create index if not exists roadmap_projects_role_idx on roadmap_projects (user_id, role_id, position);

-- ─── touch triggers ───────────────────────────────────────────────────
-- Uses the LIVE function, roadmap_set_updated_at() — the one roadmap_tasks and
-- roadmap_user_settings already run (checked Oct 4). 0001's
-- roadmap_touch_updated_at() was never applied; don't create a second copy.

drop trigger if exists roadmap_roles_set_updated_at on roadmap_roles;
create trigger roadmap_roles_set_updated_at before update on roadmap_roles
  for each row execute function roadmap_set_updated_at();

drop trigger if exists roadmap_projects_set_updated_at on roadmap_projects;
create trigger roadmap_projects_set_updated_at before update on roadmap_projects
  for each row execute function roadmap_set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────

alter table roadmap_locations      enable row level security;
alter table roadmap_roles          enable row level security;
alter table roadmap_role_locations enable row level security;
alter table roadmap_projects       enable row level security;

drop policy if exists roadmap_locations_owner on roadmap_locations;
create policy roadmap_locations_owner on roadmap_locations
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists roadmap_roles_owner on roadmap_roles;
create policy roadmap_roles_owner on roadmap_roles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists roadmap_role_locations_owner on roadmap_role_locations;
create policy roadmap_role_locations_owner on roadmap_role_locations
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists roadmap_projects_owner on roadmap_projects;
create policy roadmap_projects_owner on roadmap_projects
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── seed: exactly what seed.ts holds today ───────────────────────────
-- user_id is written explicitly rather than via auth.uid(), because the SQL
-- editor has no session — auth.uid() is null there and every row would be
-- invisible the moment RLS evaluated it.

insert into roadmap_locations (id, user_id, label, position) values
  ('home',   'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Home',   0),
  ('office', 'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Office', 1),
  ('train',  'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Train',  2)
on conflict (id, user_id) do nothing;

insert into roadmap_roles
  (id, user_id, label, subtitle, badge, mood, hue, start_hour, end_hour, weekend_active, weekend_start, weekend_end, position) values
  ('attackers',  'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Attackers',   'ambitions',    'FWD', 'Push your ambitions forward',  18,  9, 19, false, null, null, 0),
  ('midplayers', 'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Mid-players', 'life support', 'MID', 'Keep the engine running',     158, 19, 21, true,  null, null, 1),
  ('defenders',  'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Defenders',   'self-care',    'DEF', 'Guard your base',             252, 21, 23, true,  9,    21,   2)
on conflict (id, user_id) do nothing;

insert into roadmap_role_locations (role_id, location_id, user_id) values
  ('attackers',  'home',   'e91a5f37-e63a-4fd0-8488-4d7a51d56822'),
  ('attackers',  'office', 'e91a5f37-e63a-4fd0-8488-4d7a51d56822'),
  ('attackers',  'train',  'e91a5f37-e63a-4fd0-8488-4d7a51d56822'),
  ('midplayers', 'home',   'e91a5f37-e63a-4fd0-8488-4d7a51d56822'),
  ('midplayers', 'office', 'e91a5f37-e63a-4fd0-8488-4d7a51d56822'),
  ('defenders',  'home',   'e91a5f37-e63a-4fd0-8488-4d7a51d56822')
on conflict (role_id, location_id, user_id) do nothing;

insert into roadmap_projects (id, user_id, label, short, hue, role_id, position) values
  ('dx',        'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'DX Engineer',  'DX',    18,  'attackers',  0),
  ('fullstack', 'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Fullstack',    'Full',  220, 'attackers',  1),
  ('lang',      'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Languages',    'Lang',  138, 'attackers',  2),
  ('visa',      'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Visa',         'Visa',  200, 'attackers',  3),
  ('food',      'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Food',         'Food',  38,  'midplayers', 0),
  ('exercise',  'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Exercise',     'Exer',  165, 'midplayers', 1),
  ('sleep',     'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Sleep',        'Sleep', 250, 'defenders',  0),
  ('fashion',   'e91a5f37-e63a-4fd0-8488-4d7a51d56822', 'Fashion',      'Style', 320, 'defenders',  1)
on conflict (id, user_id) do nothing;

commit;

-- ─── Verify ───────────────────────────────────────────────────────────
-- Shape (SQL editor is fine — catalogs, not rows):
--   select c.relname, c.relrowsecurity, p.polname, p.polroles::regrole[]
--     from pg_class c left join pg_policy p on p.polrelid = c.oid
--    where c.relname in ('roadmap_roles','roadmap_projects','roadmap_locations',
--                        'roadmap_role_locations');
--   -- all relrowsecurity true, one _owner policy each, roles {authenticated}
--
-- Rows (SQL editor CAN read these — it is the postgres role, which bypasses
-- RLS; that is why the seed wrote user_id explicitly):
--   select count(*) from roadmap_roles;      -- 3
--   select count(*) from roadmap_projects;   -- 8
--   select count(*) from roadmap_locations;  -- 3
--   select count(*) from roadmap_role_locations; -- 6
--
-- Owner check — every seeded row must carry the WF uuid, or the app will see
-- nothing once it reads these tables:
--   select count(*) from roadmap_projects
--    where user_id <> 'e91a5f37-e63a-4fd0-8488-4d7a51d56822';  -- 0
--
-- From the browser, signed in:
--   const { supabase } = await import('/src/lib/supabase.ts')
--   console.log((await supabase.from('roadmap_roles').select('id')).data)     // 3
--   console.log((await supabase.from('roadmap_projects').select('id')).data)  // 10
