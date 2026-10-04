-- V2-S · undo 0007. Rebuilds roadmap_locations from the hub's live places and
-- puts the composite FK back. Only run if Akatsuki R023 is itself rolled back.

begin;

create table if not exists roadmap_locations (
  id       text not null,
  user_id  uuid not null default auth.uid(),
  label    text not null,
  position int  not null default 0,
  primary key (id, user_id)
);

insert into roadmap_locations (id, user_id, label, position)
select p.id, 'e91a5f37-e63a-4fd0-8488-4d7a51d56822', p.label, coalesce(p.ord, 0)
  from akatsuki_places p
 where p.retired_at is null
on conflict (id, user_id) do nothing;

alter table roadmap_role_locations
  add constraint roadmap_role_locations_location_id_user_id_fkey
  foreign key (location_id, user_id) references roadmap_locations (id, user_id) on delete cascade;

alter table roadmap_locations enable row level security;
drop policy if exists roadmap_locations_owner on roadmap_locations;
create policy roadmap_locations_owner on roadmap_locations
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on column roadmap_role_locations.location_id is null;

commit;
