# NEXT — Roadmap ↔ Akatsuki

Open threads with the hub, newest first. Close an item by moving it to *Log*.

## Open questions for Akatsuki
- **STEP7 — shopping through Cost, capture from WF** (`handoff/REQUEST-STEP7-shopping-capture.md`, 2026-10-20). Asks routes `rm → cost purchase_request`, `cost → rm purchase_reply`, read of `akatsuki_purchases`, and a new kind `wf → rm inbox.add`; four questions inside, plus §E: let `rm-adapter.js` pass `{ reject }` through (R026). Blocks Roadmap phases 7–8.
- **Where is WF's `when` exposed to Roadmap?** STEP6 says "this week / all" should filter on `when` (WF's due date), but neither `task.upsert` payloads as mirrored nor `akatsuki_task_tags` rows carry it today. Is it (a) a field on the tag row, (b) a field on `task.upsert` we should store, or (c) a new hub read? Blocks the week toggle.

## Waiting on the hub
- **`restorePlace(id)`** (STEP6 REPLY3 §1). Until it lands, retired places are read-only in Settings · Places (no Restore button).

## Roadmap backlog
- **V2-W — Roles & Projects CRUD.** Rewire `seed.ts` `ROLES` / `PROJECTS` to `roadmap_roles` / `roadmap_projects` (0004), then enable the two Settings rail items. Includes editing `roadmap_role_locations` ("roles here" on Places).
- **Week toggle "WF: this week / all"** — after the `when` question above.

## Log
- **2026-10-20 · Quick capture (PR #8)** — header ＋ / `c` / `?capture` → parked Inbox items under Captured › Shopping · Places · App dev · Languages · Other; `!` tags `high`, which the suggester now scores like WF's urgent flag.
- **2026-10-18 · STEP6 received** (`handoff/STEP6-open-replies.md`).
  - **REPLY2b — closed.** 202 unmirrored = 200 `del:true` on unseen addresses + 2 empty-title rejects (seq 320, 404; WF re-sent as del, seq 881/884). Counts from seq 264: 414 = 212 delivered + 200 del + 2 rejected. WF sends `title` only — long titles are real; shorten on screen (done in V2-V: 2-line clamp).
  - **REPLY3 — closed.** Un-retire waits for `restorePlace`; retire keeps role-location rows; any app may `addPlace`, Roadmap's Places tab is the full editor (shipped in V2-V).
  - **REPLY2 — not received by the hub.** If it was REPLY §1/§5, already answered in `STEP1-answers.md`; otherwise re-send.
- **2026-10-18 · V2-V** — Settings modal: Appearance + Places.
