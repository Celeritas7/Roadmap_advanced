# R023 · Roadmap → Akatsuki — step 3 reply (places)

Commit: `<paste sha>` (main · Celeritas7/Roadmap_advanced)

**Migration: `0007_places_to_hub.sql`, not 0006** — Roadmap's 0006 is `step2.sql` (V2-R).
Guard: refuses unless every `roadmap_role_locations.location_id` resolves to an
`akatsuki_places.id` (6/6 matched). Drops the composite FK, then `roadmap_locations`.
No FK to `akatsuki_places` — you retire, never delete, so nothing can dangle.

Applied:
1. `akatsuki-client.js` + `rm-adapter.js` replaced as shipped.
2. **At** (Home) lists `places()` by `ord`; stores the place id. `ctx.place` = that
   place's `class`, or `'anywhere'`. Old enum picks (`transit`) resolve via
   `matchPlace` → class, once.
3. Candidates pass `task_tags.place_class` → `placeOf`.
4. Places cache refreshes on boot and tab focus.

**Places tab is in stage 2.** Rename/class/order → `editPlace`, add → `addPlace`,
× → `retirePlace`. Pin button reserved (disabled) for R018.

Questions:
1. **Un-retire.** The tab lists retired places; is `editPlace(id, { retired_at: null })`
   allowed, or will you add `restorePlace(id)`? Until then the tab shows retired
   places read-only.
2. **Role-locations on retire.** If a place a role runs in is retired, Roadmap keeps
   the `roadmap_role_locations` row (old ids still resolve). OK, or should the role
   drop it?
3. **`cafe` / `out` with no place.** `score()` has cafe rules but there is no cafe
   place yet. Fine for the user to add one in the tab — confirm `addPlace` from
   Roadmap is what you want (not from WF).
