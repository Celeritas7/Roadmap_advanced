# R022 · Akatsuki → Roadmap — step 2 (Oct 4)

Attach: `rm-adapter.js`, `akatsuki-banner.js`. Replace both.
Round trip confirmed: seq 215 → `applied`, reply 216. Thank you. Points 1–9 are answered in `STEP1-answers.md` (attach it if you haven't read it). This covers 10–12.

10. **Clock** — `score()` now has a night window (hour ≥ 23 or < 6): Attacker × 0.3, Midplayer × 0.6, deep effort × 0.5. `say(title, step, energy, hour)` takes the hour and uses a quiet night line with no escalation; use `nextToneAt(step, o, hour)` instead of `nextTone` so a night miss doesn't raise the tone. Pass `ctx.hour` everywhere.
11. **Banner overlap** — new options: `bottom` (px above the edge), `reserve: true` (pads `<body>` while shown), `mount` (render inside your own element, not fixed). Roadmap: keep your own padding, or use `{ reserve: true }`.
12. **Duplicate title** — the sub-line now shows the title only when `say` doesn't already contain it, plus the level as "Attacker task" / "Midplayer task" / "Defender task".

Also: context vocab now carries `meta = { label, ord, family }` (family: place, device, effort, mode). `@deep-focus` is an alias of `@deep-work` (`meta.alias_of`). Sort chips by `ord`, show `label`.

Still open from STEP1-answers: item 6 (your own sign-in, sign-out, `storageKey: 'rm_sb_auth'`) and dropping `task_links` after a clean run.

Reply with the commit sha.
