# V2-D apply plan — Weekly Focus ↔ Roadmap link

Files in this folder (drop `.txt` when copying):
- HANDOFF.md            — architecture + phases (read first)
- 0002_wf_link.sql.txt  — Phase 1 migration (⚠PROBE names first!)
- wfLink.ts.txt         — Phase 2 Roadmap sync module → src/lib/wfLink.ts
- store-wiring.md       — Phase 2 store/header edits (small, inline)

## Order of operations
0. PROBE (no writes) — in the Weekly Focus repo, find:
   a. exact tasks-table name + columns (`weekly_focus_…`)
   b. does it have `updated_at` + auto-touch trigger?
   c. which column scopes "this week" (board? week number? date?)
   d. the category/topic values in use
   Paste raw findings back to chat → I finalize the ⚠PROBE spots.
1. Run the finalized 0002 SQL in Supabase SQL editor. Verify tables exist.
2. Roadmap repo: add src/lib/wfLink.ts + store wiring (store-wiring.md).
   Verify: WF tasks appear in folders, ↻ merges, @train filter catches them.
   Commit.
3. Weekly Focus repo: context chips on task rows + mirrored rm→wf pull
   (same wfLink pattern, directions swapped). Commit there.
4. Verify matrix (HANDOFF.md §Phase 4). Then push both apps.

## Prerequisite — ship current work first
- Apply HomeView.v2.tsx.txt (round-robin) + commit
- Fix the Pages deploy (Actions tab / `npm run build` errors)
