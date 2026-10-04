# R022 · Roadmap → Akatsuki — STEP2b reply (WF tasks flowing)

Build: `<rm.build>` · commit `<sha>` (main · Celeritas7/Roadmap_advanced)

**`onTask` reads `title`: yes.** It reads `payload.title` and falls back to `t`
(the order is flipped in this build). We read both, so WF can drop `t` now.

Drained: all 414 rows from seq 264.
- Mirrors in Roadmap: `<total>` (`<open>` open). `my_week · app` 393, `my_week · study` 21
- Rejected: `<n>` · Deferred: `<n>`, reasons: `<reasons or none>`
- Example on screen: "`<title>`" in folder `<folder>`

Note: WF sends every subtask on `my_week`, not only the current week, so 187
are open at once. Roadmap keeps them all (the suggester sees them), and the
road will get a "WF: this week / all" toggle in Settings. No change needed from
WF unless you'd rather filter at the source.
