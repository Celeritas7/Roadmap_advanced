# REPLY · STEP5 (R033/R034) · Roadmap → Akatsuki

**Commit:** `9f08bf2` (pushed to main Oct 15).
- `32d4b76` — V2-U: place from the hub (R033 STEP5)
- `56ffd09` — V2-U: anywhere is a pick; open visit counts as stale
- `9f08bf2` — V2-U: (c) ages from last_seen_at, 30 min cap for open and closed visits (R034b)

## What changed
- `akatsuki-client.js` replaced with R033 (same load order: client → rm-adapter → banner). `AKATSUKI.md` replaced with v3.7.
- `ctx.place` resolution (`src/lib/suggester.ts` `resolvePlace()`):
  a. manual "At" pick made < 2 h ago. "anywhere" is its own pick (forces `'anywhere'`, timed like any pick); "auto (hub)" clears the override. Picks saved before this build have no time, so they count as old →
  b. `whereNow()[0].class` (newest row; two devices are not deduped) →
  c. newest `visits()` row → *stale*, aged from `last_seen_at ?? until ?? since` (R034b), used if < 30 min, open or closed alike →
  d. `'anywhere'`.
  An empty `whereNow()` is never shown as a place. A `whereNow()` read older than 5 min (tab was hidden) is ignored, so a background tab drops to (d) and doesn't keep using an old place.
- The source shows next to the pick: "Home · from hub, 3 min ago" / "Office · you picked" / "Home · seen 12 min ago" (stale) / "unknown · no recent location".
- Each suggestion's `roadmap_suggestions.ctx` now logs `place_src` (`pick|hub|stale|none` = a|b|c|d) and `place_age_min`.
- `whereNow()` every 60 s, only while the tab is visible, plus once when it comes back to the foreground. `visits({ days: 1 })` is read only when `whereNow()` is empty. No realtime channel, no GPS, no permission prompt, no `akatsuki-location.js`, no direct `akatsuki_*` reads.
- Launch doc: the freshness note is in `README.md` ("Akatsuki · location").
- Build: the build id is minted on every build (`vite.config.ts`). **Roadmap has no service worker, so there is no PWA cache to bump.** That's a gap against AKATSUKI.md ("keep `sw.js` present"), and it's still open.

## Live examples (build `9f08bf2`, Home's "At" line)
| step | place | text shown |
|------|-------|------------|
| (c) | Home | "Home · seen 15 min ago" (next read: "Home · seen 16 min ago") |
| (a) | Office | "Office · you picked" |

(c) was captured with the phone agent paused. It first appeared about 15 min after the pause, once `whereNow()` stopped returning the visit, not at the 5 min first estimated. The age then went up by a minute per 60 s poll.

## Three real suggestions
**Not filled yet.** No suggestions have been made on this build, and I'm not inventing them. Once it's deployed and used, run this on Roadmap's own table:

```sql
select made_at, ctx->>'place' as place, ctx->>'place_src' as source, ctx->>'place_age_min' as age_min
from roadmap_suggestions where ctx ? 'place_src' order by made_at desc limit 3;
```

| # | place | source (a–d) | age |
|---|-------|--------------|-----|
| 1 | — | — | — |
| 2 | — | — | — |
| 3 | — | — | — |

## 60 s poll
Not measured in a live session yet. It's one small read per minute, only while the tab is visible, so I don't expect anyone to notice it. I'll confirm after real use.
