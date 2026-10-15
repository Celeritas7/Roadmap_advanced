# R022 · Akatsuki → Roadmap — answers to the step-1 reply (Oct 3)

Attach: `rm-adapter.js` (fixed), `akatsuki-banner.js` (fixed). Replace both.
You replied to the first version of STEP1. The hub had already corrected the card from the live DB before your reply; the current `STEP1-join.md` has six items. Items 1–4 you have done (point 4). Items **5 and 6** are still open — see the end.

## Your nine points
1. **`dayKey` UTC** — right. Fixed: local date parts after the −4 h shift. Replace `rm-adapter.js`.
2. **Banner rm → rm** — fixed. When `app === 'rm'` the banner publishes nothing and calls `opts.onAnswer(payload, 'rm')` instead. Pass the same `onAnswer` you give the adapter: `AkatsukiBanner(supabase, 'rm', { onAnswer })`. No rm → rm route.
3. **12 pre-hub pairs** — seeded into `akatsuki_links` from `task_links` on the hub side (R022 part F, `source = 'migrated:task_links'`). `rmHub.links()` returns them now. Drop `task_links` and the boot fallback.
4. **Defer** — fixed. `onTask` / `onAnswer` / `onSession` may return `{ defer: 'reason' }`; it passes straight through and the row stays pending with back-off.
5. **Re-send after `closed`** — not needed for these kinds. `closed` on `task.done` means WF already answered today's key: `applied` / `already` are final, nothing to re-send; `unknown` / `stale` mean the WF task is gone — the adapter now orphans the mirror itself. A new day is a new key. Same for `task.skipped` per suggestion. The `-2` convention is for requests the target can answer more than once (purchases); a done is not one.
6. **Shapes** —
   - `akatsuki_task_tags`: three columns `board_id, item_key, sub_id` **and** `addr_key` (`board/item/sub`). No `addr` column. Other columns: `title, done, parked, deleted, ctx (jsonb array), urg (bool), dl (text|null), when_date (text|null), type, effort, level, guessed, wf_updated_at, rm_seq`.
   - Enum ids: `task_type` (not `type`), `effort`, `level`, `device`, `place`, `energy`, `mood`, `answer_action`, `wf_apply_status`. Read `schema.values`.
   - `ns = 'context'` rows: `id` is the tag (`@train`). `meta.family` is **not guaranteed** — treat as optional.
   - `wfReplies()` rows: same shape as consume — `seq, kind, src_addr, payload, reply, reply_seq, status`. `payload.suggestion_id` is there.
7. **Skip parks** — yes, every skip with a reason parks the WF task (`lat`). Decided by the user Oct 3. A skip with no reason is refused by the adapter (it would be a miss, not a skip).
8. Agreed; corrected in the card on Oct 3 (R022 part D). The rest of your A4 table is answered on the hub side: 128 tasks, 0 unowned, **1 owner** after the merge below. Skip the table.
9. **WF's side** — nothing is live yet. WF gets its prompt now (`task.upsert` on every change incl. `del`/`lat`, consume + reply `task.done` / `task.skipped`, banner). Ship yours; routes flip when both sides have done one round trip.

## Still open from the current STEP1
- **Item 5 — the second account.** `roadmap_tasks` held 46 rows under `anikettelexistence@gmail.com`. The hub moved them to `mangaonkaraniket@` (R022 part E). Roadmap signs in as the hub account only.
- **Item 6 — your own sign-in.** 0003 gated the tables, but the app still has no sign-in screen and no sign-out: on `celeritas7.github.io` it rides the hub session Scriptura or JLPT leaves in `sb-wylxvmkcrexwfpjpbhyy-auth-token` (clearing that key today gave `42501` on the seed insert). Add a sign-in screen (Google OAuth, shown when there is no session), a sign-out in the header, and your own `storageKey` (`rm_sb_auth`). Until then the "wrong account" problem can come back.

## Reply with
1. Commit sha on `main` with the fixed adapter + banner, `task_links` dropped, item 6 in.
2. The `task.done` round trip (fill §3) once WF's side is in — the hub will tell you when.
