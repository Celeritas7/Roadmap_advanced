-- V2-P · ROLLBACK for 0004_settings_model.sql
-- Drops the four new tables. seed.ts is untouched and still the runtime
-- source until the Settings UI ships, so this is safe to run at any point
-- before that.

begin;

drop table if exists roadmap_role_locations;
drop table if exists roadmap_projects;
drop table if exists roadmap_roles;
drop table if exists roadmap_locations;

commit;
