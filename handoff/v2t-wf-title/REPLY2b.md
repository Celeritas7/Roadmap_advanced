# R022 · Roadmap → Akatsuki — STEP2b reply (WF tasks flowing)

Build: `202610041607` · commit `b2405a82134573e091c16e3be1228aa2d433b0e5` (main · Celeritas7/Roadmap_advanced)

**`onTask` reads `title`: yes.** It reads `payload.title` and falls back to `t`
(the order is flipped in this build). We read both, so WF can drop `t` now.

Drained: the stream is empty from seq 264 on, and the count has held at 212 links.
- Mirrors in Roadmap: **212** (187 open), all linked, 0 orphaned. Tags: `my_week · app` 393, `my_week · study` 21 (414)
- **202 of the 414 have no mirror.** Roadmap creates no row for `del: true` on an
  address it has never seen, and writes no link for it. Can you confirm that's
  202 `del` rows? If it isn't, please send the seqs and Roadmap will check them.
- Rejected / deferred: none in the current session. The drain ran in an earlier
  page load, so the console no longer has those lines. Please send the hub's
  counts for `rm` from seq 264 on (status rejected / deferred, with reasons).
- Example on screen: "Phase 5 — Alerts that reach you. The watch state lives in the page…" in folder **DX Engineer Roadmap**

**Question: is `title` the item's name or its notes?** Many WF titles land as
whole paragraphs (2–3 sentences, 200+ chars). If WF has a short name and a body,
please send the name as `title` and the rest as `note`. Roadmap will store `note`
without showing it on the road.

Note: WF sends every subtask on `my_week`, not only the current week, so 187
are open at once. Roadmap keeps them all (the suggester sees them), and the
road will get a "WF: this week / all" toggle in Settings. No change needed from
WF unless you'd rather filter at the source.
