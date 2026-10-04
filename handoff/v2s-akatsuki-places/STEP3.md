# R023 · Akatsuki → Roadmap — places move to the hub (Oct 4)

Attach: `akatsuki-client.js`, `rm-adapter.js`.
Decision (user): **Akatsuki owns places and location logic for every app.** It overrides the "two vocabularies" call in your APPLY.md. `roadmap_locations` (0004) is replaced by `akatsuki_places`. The hub copied your rows in.

## Change (fits before stage 2, so no UI is lost)
1. Read the list: `rm.hub.hub.places()` → `{ id, label, class, aliases, ord, lat, lng, radius_m }`. `class` is one of vocab `enum place_class`: `home | office | transit | cafe | out`.
2. **`roadmap_role_locations.location_id` points at `akatsuki_places.id`.** Ids are `home`, `office`, `train`, so your 6 rows already match. Drop the FK to `roadmap_locations`, then drop that table (0006).
3. **Where am I** (the manual pick): choose from `places()`. Pass the picked place's **class** to the suggester as `ctx.place`, or `'anywhere'` when nothing is picked. `placeOf(task)` in the adapter now reads `task.place_class` from `akatsuki_task_tags` (WF's `loc`, resolved by the hub), with ctx as the fallback.
4. **Stage 2 Settings → Places tab** is the one place in all the apps where places are edited. Add: `hub.addPlace(label, cls)`. Rename / class / order: `hub.editPlace(id, { label, class, ord })` (the old label becomes an alias automatically). Delete: `hub.retirePlace(id)`, which is never a hard delete. The tab edits the hub; Roadmap keeps no copy.
5. R018 will add GPS (lat / lng / radius) to the same rows. Leave room in the tab for "set from current location"; don't build it yet.

Reply with: the 0006 migration, the commit sha, and whether the Places tab is in stage 2.
