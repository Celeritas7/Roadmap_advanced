-- V2-S · R023 — supabase/migrations/0007_places_to_hub.sql
-- STEP3 calls this "0006"; Roadmap's 0006 is already step2.sql (V2-R), so it ships as 0007.
-- roadmap_locations → akatsuki_places. The hub copied home/office/train in.
-- roadmap_role_locations.location_id now holds akatsuki_places.id.
-- No new FK: the hub owns the list and never hard-deletes (retirePlace), so a
-- role can't be left pointing at nothing. One-way; 0007_rollback.sql is the undo.

begin;

do $$
declare missing int; fk text;
begin
  if to_regclass('public.akatsuki_places') is null then
    raise exception 'akatsuki_places not found — hub R023 not applied yet';
  end if;

  -- Every role-location must already resolve to a hub place (retired counts).
  select count(*) into missing
    from roadmap_role_locations rl
   where not exists (select 1 from akatsuki_places p where p.id = rl.location_id);
  if missing > 0 then
    raise exception '% roadmap_role_locations rows point at no akatsuki_places id — stop', missing;
  end if;

  if to_regclass('public.roadmap_locations') is not null then
    for fk in select conname from pg_constraint
               where conrelid = 'public.roadmap_role_locations'::regclass
                 and confrelid = 'public.roadmap_locations'::regclass loop
      execute format('alter table roadmap_role_locations drop constraint %I', fk);
    end loop;
  end if;
end $$;

drop table if exists roadmap_locations;

comment on column roadmap_role_locations.location_id is
  'akatsuki_places.id (R023). Hub-owned; no FK — places are retired, never deleted.';

commit;

-- ─── Verify ───────────────────────────────────────────────────────────
--   select to_regclass('public.roadmap_locations');                 -- null
--   select count(*) from roadmap_role_locations;                    -- 6
--   select count(*) from roadmap_role_locations rl
--     left join akatsuki_places p on p.id = rl.location_id
--    where p.id is null;                                            -- 0
--   select conname from pg_constraint
--    where conrelid = 'public.roadmap_role_locations'::regclass and contype = 'f';
--                                                                   -- only the roles FK
