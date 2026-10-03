-- V2-D · Phase 1 — supabase/migrations/0002_wf_link.sql
-- CORRECTED against the real Weekly Focus schema (WF v63/v64, owner-confirmed).
-- Apply via the Supabase SQL editor. No WF-side DDL is required or included:
-- contexts already live in weekly_focus_entries.payload.subtasks[].ctx, and
-- per-task freshness is subtasks[].u (ms epoch, client-set) — not a trigger.

-- 1 · Context registry (shared vocabulary for both apps).
--     These 7 ids match WF's local registry character for character.
create table if not exists roadmap_contexts_map (
  id text primary key,          -- '@train', '@home', …
  label text not null
);
insert into roadmap_contexts_map (id, label) values
  ('@train', 'On the train'),
  ('@home', 'At home'),
  ('@office', 'At the office'),
  ('@needs-claude-code', 'Needs Claude Code'),
  ('@claude-chat-only', 'Claude chat is enough'),
  ('@phone-only', 'Phone only'),
  ('@deep-work', 'Deep work block')
on conflict (id) do nothing;

-- 2 · Link table: one row per mirrored pair.
--     A WF task is NOT a row — it is an element of
--     weekly_focus_entries.payload.subtasks[]. So the WF side is addressed by
--     its triple (board_id, item_key, sub_id); no FK to WF is possible.
--     wf_u / rm_seen_at are the last-seen clocks that tell us which side moved.
create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  wf_board_id text not null,
  wf_item_key text not null,
  wf_sub_id   text not null,                   -- subtasks[].id (base36 uid / djb2 hash — NOT a uuid)
  rm_task_id  uuid not null unique references roadmap_tasks (id) on delete cascade,
  wf_u        bigint not null default 0,       -- last-seen subtasks[].u (ms epoch)
  rm_seen_at  timestamptz,                     -- last-seen roadmap_tasks.updated_at
  source      text not null check (source in ('wf', 'rm')),
  orphaned_at timestamptz,                     -- set when the WF sub is del/lat/gone; row is KEPT
  last_synced_at timestamptz not null default now(),
  unique (wf_board_id, wf_item_key, wf_sub_id)
);

create index if not exists task_links_wf_item_idx
  on task_links (wf_board_id, wf_item_key);

-- Deletion semantics:
--   WF side  — soft-delete (del: true), parked (lat: true), or sub id absent
--              from the array → set orphaned_at, keep the link and the mirror.
--              No cascade from WF is possible (there is no WF task row).
--   RM side  — delete cascades the link row away; WF is left untouched, which
--              is correct: WF is the origin of Life/app tasks.
