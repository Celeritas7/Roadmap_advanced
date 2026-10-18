# R033 · Akatsuki → Roadmap — the hub now knows where the user is (Oct 14)

Attach: `akatsuki-client.js` (R033), `AKATSUKI.md` v3.7. Replace both; the client only adds two reads.

**Verified live Oct 14:** the hub records visits itself (Home · 21:01 · ±20 m) and resolves them to `akatsuki_places`. Roadmap reads them; it never reads GPS and never gets coordinates.

## What you get
```js
const now = await rm.hub.hub.whereNow();
// [{ device, since, last_seen_at, place_id, place_label, anchor_label, class }]  — newest first
// []  ⇒ unknown (nothing recording), NOT "away"
const past = await rm.hub.hub.visits({ days: 7 });
// [{ since, until, end_reason, place_id, place_label, anchor_label, class, source_app }]  — newest first; until = null ⇒ still there
```
`class` is vocab `place_class`: `home | office | transit | cafe | out`. `place_id` is null for an unnamed spot (then `anchor_label` may hold a nickname).

## Change
1. **`ctx.place` resolution, in this order:**
   a. the user's manual "where am I" pick, if made in the last 2 hours (it still wins — it is a fact the user asserted);
   b. `whereNow()[0].class` (the view already applies the freshness window);
   c. the newest `visits()` row ended under 30 minutes ago → its class, marked *stale*;
   d. `'anywhere'`.
   Show the source next to the pick ("Home · from hub, 3 min ago" / "Office · you picked"). Never show a place as current when (b) returns nothing — unknown is unknown.
2. **Poll, don't subscribe.** `whereNow()` every 60 s while Roadmap is in the foreground, nothing in the background. No realtime channel.
3. **Two rows for one stop** can arrive while Cost still captures too (two installs = two device ids). Take the newest row; don't dedupe by place.
4. **Delete nothing yet.** Keep the manual pick. It is the fallback and the override.

## Not your job
- Starting GPS, asking for permission, running `akatsuki-location.js`. Capture is the hub's (phone agent, Akatsuki, Cost until it retires).
- Writing to any `akatsuki_visits*` object. Reads only; the views are `security_invoker`, your session sees your rows.

## Freshness — say it in Roadmap's launch doc
Location comes in the background from the phone (OwnTracks → hub, R034, verified Oct 15), plus Akatsuki/Cost while open. Background reports can be up to 15 min apart, so `whereNow()` counts a visit as current for 20 min. If the phone agent is off, a suggestion falls to (c) or (d).

Reply with: the commit sha, which of (a)–(d) fired on three real suggestions (place · source · age), and one line on whether the 60 s poll is noticeable.
