# V2-F — Folder grid on Plan + Journey road window

Ports the approved prototype (ui_kits/roadmap/Separate Plans.html) into the app.
Builds ON TOP of v2e (App.tsx already handles ?plan= — replaced again here anyway).

Plan tab = clean folder tiles (emoji folder illustration, count, slim progress bar),
grouped by tier. Clicking a folder opens that skill's roadmap in its OWN WINDOW as a
journey road: START → numbered stations → phase signposts → 🏁 FINISH, with a pulsing
"you are here". Checks in the journey write to the same store (Supabase) as everywhere else.

## Apply (5 files)

| apply file | goes to | action |
|---|---|---|
| PlanFolders.tsx.txt | src/features/plan/PlanFolders.tsx | NEW |
| JourneyView.tsx.txt | src/features/plan/JourneyView.tsx | NEW |
| PlanWindow.tsx.txt | src/features/tree/PlanWindow.tsx | REPLACE (v2e version) |
| App.tsx.txt | src/App.tsx | REPLACE (v2e version) |
| journey.css.APPEND.css | src/index.css | APPEND at end |

Now unused (safe to delete, or leave — they still compile): src/features/tree/Tree.tsx,
src/features/tree/planTree.ts, src/features/folders/FoldersRow.tsx, and the v2e
plans.css block you appended (harmless if left).

## The 3 tier tabs (Attackers / Mid-players / Defenders)
NOT removed. They still: set the Home header mood + page hue, and pin focus.
If you want them gone: in App.tsx delete the `<RolesTier />` line (and its import).
Keep `useEffectiveRoleId` — it drives the color theme.

## Trade-off to know
The journey window is check-and-view. Adding/renaming/dragging tasks still happens
in the old tree — which Plan no longer shows. If you need editing back, say so and
I'll add an "Edit list" toggle inside the plan window.
