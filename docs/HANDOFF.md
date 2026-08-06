# HANDOFF — Roadmap V2-B: Home view + nav (road UI)

Discipline: same as V2-A Phase B. Atomic CC ops, per-file approval option 1,
probe-first, explicit-path staging, three-guard commit, verify against RAW
output. V2-B adds ONE new client-only state field (`view`) — otherwise
read-side; the only mutation Home calls is the EXISTING toggleTask.

## BRANCH/DEPLOY
- All V2-B on feature/v2a-next-action (or branch feature/v2b-home off it).
- Prereq: V2-A Phase B committed (folder cards done/total + next panel).
- main deploys to GitHub Pages; hold merge until V2-B verified locally.

## GOAL
Port the mock's Home surface (ui_kits/roadmap) into the app:
Home/Plan nav tabs; Home = summary card + winding-road "next stops" +
Today's log; Plan = the current surface (folders + tree). Contexts stays
parked. Fixes "folder grid covers the screen / roadmap not visualised".

## SURFACE MAP
App (write):
- src/store/useStore.ts        — ADD view:'home'|'plan' + setView (client-only)
- src/features/header/Header.tsx — ADD .rm-tabs between brand mark and mood
- src/App.tsx                  — branch rm-pad on view
- src/features/home/road.ts    — NEW (geometry + workCap, pure)
- src/features/home/HomeStop.tsx — NEW
- src/features/home/HomeView.tsx — NEW
- src/index.css                — APPEND net-new .rm-tabs + HOME/road block

App (read, no changes):
- src/lib/time.ts (getDaypart, formatHour12) — EXISTS, confirmed
- src/store/selectors.ts — no changes
- .row/.rail/.check.station CSS (Step 4) — Home reuses; grep confirmed
  NO .home-*/.road*/.rm-tab rules exist in src/index.css (clean namespace)

Mock (reference only):
- ui_kits/roadmap/App.jsx  — roadGeometry/smoothPath/workCap/barrierMessage
  (L40-83), Header tabs (L120-128), HomeStop (L567-581), HomeView (L584-639)
- ui_kits/roadmap/app.css  — HOME + road block (L956-1099)

## PORT ADAPTATIONS (mock → app deltas)
1. NO `priority` field on the app's TaskRow (confirmed types.ts; no
   priority-family contexts found in seed.ts — CC re-probe at apply time).
   Mock sorts Home by t.priority + shows PriorityPill. App default:
   ORDER = render order (buildTree DFS — same order nextAction uses);
   NO priority pill. Vetoable.
2. `hour` comes from store `now.hour` (useNow ticks it); mock's hour prop
   and the mock hour-slider do NOT port (app has DebugTimeSlider already).
3. `pinned` = store selectedRole !== null.
4. toggleTask = existing store mutation (optimistic+rollback) — no new sync.
5. Project chip on a stop: align markup with TaskRow's existing tag chips
   (CC probe TaskRow.tsx L~120-150 at apply time); draft uses a plain
   span.tag fallback.
6. TodaysLog renders on Home ONLY; Plan keeps folders+tree (log moves out).
   Vetoable.

## DESIGN DEFAULTS (provisional, vetoable)
- Default view on load: 'home' (the app's purpose = "what now").
  Not persisted — reload re-lands on Home.
- Top 6 open stops for the effective role, render order.
- workCap windows + barrier copy verbatim from mock (23-6→1, 21+→2,
  19+→4, else 6). Barrier emoji are part of the mock design — keep.
- Tabs: Home | Plan only (Contexts parked; add later as third tab).

## PHASES
- Phase 0 (probe, no writes): confirm insertion points/line numbers in
  useStore.ts, Header.tsx, App.tsx HEAD; probe TaskRow tag markup;
  re-grep seed for priority contexts.
- Phase 1 (wiring): view state + Header tabs + App branch. Home renders
  ONLY the .home-now summary card (no road yet). App fully usable.
  → apply-blocks 1a-1c + css block 1d, commit.
- Phase 2 (road): road.ts + HomeStop + full HomeView (road SVG, barrier,
  numbered stations, here-pulse) + HOME/road CSS. TodaysLog moves to Home.
  → files 2a-2c + css 2d + App edit 2e, commit.
- Phase 3 (verify + polish): three themes × Home, mobile ≤768px, station
  tap target ≥44px, road with n=1..6 stops, barrier at each cap window
  (drive DebugTimeSlider), done-toggle round-trip vs Supabase. Fix-ups
  only; commit if needed.

## PHASE 1 APPLY-BLOCKS

1a — src/store/useStore.ts (2 edits; CC probes exact lines)
  In StoreState type, after `theme: ThemeName`:
    view: 'home' | 'plan'
    setView: (view: 'home' | 'plan') => void
  In the create() initial state + actions (near theme/setTheme):
    view: 'home',
    setView: (view) => set({ view }),

1b — src/features/header/Header.tsx
  After the `<span className="rm-kbd">⌘K to jump</span>` line insert:
    {/* V2-B nav: Home | Plan (Contexts parked) */}
    <div className="rm-tabs" role="tablist" aria-label="View">
      {(['home', 'plan'] as const).map((id) => (
        <button key={id} type="button" role="tab"
          aria-selected={view === id}
          className={'rm-tab' + (view === id ? ' active' : '')}
          onClick={() => setView(id)}>
          {id === 'home' ? 'Home' : 'Plan'}
        </button>
      ))}
    </div>
  And add store reads at the top of the component:
    const view = useStore((s) => s.view)
    const setView = useStore((s) => s.setView)
  plus import { useStore } from '../../store/useStore.ts'

1c — src/App.tsx
  Add: import { HomeView } from './features/home/HomeView.tsx'
       const view = useStore((s) => s.view)
  Replace the happy-path fragment
    <FoldersRow /> <Tree /> <TodaysLog />
  with:
    {view === 'home' ? (
      <HomeView />
    ) : (
      <>
        <FoldersRow />
        <Tree />
      </>
    )}
  (Phase 1 HomeView = summary card + TodaysLog only; road lands Phase 2.)

1d — src/index.css APPEND (see home.css.APPEND.css §TABS)

## PHASE 2 APPLY-BLOCKS
Full drafted files in this folder (drop .txt when copying):
- 2a road.ts.txt      → src/features/home/road.ts
- 2b HomeStop.tsx.txt → src/features/home/HomeStop.tsx
- 2c HomeView.tsx.txt → src/features/home/HomeView.tsx (includes Phase 1
  minimal render — ship it in Phase 1, road section is already inside;
  if strict phasing wanted, comment the road block until Phase 2)
- 2d home.css.APPEND.css §HOME+ROAD → append to src/index.css
- 2e App.tsx already wired by 1c (no further edit)

## COMMITS (three-guard each)
- P1: "V2-B P1: Home/Plan nav + view state + Home summary card"
- P2: "V2-B P2: Home road UI — winding next-stops, work-cap barrier"

## VERIFY MATRIX (Phase 3)
theme × {trailhead,summit,fieldguide} · hour ∈ {10,20,22,23} (cap 6/4/2/1)
· role pinned vs schedule · 0 open stops (empty state) · toggle a station
→ Supabase row flips · Plan unchanged vs pre-V2-B screenshots.
