# V2-E — Separate plans + merged Home road

Fixes "app got complicated because two roadmaps merged": Plan no longer interleaves
folders; each folder (project) is its own plan card, sorted by tier
(Attackers → Mid-players → Defenders), and opens alone in a new window.
Home does the opposite on purpose: ALL tiers merge into one daily road.

## Apply (5 files)

| apply file | goes to | action |
|---|---|---|
| planTree.ts.txt | src/features/tree/planTree.ts | NEW |
| Tree.tsx.txt | src/features/tree/Tree.tsx | REPLACE |
| PlanWindow.tsx.txt | src/features/tree/PlanWindow.tsx | NEW |
| App.tsx.txt | src/App.tsx | REPLACE |
| HomeView.tsx.txt | src/features/home/HomeView.tsx | REPLACE |
| plans.css.APPEND.css | src/index.css | APPEND at end |

Then `npm run dev` to smoke-test, `npm run build` before pushing (Pages build is still red — unrelated).

## What changed

**Home** — road pool = all three tiers (role gate opened to all roles). Round-robin
still rotates one stop per folder per pass, but lanes are ordered by tier
(Attackers folders first, then Mid-players, then Defenders), so the merge is sorted,
stable, and never reshuffles on check. Header copy + open/cleared stats now count all tiers.

**Plan** — one `.plan-card` per folder, PROJECTS order (= tier order). Each card
prunes the full tree to just that folder's tasks, so "DX Engineer" and "Fullstack"
render as different plans even where tasks share groups. Folder chips still filter
(narrow to the picked plans). Each card has **Open ↗** → `window.open('?plan=<id>')`
— a standalone window with only that plan, live against the same Supabase store
(checks persist both ways; the other window updates on its next fetch/refresh).

**Superseded**: this HomeView includes the v2b round-robin fix — `handoff/v2b-home/apply/HomeView.v2.tsx.txt` is no longer needed.

## Notes
- A task tagged into two folders (e.g. dx + fullstack) appears in both plan cards; checking it in one checks it everywhere (same row).
- Drag-reorder works inside each card (own DndContext), within-parent only, as before.
- The plan window ignores the main window's filters — it's the whole plan, always.
