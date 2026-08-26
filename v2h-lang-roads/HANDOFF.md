# HANDOFF — Roadmap V2-H: Languages multi-road plan window

Discipline: same as V2-B/V2-F. Atomic CC ops, per-file approval option 1,
probe-first, explicit-path staging, three-guard commit, verify against RAW
output. V2-H is read-side + one data migration; the ONLY mutation the new
view calls is the EXISTING toggleTask. No schema change — language and
phase live in the existing tags text[] column.

## BRANCH/DEPLOY
- Branch feature/v2h-lang-roads off main (V2-F/V2-G merged).
- main deploys to GitHub Pages; hold merge until verified locally.

## GOAL
Port the mock's Languages Multi-Road surface (ui_kits/roadmap — see
`Languages Multi-Road.html` + the integrated version in App.jsx
LangRoadsView/MultiRoad/LangCard/PhaseCard) into the app's existing
Languages plan window (?plan=lang): mode chips pivot between one road per
language (phases as ⚑ signposts) and one merged road per phase across all
languages (language flags as signposts).

## SURFACE MAP
App (write):
- src/features/plan/langMeta.ts     — NEW (langMeta.ts.txt; pure constants + tag readers)
- src/features/plan/LanguageRoads.tsx — NEW (LanguageRoads.tsx.txt)
- src/features/tree/PlanWindow.tsx  — FULL REPLACEMENT (PlanWindow.tsx.txt;
  one-line branch: lang → LanguageRoads, else JourneyView)
- src/seed.ts                       — Languages block per seed.Languages.PATCH.txt
                                      (fresh DBs only)
- src/index.css                     — APPEND lang-roads.css.APPEND.css
DB (existing DBs only, run once):
- 0003_lang_tags.sql.txt            — Supabase SQL editor (idempotence-guarded)

App (read, no changes):
- src/features/plan/JourneyView.tsx — geometry/markup source LanguageRoads mirrors
- src/index.css jr-*/jsign/jphase/jstop/jck/jhere/jbody/jtitle — REUSED verbatim
- src/store/useStore.ts             — tree + toggleTask reads only

Mock (reference only):
- ui_kits/roadmap/Languages Multi-Road.html — the standalone design
- ui_kits/roadmap/App.jsx  — LangRoadsView/MultiRoad/LangCard/PhaseCard
- ui_kits/roadmap/app.css  — ".lr-*" block at end of file

## PORT ADAPTATIONS (mock → app deltas)
1. Mock tasks carry `lang`/`phase` FIELDS; the app's TaskRow has no such
   columns. Ported as TAGS: languages ja|zh|my, phases ph-quick|ph-reading|
   ph-writing|ph-listening|ph-speaking (readers in langMeta.ts).
2. Mock renders its own pw-head; the app's PlanWindow already has one —
   LanguageRoads renders only chips + hint + cards below it.
3. Road strokes/stops reuse the V2-F journey classes and JourneyView's
   exact heights (stop 78, phase 66, sign 64) + curve (66 ± 32·sin .85i),
   NOT the mock's denser 56px rows. Vetoable: mock density on request.
4. Phase/flag signposts sit RIGHT of road centre (x+14) per the approved
   kit design. JourneyView still uses x−20 — align later if wanted.
5. Mock persists mode in localStorage; app keeps it in component state
   (window is short-lived). Vetoable.
6. jhere stays plain text — the app's road asphalt is light (var(--road)),
   so no legibility pill needed (kit needed one on dark asphalt).
7. NEW meta tags (ja, ph-*) may surface as raw chips wherever tags render.
   CC MUST probe TaskRow.tsx (and FilterPopover) at apply time: if unknown
   tags render, filter with isLangMetaTag() from langMeta.ts.

## PHASES
- Phase 0 (probe, no writes): confirm jr-*/jsign/jphase/jstop/jck/jbody
  class names + .jbody left offset in src/index.css; probe TaskRow tag
  rendering (adaptation 7); confirm store tree is flat TaskRow[].
- Phase 1 (data): seed.ts Languages patch; run 0003 SQL on the live DB;
  verify tree view shows Japanese/Chinese/Burmese groups, 12 lang tasks.
  → commit "V2-H P1: Languages per-language groups + lang/phase tags".
- Phase 2 (view): langMeta.ts + LanguageRoads.tsx + PlanWindow replacement
  + CSS append.
  → commit "V2-H P2: Languages multi-road window — by-language + merged phase roads".
- Phase 3 (verify + polish): matrix below; fix-ups only.

## VERIFY MATRIX (Phase 3)
theme × {trailhead,summit,fieldguide} · ?plan=lang: By-language grid
(3 cards, ⚑ phase signposts, progress bars) · each phase chip (merged road,
language-flag signposts, per-language lchips; empty state on a phase with
no tasks — delete one to test) · chip counts = open tasks · toggle a jck →
Supabase row flips + counts update · "you are here" = first open stop ·
other plans (?plan=dx etc.) unchanged (JourneyView) · mobile ≤768px: grid
collapses to 1 column (auto-fit minmax 300px) · tap targets ≥44px (jck).
