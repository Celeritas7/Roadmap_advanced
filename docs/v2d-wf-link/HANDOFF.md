# HANDOFF — V2-D: Weekly Focus ↔ Roadmap link (two-way sync)

Discipline: same as V2-A/B/C. Atomic CC ops, probe-first, per-file approval,
three-guard commits. THIS ONE TOUCHES TWO REPOS + A SHARED DB — sequence
matters; DB migration lands first, apps follow.

## DECISIONS (from user, locked)
- Both apps on the SAME Supabase account/project. WF tables prefixed
  `weekly_focus_` (CC probe exact names in Phase 0).
- Two-way sync; conflict = last write wins (compare `updated_at`).
- Scope: ALL Weekly Focus tasks open this week flow into Roadmap.
- Contexts: @train @home @office @needs-claude-code @claude-chat-only
  @phone-only @deep-work. Assignable in EITHER app.
- Linked tasks merge into existing Roadmap folders by topic.
- Canonical model (my recommendation, approved-by-default): each app keeps
  its own table; a LINK table maps rows and a sync layer mirrors the shared
  fields. No schema unification.

## ARCHITECTURE
Shared fields synced: title, done, context tags, updated_at.
Everything else stays app-private (WF: board/urgency/category; RM: parent,
position, tier, project tag).

New tables (one migration, `0002_wf_link.sql`):
1. `roadmap_contexts_map` — context registry: id (text, '@train'…), label.
   Seed the 7 chosen contexts.
2. `task_links` —
   wf_task_id uuid UNIQUE, rm_task_id uuid UNIQUE,
   last_synced_at timestamptz, source text ('wf'|'rm').
   FKs to both task tables, ON DELETE CASCADE both ways.
3. WF tasks table: ADD COLUMN contexts text[] DEFAULT '{}' (locations get
   assigned in WF too).
   RM already stores tags text[] — contexts ride in tags as '@…' (existing
   convention; filter pipeline already handles them).

Sync mechanism — CLIENT-SIDE PULL-MERGE, no server function needed:
- On Roadmap load (and a manual ↻ button): fetch WF open-this-week tasks +
  task_links; for unlinked WF tasks, INSERT a mirrored RM task (folder by
  topic map, see below) + link row. For linked pairs where
  wf.updated_at ≠ rm.updated_at since last_synced_at → copy the newer side's
  shared fields to the older (last write wins), stamp last_synced_at.
- Weekly Focus does the same on ITS load for rm→wf direction (done-state,
  contexts). Same helper module, mirrored.
- Deletion: link CASCADE removes the pair's link; mirrored task gets
  orphan-flagged, not auto-deleted (safe default; user cleans up).

Topic→folder map (design default, vetoable): a small const in the sync
module mapping WF category → RM project id (PRODUCTIVITY→dx, CODING→dx,
ACADEMICS→lang, FINANCE→life-admin…, else → a `weekly` catch-all project
added to seed). CC probes actual WF category values in Phase 0.

## PHASES
- **Phase 0 (probe, both repos, no writes):** dump WF Supabase schema
  (table/column names, updated_at present?, week/board scoping fields);
  confirm RM tags convention for '@…'; list WF category values; confirm
  both apps share the same supabase-js client version.
- **Phase 1 (DB):** write + apply migration 0002 (link table, contexts col,
  registry). Verify in Supabase dashboard. Commit (RM repo,
  supabase/migrations/).
- **Phase 2 (sync module, RM side):** src/lib/wfLink.ts — fetchers, merge
  (last-write-wins), topic map; store action `syncWeekly()` called from
  init + a ↻ button in the header. Linked tasks appear in folders + road
  with their '@…' tags; context filter already works (V2-B).
- **Phase 3 (WF side):** context picker on WF task rows (7 chips);
  mirrored wfLink module for rm→wf pull. Commit in WF repo.
- **Phase 4 (verify):** matrix — create in WF → appears in RM folder;
  check off in RM → done in WF after WF reload; tag @train in WF → RM
  @train filter shows it; edit title both sides → newer wins; delete in
  WF → RM copy orphan-flagged.

## RISKS / NOTES
- Both apps single-user, same account — no auth/RLS work needed beyond
  what exists.
- "Open this week" definition lives in WF (board/week field — Phase 0
  confirms); the RM fetch filters on it so old weeks never flood in.
- Clock skew is irrelevant (same DB stamps updated_at via trigger — Phase 0
  confirms WF has the trigger; add if missing).
- The parked Contexts tab (V2-A design) becomes the natural home for
  context management later; not required for V2-D.

## IMMEDIATE NEXT
Phase 0 probes in BOTH repos, paste raw outputs back. Then I draft the
migration SQL + wfLink.ts apply-blocks.
