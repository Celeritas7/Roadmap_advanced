-- Undo 0008_comparisons.sql. Drops every saved comparison.
-- Tasks the save function created stay (they are ordinary parked tasks).
begin;
drop function if exists roadmap_save_comparison(jsonb);
drop table if exists roadmap_comparison_items;
drop table if exists roadmap_comparisons;
commit;
