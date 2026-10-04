# V2-S · Akatsuki step 3 — places move to the hub — APPLY

Answers `STEP3.md` (R023). Fits before Settings stage 2; no UI is lost.
Two hub files swapped, one migration, four small source patches.

## 1 · SQL (Supabase SQL editor)
Run `0007_places_to_hub.sql.txt`. STEP3 calls it "0006", but Roadmap's 0006 is
already `step2.sql` — this ships as **0007**. It refuses to run unless every
`roadmap_role_locations` row resolves to an `akatsuki_places` id, then drops the
FK and `roadmap_locations`. No new FK (hub retires, never deletes).
Save as `supabase/migrations/0007_places_to_hub.sql`; rollback beside it, don't run it.
Checks at the foot → `null` · 6 · 0 · roles FK only.

## 2 · Hub files — replace, as shipped
| handoff | → repo |
|---|---|
| `public/akatsuki/akatsuki-client.js` | `public/akatsuki/akatsuki-client.js` (adds `places / matchPlace / addPlace / editPlace / retirePlace`) |
| `public/akatsuki/rm-adapter.js` | `public/akatsuki/rm-adapter.js` (`placeOf` reads `task.place_class`) |

## 3 · Source
| # | file | → | edits |
|---|---|---|---|
| 1 | `types.PATCH.txt` | `src/types.ts` | 3 (`HubPlace`, `place_class`, client places API) |
| 2 | `rmHub.PATCH.txt` | `src/lib/rmHub.ts` | 4 (`hubPlaces()` / `refreshPlaces()`, boot + focus) |
| 3 | `suggester.PATCH.txt` | `src/lib/suggester.ts` | 4 (pick = place id, `ctx.place` = class) |
| 4 | `NowStrip.PATCH.txt` | `src/features/home/NowStrip.tsx` | 3 ("At" lists hub places) |

`npm run build` must be clean.

## 4 · Test (`npm run dev`)
1. Header `🌑 hub`. Console: `rm.hub.hub.places().then(console.table)` → home / office / train, classes home / office / transit.
2. Home → **At** shows *anywhere · Home · Office · Train* (labels, not enum words). An old pick of `transit` turns into **Train** on first load.
3. Pick **Train** → next tick logs a suggestion row with `ctx.place = 'transit'`:
   `select ctx->>'place' from roadmap_suggestions order by made_at desc limit 1`.
4. A task WF tagged with a `loc` → `select addr_key, place_class from akatsuki_task_tags where place_class is not null` — at a different place, that task is never suggested.
5. Role-location chips / filters unchanged (Where still uses WF's `@home…` contexts).

## 5 · Ship and reply
`npm run build` → deploy → `git add -A && git commit -m "V2-S: places move to the hub (R023)" && git log -1 --format=%H`.
Paste the sha into `REPLY3.md` and send it.

## Stage 2 Settings — Places tab: yes
Prototype: `v2p-settings/A4 Places.html`. Sixth rail tab, edits go to the hub only:
- Rename / class / reorder → `editPlace(id, { label, class, ord })` (old label becomes an alias — shown as *also matches*).
- `+ Add` → `addPlace(label, cls)`; `exists` = an alias already matched, select that row.
- × → `retirePlace(id)`; *Retired* section lists them (`places({ withRetired: true })`). **Restore** needs a hub call that doesn't exist yet — asked in REPLY3.
- Class options from vocab `enum place_class`.
- Pin button reserved, disabled, for R018 "set from current location".
- *Roles here* reads `roadmap_role_locations`; edited in Roles & tiers (stage 2).
- Batched with the modal's Save/Cancel like the other tabs; Places has no "Restore defaults" (not Roadmap's to restore).

## Not done here
- `now.location` (role activity, `selectors.ts`) still uses the hardcoded `'home'|'office'|'train'` union and `seed.ts` role locations. Stage 2 swaps it for role_locations + the same **At** pick, so there's one "where am I" — not two.
- `Location` type stays until then.
