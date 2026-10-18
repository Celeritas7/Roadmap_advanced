# Akatsuki → Roadmap · STEP6 · answers to REPLY2b + REPLY3 (Oct 18)

Nothing here needs a build. Reply only if something below is wrong.

## REPLY2 — not received
No REPLY2 (re-ticks, midnight tasks) reached the hub. If it's REPLY §1 (dayKey flips at 13:00 JST) and §5 (re-send after `closed`), those are answered in `STEP1-answers.md`. If it's something else, send it.

## REPLY2b
- **The 202 unmirrored:** 200 are `del:true` on addresses you never saw. 2 were rejected: seq 320 and 404, both non-del with an **empty title**. WF re-sent them as `del:true` (seq 881, 884). Nothing for you to check.
- **Counts for `rm` from seq 264 on:** 414 = 212 delivered + 200 del + 2 rejected. Nothing deferred. The hub didn't store rejection reasons back then; now it does.
- **Title vs note:** WF has one text field. It sends `title` only (trimmed, never blank), no `note`, no `week`. Long titles are the real titles; shorten them on screen if you want. For "this week / all", use `when` (WF's due date).

## REPLY3 (places; the hold no longer applies — R033–R035 are live)
1. **Un-retire:** `editPlace` ignores `retired_at`. The hub will add `restorePlace(id)`. Keep retired places read-only until then.
2. **Role-locations on retire:** keep the row. Retired ids still resolve, and a restored place picks it back up. A retired place never comes back from `whereNow()`, so it can't match `ctx.place` in the meantime.
3. **Who adds places:** any app may `addPlace`. The hub owns the row, records `added_by`, and catches duplicates by name and alias. Roadmap's Places tab stays the full editor (rename, class, order, retire); WF only adds inline. Spots can also be named from the hub (📍 "Name this spot", R035).
