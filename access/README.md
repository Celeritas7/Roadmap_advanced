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

## Task metadata recovery (candidate 13)

Commonplace #124 and Roadmap #21 are merged. The next isolated work group routes
**task names, tags and group expansion** through
`ga_roadmap_edit_tasks(p_tasks, p_request_id)` after candidates 01/03/13. Every
explicit task includes its original timestamp and a metadata-only patch. A batch
commits once with private before/after history, or entirely fails. Replay checks
current access and returns current state. Mirrored Weekly Focus title/tag changes
stay with that owner. Structural/mixed patches never silently fall back from a
failed metadata save to a direct table write.

The actual staging rename field keeps unsent text on blur and failed Save. A
confirmed Save closes it; an attempted save persists the exact request under its
original account. **Task edit recovery** exposes proposed patches as text, Retry,
explicit Discard and Reload. Unsent text is only an in-page draft. A storage error
sends nothing. Invalid acknowledgements, version conflicts, lost responses and
account changes retain the request. Duplicate attempts share a request, and a
newer tab's saved request is not removed by an old result. One pending metadata
batch per account must be resolved before a different batch. Discard is not a
server undo and requires reload before a new metadata edit.

The UI applies only confirmed target rows and retains unrelated edits and the
session ledger. A target changed during the request is kept for review. Pending
metadata, daily actions and resets are resolved in order. Old structural mutations
are serialized against metadata through their recovery/rollback lifetime, so an
old entire-tree rollback cannot replace a new metadata save. Their own failure
behavior still needs the later structural-mutation work group.

Limits: 1–100 distinct tasks, a 48 KiB UTF-8 saved request (64 KiB canonical server
JSON), 4,096-byte nonblank titles, 32 distinct nonblank tags of at most 80 bytes,
and boolean expansion. No owner, hierarchy, streak, completion or date patches.
No imported script/HTML execution and no new privileged frontend credential.

Unit checks cover requests, acknowledgements, failure/storage/account/conflict
recovery. The added browser check exercises the actual task row, store and panel
through blur, failure, reload, retry, bulk tags and overlapping edits. The reset
regression retains its overlapping ordinary-writer check and verifies the new
metadata guard. Real JWT/concurrency/history tests live in Commonplace's isolated
Supabase CI. Type check/build and source pins cover the integrated staging copy.

[Task edit readiness](https://github.com/Celeritas7/Commonplace/blob/main/platform/acceptance/ROADMAP-TASK-EDIT-READINESS.md)
records boundaries. Next: daily-log entry recovery, then creation/capture and
structural edits, followed by hub/caller/account-state acceptance. Source runtime,
Pages deployment, personal auth/storage and Commonplace offline packs remain
unchanged. G0 is still open; hosted changes and enrollment remain on hold, and
restoration remains deferred.

## Daily-log entry recovery (candidate 14)

Commonplace #126 and Roadmap #22 are merged. This isolated work group replaces
only the copied `TodaysLog` form and copied store action with acknowledged
`ga_roadmap_add_log(p_entry_id, p_entry, p_request_id)` after candidates
**01/03/09/14**. Root runtime, personal auth/storage, hub and deployment stay intact.

The form keeps draft text when focus leaves it, validates whole-minute durations
without truncation, freezes its original calendar date on opening and awaits
confirmation. Close keeps the in-page draft; it does not discard a saved retry.
Unsubmitted drafts are in-page only. A valid Save attempt persists its exact
account, entry/request UUIDs, date, optional task, context, duration and notes
before transmission. Storage refusal sends nothing. Only one unresolved log per
account is retained; different data cannot silently replace it.

**Daily log recovery** shows the saved date and notes with Retry, Discard and
Reload. An uncertain response/reload uses the same IDs and original date, even
after midnight. The server returns the current owned log on replay, preserving
later notes and an optional task link cleared by deletion. A deleted/foreign log
is not recreated. Entry and private creation receipt commit together or neither
does. The receipt is not a history of later legacy edits or a restore API.

A successful form or panel retry clears the associated form, preventing a second
submission of that failed draft. Confirmation is matched to the form’s original
request and payload; another tab’s log cannot clear or replace a different
in-page draft, including after Close/reopen. Earlier-day confirmation displays its date and
notes even though the existing list remains today-only. First acknowledgements
must match the request; missing/invalid/foreign responses keep the retry. Account
generations and cross-tab storage checks reject stale cleanup. Existing safe
reload on account change is retained; no browser data is cleared.

Local merging deduplicates by entry UUID and keeps unrelated logs, tasks and
study sessions. A target changed during confirmation is retained for review.
New log creation waits out the entire legacy delete/rollback lifetime, and
pending entries block new deletion. This prevents an old list rollback from
hiding a new entry; deletion's own version/history work remains separate.
Discard never undoes a server insert and requires reload before another entry.

Limits: integer minutes 1–1440, explicit ISO calendar date, context at most 128
UTF-8 bytes, notes at most 16 KiB, saved client envelope at most 24 KiB (server
JSON at most 32 KiB). No owner/timestamp or unknown field input. Plain text only.
The server requires a verified non-anonymous caller and current owned task for
linked entries. It is not an app-admission allowlist; verified users may create
their own general entries. Broader admission acceptance remains a G0 gate.

Unit checks cover original-date/identity persistence, quotas, conflicts, invalid
acknowledgements, account changes and cross-tab work. Browser checks drive the
actual form/store/panel through blur, midnight, failure, reload, retry, duplicate
prevention, older delete rollback and concurrent edits. Commonplace's disposable
Supabase CI checks JWT ownership, contention, history rollback and revocation.
See [daily-log readiness](https://github.com/Celeritas7/Commonplace/blob/main/platform/acceptance/ROADMAP-LOG-READINESS.md).

Next: task creation/capture recovery, then structural mutations/deletion and
hub/caller/account-state acceptance. G0 stays open; hosted work and enrollment
stay on hold. Deferred restoration and original offline packs remain untouched.

## G0 task creation and capture preparation

Commonplace #129 and Roadmap #23 are merged. The next bounded work group
uses the unchanged production source at `80d1584b52a37198ad906c46cef864ad295a6cbd`.
Only the ignored loopback fixture is patched; root source, public assets, auth
keys, deployment and hub protocol remain untouched. General_apps is the intended
backend; hosted changes/enrollment stay on hold and restoration stays deferred.

The copied Group form now awaits confirmed task creation and retains its title
on blur, Close or failed save. The copied CaptureSheet submits up to 32 items
as one transaction; it retains the original text and classification. The new
`ga_roadmap_create_tasks` contract is candidate 15 in Commonplace, after 01/03.
It creates missing capture folders and tasks together or rolls back all of them.
Saved request/item identities prevent repeated inserts on uncertain retry.
Separate new capture requests reuse the current owned category folders.
Ambiguous or repurposed folders require review, not another guessed folder.

Valid Save attempts persist before any network call. Unsubmitted text is kept
in-page only. Each request has its own `rm-task-create-v1:<owner>:<request>` slot,
so simultaneous tabs cannot overwrite another request's recovery envelope.
Normally resolve pending work before creating more. Request/owner/epoch checks,
quota errors, malformed replies and missing current rows never claim success.
The recovery panel previews original titles/text and retries the exact batch
after reload. A confirmation clears only its associated form draft; it cannot
clear a different draft in another form. Payload fields are bounded (4096-byte
titles, 32 tags of 80 bytes, 32 KiB original text); the saved UTF-8 envelope is
limited to 48 KiB, below the server's 64 KiB JSON limit.

Local application updates only returned rows, retains unrelated edits, logs and
session proof, and detects overlapping target edits. Legacy tree mutation and
rollback lifetimes are kept out of creation. The normal addFolder/move workflow
remains a structural follow-up; its rollback lifetime is guarded here. Capture's
old automatic network retry and optimistic timed Undo are absent in the preview:
use saved Retry, and review confirmed tasks in Inbox before explicit deletion.
A discard never undoes a server insert and requires reload before new creation.
Nothing clears personal storage or offline packs.

Tests add controller validation/recovery cases, actual Group/CaptureSheet browser
flows and four disposable Supabase groups with real synthetic JWTs, concurrent
requests, ownership waits, receipt rollback and committed revocation. These do
not approve hosted or physical-device acceptance. The endpoint preserves the
existing owner policy; it is not a Roadmap admission allowlist.

The subsequent structural task/deletion preparation is recorded below. Hub and
suggestion delivery, actual study callers, account-scoped local state and the
other shared-project gates remain separate. G0 remains open.


## Structural task changes and deletion review (candidate 16)

Commonplace #131 and Roadmap #24 are merged. The builder pins the Roadmap
`35f9cb51eaa3cab32789e5ae59cf380294ff8b91` source and changes only its ignored
loopback copy. Commonplace candidate **16**, after **01/03/08/09/15**, adds
`ga_roadmap_structure(p_payload, p_request_id)`. This is G0 preparation, not a
hosted rollout or a new Commonplace migration.

Moves and sibling reorder now save one versioned transaction; new-folder creation
and its moves commit together. Desktop/mobile forms keep failed names, show the
saved retry and clear only their associated confirmation. Only acknowledged
rows update the current tree. Unrelated edits, notes and proof remain intact;
a conflicting local target stays available for review. Earlier legacy completion
or resource-write rollback must settle before preparing structural work.

Deletion first saves a review containing every task and descendant title, without
sending anything. **Tree change recovery** offers **Confirm deletion** or **Cancel
deletion**. Cancel before any attempt is a local undo. Attempt state is persisted
before the RPC, so an uncertain result cannot be presented as an unsent cancellation.
The copied Inbox does not commit deletion when its timer expires or the view
unmounts. Existing Keep timers have separate unchanged behavior.

Attempted requests expose **Retry tree change**, explicit **Discard tree retry**
and Reload. Discard is not server undo; it requires a current-tree reload before
more writes. Exact original account/request/UUID/version details persist across
reload in `rm-structure-v1:<owner>:<request>` slots. Storage failure sends nothing.
Account epochs, exact acknowledgements and saved-byte checks protect original
retries. Other interacting write paths check pending structures before preparing
another intent. These client guards do not replace server authorization.

The server retains sessions, daily logs, comparisons and suggestions under the
same owner with null optional task links. Feedback/proof and notes survive.
Task resources leave the active view but their exact original rows remain in
private deletion history with task snapshots and the candidate 08 daily-action
receipts that otherwise cascade. Candidate 08 is an explicit prerequisite. No restore API or post-commit Undo
is provided. Replays never delete again or recreate a removed task. Mirrors,
foreign/non-group parents, cycles, stale versions and incomplete subtrees fail
atomically. Existing direct writers still need coordinated cutover.

Limits: 100 selected tasks (or a folder-only request), 48 KiB UTF-8 saved envelope,
64 KiB server JSON, 5,000 owned tree rows and 1 MiB deletion evidence. Large changes
stop for review, without partial splitting/truncation. Receipts and UUID reservations
require an explicit retention/erasure review before installation.

Controller and real-browser checks cover review/cancel, unmount without delete,
uncertain save/reload, exactly-once folder moves, reorder, account changes,
competing tabs, quotas, old rollback and newer local edits. Commonplace's disposable
Supabase tests add real JWT ownership, concurrency, new-child lock waits, history
rollback and revocation. Physical iPad/Android and hosted acceptance remain open.
See [structural readiness](https://github.com/Celeritas7/Commonplace/blob/main/platform/acceptance/ROADMAP-STRUCTURE-READINESS.md).

Next bounded G0 group: **suggestion and hub delivery readiness**; then actual
study callers and account-scoped local-state acceptance. Remaining direct writers
need explicit cutover checks. Root source, auth keys, deployment, hub protocol,
offline packs and personal data are unchanged. Hosted work/enrollment remain on
hold and restoration remains deferred at its prior checkpoint.

## Suggestion recovery and hub delivery preparation

Commonplace candidate 17 (after 01/03/09) adds an atomic answer/session transaction
and durable skip effect. This preview now patches copies of the actual suggester,
NowStrip and adapter. `Suggestion answer recovery` preserves account-owned request
IDs, original logical days and exact skip addresses through lost replies/reload.
Each RPC carries a captured token for the original account; a newly switched SDK
session cannot borrow the previous account's pending payload.
Only confirmed local application and required hub publication consume a retry.
Contract refusals remain visible without automatic resending; a failed session
refresh keeps its acknowledgement pending. Existing study proof, notes, legacy
outboxes and downloaded packs remain untouched.

Saved live suggestions retry publication with their original timestamp. Nested
addresses participate in the copied adapter's diff cache; rejected/deferred
handlers retain their distinct meanings. No changes are made to root `src/`,
`public/`, authentication keys, deployment, hub routes or production data. Hub boot
stays off. Synthetic browser tests invoke callbacks explicitly; they do not
represent a connected hosted Akatsuki test.

Before cutover, reconcile candidate 17's current catalog and the first committed
answer with any legacy logs lacking receipts. Retain receipts while retries can
exist. Current source strings/app IDs are metadata, not proof of a real stream
sender. The actual hub contract must independently validate the sender and route.
The remaining mirrors/pairing, done requests/replies, session-completed callers,
shared-document ordering and old account-unscoped state require acceptance before
hub activation. Do not replay old `akatsuki_outbox_rm` under a guessed account.
See Commonplace's `platform/acceptance/ROADMAP-SUGGESTION-READINESS.md` for the gate
matrix. Restoration stays deferred and hosted rollout/enrollment remain on hold.

## G0 task mirror delivery preparation (27 November 2026, Japan)

Follows merged Roadmap #26 and Commonplace #135. Candidate 18 (after 01/03/15)
atomically saves the exact source pair, task/folder and owner/sequence receipt.
The per-owner mirror reconciliation gate starts empty/default-deny. It requires
review of original hub links, including deleted targets; never adopt by title or
assume the current account owns legacy data. See Commonplace
[`ROADMAP-MIRROR-READINESS.md`](https://github.com/Celeritas7/Commonplace/blob/main/platform/acceptance/ROADMAP-MIRROR-READINESS.md).

The builder copies `mirror-contract`, `mirror-sync`, `MirrorRecovery` and patches
only ignored copies of the real hub handler/adapter. Owner/sequence slots save
before send; lost responses/reloads retry original data. The original account JWT,
epoch and exact saved bytes are checked before applying/clearing. Current server
rows preserve newer local edits; confirmed pairs survive reload, retain full JSON
addresses and cannot resurrect local deletions. Legacy unscoped pending-done,
outbox and cursor records and offline packs are preserved.

Automatic hub startup remains disabled. Copied task callbacks reject malformed or
wrong-source deliveries, and defer transient failures. Source-deletion callbacks
retain the local orphan but defer hub acknowledgement: the reviewed hub source's
orphan/ack app attribution, `deleted` versus `del` and cross-device ordering need
joint acceptance before activation. No swallowed orphan failure is treated as
success. The RPC is owner-authorized storage, not proof of the sender's identity.
Other hub reply/orphan routes and account-safe consume/ack lifecycle remain gated.

Focused commands: `node --experimental-strip-types --test access/tests/mirror-contract.test.mjs access/tests/suggestion-adapter.test.mjs`;
then build the fixture and run `node --test access/tests/mirrors.browser.mjs`.
The existing CI also runs the full contract/browser suite and TypeScript/Vite build.
Next work: task.done/reply identities, pending-before-send and cursor/view recovery.
Hosted changes and learner enrollment stay on hold. Restoration remains deferred;
this is preparation within G0, not a new rollout phase or learner pilot approval.
