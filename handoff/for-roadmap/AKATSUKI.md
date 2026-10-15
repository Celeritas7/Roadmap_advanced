Akatsuki standard v3.7 · 2026-10-14 · background location · hub records location · data health · three layers · location (Option B) · R017 codes · document rows · shared content · dual session

# AKATSUKI.md — copy into the root of every app that joins the hub

Add one line to that app's own CLAUDE.md:
`Follow AKATSUKI.md for anything touching the hub.`
When the hub's copy has a newer version line, copy it again.

## Three layers (v3.4) — who owns what
- **Facts live in the hub.** Location, places, visits, weather, mood entries, health metrics, and every external API key/fetch. Read them from the hub; never fetch the same API yourself.
- **Your domain stays yours.** Own your records and research; write shared facts into the hub; never read another app.
- **Judgements are Neurology's.** Behavioural model, detectors, interventions. Neurology owns no raw facts and publishes its outputs as a feed any app can subscribe to.
- Raw high-volume data (GPS pings) never goes up to interpretive apps — only summaries (visits, routes, novelty).

## Data health (v3.5)
- **Store your own records safely:** one row per record · save only what changed · a delete
  leaves a marker, never a missing entry · reject a save made from a stale copy · pull before
  the first push · refuse a save that suddenly empties a collection · keep old versions ·
  back up before any data move.
- The hub checks nightly what it can read (its tables, your `akatsuki_*` view) and snapshots
  it daily for 30 days. It never writes into your tables.
- If the hub has no view of your storage — or you live in another Supabase project — publish
  one `health.report` to `hub` per device per day, after your state has loaded. Idempotency
  key `health-<device>-<YYYY-MM-DD>`. Payload `{build, device, checks:[{id, ok, n, prev, note}]}`.
  Check at least: count per collection vs last good push, last successful pull, versions kept.
- Codes: `AK401` shrink · `AK402` stuck pending · `AK403` backup stale · `AK404` your report
  failed · `AK405` unchecked (no view, no report in 2 days) · `AK409` found by a code review.
- `akatsuki-client.js` (R026): a handler that throws now defers (retried); return `{ reject: 'reason' }`
  to reject for good. The outbox no longer loses publishes queued during a flush.
- Card lines 12–13: **Health** and **Backup**.

## Dual session (v3.3) — an app in another Supabase project
- The rule is "same Supabase user", not "same project". Keep your own project for your data; add a SECOND client for the hub, signed in to wylxvmkcrexwfpjpbhyy with the same account.
- The hub client: never the app's main client object · `storageKey: 'akatsuki_hub_auth'` · `detectSessionInUrl: false` · header `x-akatsuki-app`. Sign-in to the hub happens only on a page that has only the hub client (`hub-login.html`).
- Never call another app's RPC in the hub project with the bare anon key. Every hub-project call carries the user's JWT.
- Links from such an app are stream-only (the hub cannot view a table in another project). Card line 10 reads `dual — own project <ref> + hub`.

## Shared content (v3.2)
- Same-for-everyone content (audio) is read from the public bucket `akatsuki-audio` — `<lang>/_index.json`, then `<lang>/<key>.mp3?v=<v>`. No sign-in, no hub table.
- Ask for it with one request per pack (`audio.wanted`, ≤ 2000 items). Never call a paid API from a page; fall back on the device.

## Shape
- Akatsuki is the hub. Apps talk to the hub, never to each other.
- Every hub object is prefixed `akatsuki_`.
- The hub adapts to an app's shape (address, clock, private fields). The app conforms
  to the hub's contract (one insert to publish, one cursor read to consume, payloads
  validated against `akatsuki_vocab`).

## Joining — in this order, no code before step 1
1. File the card — 13 lines (paste `card-request-prompt.md` into this app's chat, bring the answer to Akatsuki).
2. Akatsuki registers kinds in `akatsuki_vocab` and routes in `akatsuki_routes`.
3. Akatsuki writes `<app>-adapter.js`; copy it in next to `akatsuki-client.js`.
4. Sign in as the same Supabase user as the other apps.

## Three patterns
- **stream** — discrete items. `akatsuki_requests`.
- **document** — one shared doc shredded into owned rows. `akatsuki_state`.
  A path with one owner is one whole row (`item_key = ''`). Only a path two apps share is split per item.
  Seed your diff cache from `hub.keys(doc)` on first run, so rows made before you adopted get removed, not duplicated.
- **reply** — the target answers in place on the request row.

## Three ways to reach another app's data
- **stream** — brokered copy, when there are changes, merges or deletes.
- **view** — `akatsuki_*` view, read-only reference data.
- **direct** table read — never. Existing ones are defects.

## Kinds
- A kind belongs to one direction: sender → receiver. Never send another app's kind back.
- Before inventing a kind, reuse one the target already accepts.
- A **hub-merged** kind has many senders and one owner: the hub. Senders publish to
  Akatsuki; the hub merges into one row; consumers read the merged row, never another
  app's raw events. (`visit.open | visit.heartbeat | visit.close`.)
- Shared enums — including each kind's reply statuses — come from `akatsuki_vocab`. No local copies.
- Never map an enum (e.g. `source`) to a display field (e.g. shop).

## Sending
- Publish on real change only. Never write what you didn't just read.
- Each install keeps one `akatsuki_device` id (localStorage, minted once). Keys for
  device-observed items include it — a visit's key is `(device, since)`.
- One idempotency key per **request**, not per item. After the request is answered or
  withdrawn, a re-send gets a new id (`<id>-2`, `-3`…). Only a retry of a failed send reuses it.
- Contract errors (not declared, no route, unknown kind, missing field) are permanent:
  never queue them, never retry them, show them.
- Every hub error has a stable code in `error.code`: `AK1xx` contract, `AK2xx` outcome,
  `AK3xx` client. Match on the code, never the message. List: `akatsuki_vocab` ns `error`.
- `publish` returns `pending | skipped | closed | queued`. `closed` (AK202) = the target
  already closed this request; the re-send takes a new id.
- `akatsuki_contract` shows, per route, what publish would say (`blocker`) and the traffic.

## Receiving
- Consume only after the app's own state has loaded — signed in is not enough.
- An ack means **applied**, not received. Errors that may clear up return `{defer}`
  (the row stays pending, retried with back-off); only malformed rows throw.
- An item is not delivered until the user can see it on the screen the card names.

## Replies
- Replies ride the request row. Read them by `reply_seq`, never `seq`. Keep the max seen as the cursor.
- Store the sender's `src_addr` word for word on anything you may reply to.
  `akatsuki_reply` matches it by exact jsonb equality. Never reshape it.

## Integrity
- No app clock is trusted. `akatsuki_seq` orders everything; app clocks are recorded only.
- App times may define what an item **measures** (a visit's start, last seen). They never
  order writes or decide which write wins — `akatsuki_seq` does.
- Deletion is orphaning: the row is kept, nothing cascades across apps. A UI "delete" of a
  hub row hides it locally.
- Failure is skipping: `ON CONFLICT DO NOTHING`, reported as `skipped`.
- Single-flight is server-side (`pg_advisory_xact_lock` in `akatsuki_publish`).

## Security
- RLS on every table: `user_id = auth.uid()`, `TO authenticated`. Views carry `security_invoker = on`.
- Secrets live in Vault. A key shipped in a client bundle is flagged.

## Location
- **The hub records location (v3.6).** Akatsuki is an installed app and runs the detector
  itself while open. Apps that need location **read** it: `hub.whereNow()` (where now, or
  empty = unknown) and `hub.visits({ days })` (sessionized visits, no coordinates). Do not
  add your own `watchPosition` for a hub feature.
- An app may still capture (e.g. Cost while it is open): load `akatsuki-location.js`
  as shipped, never fork it. The app supplies callbacks only (`minutesFor(pin)`,
  `enabledFor(pin)`); defaults are `defaultMinutes` / `unknown`. Each install is its own
  device, so the same stop can arrive from two devices; take the newest row.
- Raw fixes never leave the device. Only visit events are published.
- A heartbeat is a real change only when `last_seen_at` moved ≥ 2 min. Visits end at
  last seen, never at the time the app noticed.
- **Background (v3.7).** The phone's OwnTracks app reports to the hub in the background;
  the hub's `akatsuki_ping()` turns reports into visits. Nothing is stored raw. You read the
  same `whereNow()` / `visits()`; a visit's `source_app` says who saw it.
- Nothing is recorded while neither Akatsuki nor a capturing app is open on screen (no
  background GPS in a web app) — unless the phone agent is running. Say this in every launch doc.

## The same-origin trap
Apps on different ports do not share localStorage. Supabase, signed in as the same user,
is the only cross-app path. Akatsuki does not create an offline one.

## Wiring and ops
- Load order: supabase client (header `x-akatsuki-app: <app>`) → `akatsuki-client.js` →
  `<app>-adapter.js` → one hub instance.
- Expose `window.<app>.supabase` and `window.<app>.hub` for console checks.
- One entry file. Paths to hub scripts are relative to that app's `index.html`.
- PWA: bump the service-worker cache name every build, cache every hub script, keep `sw.js` present.
- Show the build id in the UI and in the first `[ak]` log line. `[ak]` logging is debug-only;
  warnings and errors always log.
- Migrating to the hub: keep the old path (paste, localStorage) until hub rows appear, then delete it.
- Changing where items land needs a migration step, not just new code.
