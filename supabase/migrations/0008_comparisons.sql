-- 0008_comparisons.sql — product comparisons, owned by Roadmap.
-- A comparison belongs to one shopping task and holds the products studied
-- for it. Another chat writes the study (roadmap_save_comparison); Roadmap
-- ranks the products by the owner's weights. Buying stays Cost's (hub route,
-- Phase 7) — nothing here touches cost_* or akatsuki_* tables.
-- Additive only; 0008_comparisons.rollback.sql is the undo.

begin;

create table roadmap_comparisons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  task_id     uuid references roadmap_tasks(id) on delete set null,
  title       text not null,
  need        text,                              -- what it is for, in one line
  weights     jsonb not null default '{}',       -- criterion → 0 (ignore) … 3 (high)
  source      text,                              -- which chat / study wrote it
  notes       text,
  chosen_item uuid,                              -- the owner's pick, if any
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index roadmap_comparisons_task on roadmap_comparisons(task_id);

create table roadmap_comparison_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  comparison_id   uuid not null references roadmap_comparisons(id) on delete cascade,
  name            text not null,
  brand           text,
  model           text,
  image_url       text,
  url             text,
  shop            text,
  price           numeric check (price >= 0),
  currency        text not null default 'JPY',
  quality         numeric check (quality between 0 and 5),     -- 0–5
  life_years      numeric check (life_years >= 0),             -- expected life
  warranty_months integer check (warranty_months >= 0),
  size            text,                                        -- size / fit, free text
  rating          numeric check (rating between 0 and 5),      -- review average, 0–5
  review_count    integer check (review_count >= 0),
  pros            text[] not null default '{}',
  cons            text[] not null default '{}',
  extra           jsonb not null default '{}',                 -- any other criterion: {"weight_g": 120}
  notes           text,
  position        integer not null default 0,
  created_at      timestamptz not null default now()
);
create index roadmap_comparison_items_cmp on roadmap_comparison_items(comparison_id);

alter table roadmap_comparisons enable row level security;
alter table roadmap_comparison_items enable row level security;
create policy roadmap_comparisons_owner on roadmap_comparisons
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy roadmap_comparison_items_owner on roadmap_comparison_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger roadmap_comparisons_updated_at before update on roadmap_comparisons
  for each row execute function roadmap_set_updated_at();

-- One call saves a whole study. Input (jsonb):
--   { "title": "Garlic crusher", "need": "…", "source": "…",
--     "task_id": uuid?        -- link to this task, or
--     "task_title": text?     -- link to the open task with this title, else
--                             -- a parked task is created in Captured › Shopping,
--     "user_id": uuid?        -- only when called without a signed-in user (SQL console)
--     "weights": { "price": 2, "quality": 3, "life": 2, … }?,
--     "items": [ { "name": …, "price": 2980, "quality": 4, "life_years": 5, … } ] }
-- Saving again for the same task + title replaces that comparison's products
-- (keeps the owner's weights and pick unless the input sets weights).
-- SECURITY INVOKER: an app user is held to RLS; the SQL console runs as owner.
create or replace function roadmap_save_comparison(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := coalesce(auth.uid(), nullif(p->>'user_id', '')::uuid);
  tid uuid := nullif(p->>'task_id', '')::uuid;
  ttl text := coalesce(nullif(trim(p->>'title'), ''), nullif(trim(p->>'task_title'), ''));
  cap uuid; shop uuid; cid uuid; it jsonb; n int := 0;
begin
  if uid is null then raise exception 'roadmap_save_comparison: no user (sign in, or pass user_id)'; end if;
  if ttl is null then raise exception 'roadmap_save_comparison: title is required'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'roadmap_save_comparison: items must be a non-empty array';
  end if;

  if tid is not null and not exists (select 1 from roadmap_tasks where id = tid and user_id = uid) then
    raise exception 'roadmap_save_comparison: task % not found', tid;
  end if;
  if tid is null and nullif(trim(p->>'task_title'), '') is not null then
    select id into tid from roadmap_tasks
     where user_id = uid and kind = 'task' and coalesce(done, false) = false
       and lower(title) = lower(trim(p->>'task_title'))
     order by created_at desc limit 1;
  end if;
  if tid is null then   -- same place a quick capture of "buy …" lands
    select id into cap from roadmap_tasks
     where user_id = uid and parent_id is null and kind = 'group' and title = 'Captured' and 'inbox' = any(tags)
     order by created_at limit 1;
    if cap is null then
      insert into roadmap_tasks (user_id, title, kind, tags) values (uid, 'Captured', 'group', '{inbox}') returning id into cap;
    end if;
    select id into shop from roadmap_tasks
     where user_id = uid and parent_id = cap and kind = 'group' and title = 'Shopping' order by created_at limit 1;
    if shop is null then
      insert into roadmap_tasks (user_id, parent_id, title, kind, tags) values (uid, cap, 'Shopping', 'group', '{shop}') returning id into shop;
    end if;
    insert into roadmap_tasks (user_id, parent_id, title, kind, tags, position)
    values (uid, shop, 'Buy ' || ttl, 'task', '{outside,short-burst,parked}',
            coalesce((select max(position) + 1 from roadmap_tasks where parent_id = shop), 0))
    returning id into tid;
  end if;

  select id into cid from roadmap_comparisons where user_id = uid and task_id = tid and lower(title) = lower(ttl) limit 1;
  if cid is null then
    insert into roadmap_comparisons (user_id, task_id, title, need, weights, source, notes)
    values (uid, tid, ttl, p->>'need', coalesce(p->'weights', '{}'), p->>'source', p->>'notes')
    returning id into cid;
  else
    update roadmap_comparisons
       set need = coalesce(p->>'need', need), source = coalesce(p->>'source', source),
           notes = coalesce(p->>'notes', notes), weights = coalesce(p->'weights', weights), chosen_item = null
     where id = cid;
    delete from roadmap_comparison_items where comparison_id = cid;
  end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    insert into roadmap_comparison_items (
      user_id, comparison_id, name, brand, model, image_url, url, shop, price, currency,
      quality, life_years, warranty_months, size, rating, review_count, pros, cons, extra, notes, position)
    values (
      uid, cid, coalesce(nullif(trim(it->>'name'), ''), 'Product ' || (n + 1)),
      it->>'brand', it->>'model', it->>'image_url', it->>'url', it->>'shop',
      (it->>'price')::numeric, coalesce(it->>'currency', 'JPY'),
      (it->>'quality')::numeric, (it->>'life_years')::numeric, (it->>'warranty_months')::int,
      it->>'size', (it->>'rating')::numeric, (it->>'review_count')::int,
      coalesce((select array_agg(x) from jsonb_array_elements_text(it->'pros') x), '{}'),
      coalesce((select array_agg(x) from jsonb_array_elements_text(it->'cons') x), '{}'),
      coalesce(it->'extra', '{}'), it->>'notes', n);
    n := n + 1;
  end loop;
  return cid;
end $$;

revoke all on function roadmap_save_comparison(jsonb) from public, anon;
grant execute on function roadmap_save_comparison(jsonb) to authenticated;

commit;

-- ─── Verify ───────────────────────────────────────────────────────────
--   select count(*) from roadmap_comparisons;                         -- 0 at first
--   select has_function_privilege('anon', 'roadmap_save_comparison(jsonb)', 'execute');  -- false
