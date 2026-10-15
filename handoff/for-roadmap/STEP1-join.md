# Roadmap — step 1: join Akatsuki (R022)

Attach: `rm-adapter.js`, `akatsuki-client.js`, `akatsuki-banner.js`, `AKATSUKI.md`.
Your card is filed as R022, app id `rm`. Same Supabase project, one session. The hub read `main` and then the live database, and they disagree: live has RLS, sign-in, `roadmap_session_days`, `roadmap_task_resources` and a `task_links` table (`wf_board_id, wf_item_key, wf_sub_id, rm_task_id, wf_u, rm_seen_at, orphaned_at, source, last_synced_at`) that `main` doesn't have. **Work from the live code**, and push it to `main` as part of this step.

## Fix first: the direct writer
Your WF link reads `weekly_focus_entries` and **writes it** (whole-row upserts, matched by `task_links`). The hub shows it last ran on **Sep 21** (12 pairs, 0 orphaned) — the day of the duplicate-folder race — so it is probably switched off already. Either way, WF owns its rows; from now on nothing but WF writes them. In this step:
1. Delete every write to `weekly_focus_*`. Reads of `weekly_focus_entries` go too: tasks arrive by `task.upsert` through the hub (below), tags through the view `akatsuki_task_tags`.
2. Migrate pairs: for each `task_links` row, the hub's link row is written for you when `onTask` returns the mirror id (the hub records `{board_id,item_key,sub_id}` ↔ `{id}` in `akatsuki_links`). Keep `task_links` read-only until the first full hub pass has landed, then drop it.
3. `roadmap_contexts_map` → read `akatsuki_vocab where ns = 'context'` instead; then drop the table.
4. Add the header to your client: `global: { headers: { 'x-akatsuki-app': 'rm' } }`.
5. `roadmap_tasks` had rows from **two** accounts (`mangaonkaraniket@` = the hub user, and `anikettelexistence@`). The hub merged them into the hub user. From now on Roadmap signs in as **mangaonkaraniket@gmail.com only**; remove any remembered session for the other address.
6. **Own sign-in and sign-out.** `main` has no `signIn*` call and the live app has no sign-out. On `celeritas7.github.io` Roadmap shares one localStorage with Scriptura and JLPT, so today it rides whichever hub session a neighbour left in `sb-wylxvmkcrexwfpjpbhyy-auth-token` — that is how the second account got in. Add a sign-in screen (Google OAuth, same account) shown when there is no session, a sign-out in the header, and a `storageKey` of your own (`rm_sb_auth`) so a neighbour's sign-in never becomes yours.

## Files
- `public/akatsuki/akatsuki-client.js`, `public/akatsuki/rm-adapter.js`, `public/akatsuki/akatsuki-banner.js`.
- `index.html`, before the Vite module script: `<script src="/akatsuki/akatsuki-client.js"></script><script src="/akatsuki/rm-adapter.js"></script>`.
- `src/types.ts`: declare `window.RmHub` and `window.rm`.

## Wire it (after sign-in, after tasks have loaded)
```ts
const rmHub = window.RmHub(supabase, { onTask, onAnswer, onSession, log: console.debug })
window.rm = { hub: rmHub }
await rmHub.loadVocab()
const links = await rmHub.links()      // [{ wf:{board_id,item_key,sub_id}, rmId, orphaned }]
const tags  = await rmHub.tags()       // view akatsuki_task_tags, one row per WF subtask
rmHub.start()
```
- `onTask(addr, payload, seq)` → upsert the mirror in `roadmap_tasks` (kind `task`, tags `['wf', project]`, project from `item_key` prefix: `study:` → lang, `app:`/`office:` → dx) and **return its id**. `payload.del` → tag it `orphaned`, keep it, return null. `payload.lat` → keep, hide from the suggester. Title and date are WF's; never edit them in Roadmap.
- `onAnswer(payload, fromApp, seq)` → append to the suggestion log. `action === 'skip'` → `rmHub.skip(addr, payload.reason, payload.suggestion_id)`. `start` → open today's `roadmap_study_sessions` row. `dismiss` → a miss.
- `onSession(payload)` → the existing `roadmap_complete_session` logic, from the stream instead of the RPC.
- Ticking a WF mirror in Roadmap → `rmHub.done(addr, suggestionId)`. Do not flip `done` locally until WF's reply says `applied` or `already`; poll `rmHub.wfReplies(sinceSeq)` and keep the max `reply_seq`.

## The suggester
Pure helpers are on `window.RmHub`: `guess(task)`, `score(task, ctx)`, `pick(tasks, ctx)`, `say(title, toneStep, energy)`, `nextTone(step, {missed, done, energy})`, `isMiss(answer)`.
- Context: `{ hour, weekend, energy, mood, device, place, activeRole }`. `energy`/`mood` are a 3×3 grid asked only when the last answer is older than 3 h. `device`: phone / laptop / either. `place`: a manual pick from vocab `enum place` until R018. `activeRole` = your existing effective role.
- Each loop: `const t = pick(tasks, ctx)`; make an id; `rmHub.suggest({ id, task: addr, title, level, say: say(title, step, energy), toneStep: step, until: +90 min })`. Save the suggestion row in **your own** `roadmap_suggestions` table (private): id, task, ctx, tone step, answer, reason, missed.
- When `until` passes with no answer → miss. Skip with a reason → not a miss. Tone +1 per miss, reset on done, frozen while `energy === 'low'` (and the copy softens — `say` does it).
- Replace the seed `CONTEXTS` constant with `rmHub.vocab().context`. Roadmap guesses `type` + `effort` (`guess()`), writes them once with `rmHub.tag(addr, {...guess, level})`; a user correction writes `guessed: false`. `level` = role of the mirror's project: attackers → attacker, midplayers → midplayer, defenders → defender.
- Friday 18:00 local: show the week's miss log (private, from `roadmap_suggestions`) and the streak.

## Banner
Roadmap also shows the banner (`AkatsukiBanner(supabase,'rm').start()`), so the Home view and the banner never disagree.

## Reply with
1. The live code pushed to `main` (commit sha), and the Vite dev port.
2. The second `user_id` is settled (merged). Confirm Roadmap now signs in as the hub account only.
3. One `task.done` round trip: WF task address, `akatsuki_requests.seq`, WF's reply status.
4. Confirmation that no code reads or writes `weekly_focus_*`, and that `task_links` / `roadmap_contexts_map` are dropped (or the date you will drop them).
