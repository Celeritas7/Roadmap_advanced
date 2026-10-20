# REQUEST · STEP7 · Roadmap → Akatsuki — shopping through Cost, capture from WF

**From:** Roadmap · 2026-10-20 · build after PR #8 (quick capture)
**Asks:** two routes that reuse existing kinds (A, B), one read of an existing view (C), one new kind (D). Nothing in Roadmap depends on these until you reply; Roadmap's own capture ships without them.

## Why
The user wants one inbox for random thoughts, owned by Roadmap, and one shopping list, owned by Cost (their 10 Oct WF note: *"Cost should be the main centre from where things are bought; the list visible in WF too"*). Roadmap's job is to bring shopping back **by place**: tissue paper from Sukkiri should show in Roadmap's "Doable at outside" when the user is out.

Today Roadmap receives none of it. Routes checked live on 2026-10-20:
- `sukkiri → cost purchase_request` and `wf → cost purchase_request` are live (8 and 6 sent).
- `cost → wf request.created/changed` and `cost → wf purchase.board` (view `akatsuki_purchases`) are live.
- No route touches `rm`.

## A · `rm → cost purchase_request` (reuse kind)
Roadmap sends a capture that reads as shopping ("buy tissues", "get facewash", "買う") to Cost, same shape Sukkiri sends:
```json
{ "id": "rm-<roadmap task uuid>", "items": [{ "name": "tissue paper", "category": "Household" }],
  "source": "rm", "category": "Household", "currency": "JPY", "requestedAt": "<iso>" }
```
- Idempotency key `rm:purchase:<task uuid>`; a re-send after close takes `-2`, `-3` (AKATSUKI.md *Sending*).
- `yen` / `totalYen` omitted when unknown — **does Cost accept that?** Sukkiri always sends them.
- `category`: the user wants a Fashion bucket (facewash). **Which category values does Cost accept** — free text, or a vocab list we should read?
- Roadmap keeps its own task (tagged `shop`, parked) and stores `src_addr` word for word for the reply.

## B · `cost → rm purchase_reply` (reuse kind, reply pattern)
Same as `cost → wf` today: Cost answers on the request row; Roadmap reads by `reply_seq` and ticks its task done on `bought`, removes it on `cancelled`. **Please list the reply statuses** (vocab) so Roadmap matches them, not a local copy.

## C · Read `akatsuki_purchases` (view, read-only) — `cost → rm purchase.board`
Same access WF has. Roadmap mirrors each open request (any sender) as a Shopping task tagged `outside`, with `plan_shop` as the place hint, so Sukkiri's and WF's requests appear in Roadmap by place. Done/cancelled in Cost → closed in Roadmap. Roadmap never writes to it.
- **Cost's own wishlist** (`request.created` to WF: measuring tape, mold spray, masks…) is not a `purchase_request`, so it's not in this view. **Which is right:** (a) the view also carries Cost-own requests, or (b) route `cost → rm request.created / request.changed` like WF?

## D · New kind `inbox.add` — `wf → rm` stream
For WF's own "＋ capture" box. Roadmap owns the item.
```json
{ "text": "visit the new ramen place in Shimbashi", "at": "<iso>", "device": "<akatsuki_device>" }
```
- One idempotency key per capture: `wf:inbox:<device>:<epoch ms>`.
- Roadmap applies with the same word guesses as its own capture (Shopping / Places / App dev / Languages / Other), parks it in the Inbox, acks `applied`. A shopping line also goes out as **A**.
- Malformed (empty `text`) → Roadmap returns `{ reject }`, per R026.
- **Optional:** a read-only count for WF ("N in Roadmap inbox"). Your call whether that's a view or a doc.

## E · `rm-adapter.js`: pass `{ reject }` through (R026 follow-up)
Since R026 a handler that *throws* is deferred and retried for ever, and `rm-adapter.js` forwards only `{ defer }` from Roadmap's callbacks (`passDefer`). A malformed row (empty-title `task.upsert`, `session.completed` without `task_id`, `suggestion.answered` without an id) can therefore only be acked as *applied*; Roadmap now does that with a warning instead of throwing. Please let the three wrappers pass `{ reject: 'reason' }` through as they pass `{ defer }`, so such rows are recorded as rejected.

## What Roadmap needs back
1. Routes A, B, C (and D) registered, with the vocab for Cost categories and reply statuses.
2. `rm-adapter.js` additions — suggested names, rename freely: `sendPurchase(task, items)`, `purchases()`, a `purchase_reply` reader, and an `onInboxAdd` handler slot.
3. Answers to the four **bold** questions above.

Roadmap's side is about half a session once these land. The WF capture box needs a WF session.
