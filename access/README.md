# Roadmap session and comparison access preparation

This is an opt-in **synthetic staging preview**, coordinated with Commonplace G0
candidates 08/10. It does not install SQL, deploy the app, enroll learners or resume
the deferred restoration work. Root `src/`, public assets, existing auth storage,
local preferences and saved study data are unchanged.

Daily tasks currently save the checkbox and session in separate requests. The
staged client uses one atomic RPC and retains an original-account, original-day
retry before sending it. Permission denial, pause, missing/invalid acknowledgement
or connection loss never becomes a success. Retry reuses its original request;
multiple clicks share a pending call. A late acknowledgement cannot cross an
account change. A saved retry can be explicitly discarded without undoing any
server write that may already have committed.

The recovery component exposes pending starts/daily changes. Launching a study
resource remains possible when recording its start fails, with a visible warning
and a saved retry. The launch handshake and pending request use the same day.
An account switch hides the old app view and asks for a safe reload. No website
data is cleared; each account's pending actions stay available to that account.
Other editors and the hub keep their separate rollout/acceptance requirements.

The comparison preview adds acknowledged weights/picks, version-checked saves,
and durable account-owned retries. The actual dialog exposes retry, refresh and
explicit discard controls. Conflicting changes stay saved for review; no newer
server version is silently adopted for retry. A failed save does not roll back
the entire comparisons array, and late refreshes cannot overwrite a newer save.
One owner-filtered embedded query reads comparisons and items together. Account
generations reject late responses and preserve the original account's retry.

Commonplace candidate 10 requires 01/03/09. Its comparison edit and private
before/after receipt commit together; replay rechecks access and returns current
owned records. The unchanged legacy importer/direct writes retain separate
replacement/retry and stale-edit requirements. This preview does not certify
them or create an app-admission allowlist.

With Node 22:

```sh
npm ci --ignore-scripts
node --experimental-strip-types --test access/tests/*.test.mjs
node access/prepare-staging.mjs --fixture
npx tsc --noEmit --project .staging/session-fixture/tsconfig.json
npx vite build .staging/session-fixture --config .staging/session-fixture/vite.config.ts
npx playwright install chromium
node --experimental-strip-types --test access/tests/*.browser.mjs
```

The builder verifies exact source hashes, writes only a separate `.staging` copy,
uses a loopback URL and a dummy publishable key, and disables hub consumption in
that copy. It accepts no hosted configuration or credentials. Its distinct auth
storage key cannot sign the production app out. Source changes stop preparation
for review. The existing Pages workflow now filters on runtime inputs, so merging
only preparation files does not deploy; runtime edits and explicit manual dispatch
retain their existing deployment path.

Synthetic tests cover storage failures, stale/account-switched responses, missing
acknowledgements, duplicate clicks, original-day retries and a browser recovery
flow through the actual staged store/component. Commonplace's disposable Supabase
CI verifies the server transaction, ownership, contention and history preservation.
No live backend or personal record is used by these tests. Comparison tests also
exercise stale edits, malformed acknowledgements, cross-tab saved work and the
actual dialog/store through failure, retry and a late background refresh.

Before real use, review Commonplace candidates 01 → 03 → 08 for daily actions and
01 → 03 → 09 → 10 for comparison editing, original ownership
and session history, recovery evidence, actual study-app callers and a coordinated
client cutover. Keep the existing start/complete signatures and original `rm_task`,
`rm_day`, `rm_ret` handshake. Do not replace keys, clear storage, infer owners or
replay another account's retries. Receipt retention must be reviewed before pruning.
The preview is not a completed migration, device check or G0 clearance.

## Comparison import preparation (candidate 11)

The isolated preview now adds **Review a comparison import** inside the existing
comparison dialog. Load the current study JSON or paste a document with explicit
product UUIDs, preview the saved/proposed products, then confirm deliberately.
The form replaces the selected comparison; it does not discover or create tasks.
Existing product IDs preserve omitted notes and creation dates. Weights stay
unchanged. Removing the chosen product requires an explicit choice-clearing option.
Omitted products leave the active list, with full before/after history retained
privately by the server. Draft text before confirmation is an unsent dialog draft;
keep the source file. Confirmed intent is saved durably before transmission.

Candidate 11 requires 01/03/09/10. `ga_roadmap_preview_import(comparison_id)` returns
a revision covering parent and child state. `ga_roadmap_import_comparison` accepts
`p_comparison_id`, `p_task_id`, `p_expected_revision`, `p_document`, `p_request_id`.
For a new study, explicitly choose an unused comparison UUID and existing owned
task UUID with a null revision; the tested caller contract supports this, but the
preview UI provides replacement only. No task/title inference is allowed.

Documents allow title, need/source/notes, products and `clear_missing_choice`.
Products require unique UUIDs and names; optional fields follow the existing study
shape except owner/parent IDs, dates and positions, which are server-controlled.
Preserve UUIDs for matching products. No automatic name-based identity matching
is provided for older imports. Limits are 1–100 products, 240 KiB client JSON and
256 KiB server canonical JSON, bounded values and HTTP(S)-only links. Plain text
is displayed as text. Invalid content is not partially imported or executed.

An import saves once per original account/request, preserves history atomically,
and returns current state on replay. Retries reuse the exact original target,
revision, product IDs and document. Conflicts retain that request for review;
refresh cannot silently change its precondition. Account changes, invalid replies,
quota failures and newer cross-tab work never become successful saves. Preference
and import retries must be resolved in order. Discard is explicit and does not
undo a possibly committed import. A late background read cannot replace the
confirmed result or unrelated newer local edits.

[Commonplace import readiness](https://github.com/Celeritas7/Commonplace/blob/main/platform/acceptance/ROADMAP-IMPORT-READINESS.md)
records the server contract, concurrency/rollback tests, history retention and
remaining gates. The legacy SQL-console importer, root runtime, auth keys and
public deployment remain unchanged. Existing external importers still require
their own verified-JWT and explicit-ID cutover; this staging flow does not silently
replace their API. G0 remains open, with hosted work and enrollment on hold and
restoration deferred.

## Daily reset recovery (candidate 12)

The original minute timer unchecks tasks before independent saves finish; failed
rows then fall out of its next retry filter. The isolated preview now uses
`ga_roadmap_reset_daily_tasks(p_tasks, p_day_key, p_timezone, p_request_id)` after
Commonplace candidates 01/03/08/12. Each of at most 100 targets carries its explicit
UUID and original server timestamp. The server verifies the existing local-time
minus-four-hours logical day, ownership, versions and stale daily eligibility.
The whole batch commits with private before/after history, or rolls back. Only the
checkbox/version changes; streaks and study sessions remain intact.

The timer keeps the original account/day/timezone/batch in durable storage before
sending and changes the screen only after confirmation. A failed or uncertain
request stays visible in **Daily reset recovery**. Subsequent timer ticks do not
create another batch over it. Retry uses the exact original request; a stale
version or changed day requires review. Replay returns current rows, so it cannot
reset a newer completed task. Account generations, validation and cross-tab
checks prevent stale replies from clearing another saved action.

Unrelated edits and session history remain visible. A target edit made while the
reset is running is kept, with the reset retained for review after that edit
settles. Pending daily actions and resets must be resolved in order. Discard is
explicit, does not undo a server commit, and pauses automatic reset until reload
so an old local view does not recreate it immediately. Reload retains local data
and reads the current server tasks. General editor rollback/capture/bulk/log
failures still have their own acceptance work; this preparation does not certify
them or change production deployment, auth storage or the hub.

The new synthetic browser check drives the actual staged timer worker/store and
recovery controls through failure, the next minute-style tick, retry, retained
streak/session data and a concurrent title edit. Commonplace CI verifies real JWT
concurrency, rollback and pause/revocation. Hosted/device acceptance and deferred
restoration remain separate. See
[reset readiness](https://github.com/Celeritas7/Commonplace/blob/main/platform/acceptance/ROADMAP-RESET-READINESS.md).
