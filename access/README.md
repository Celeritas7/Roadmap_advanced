# Roadmap session access preparation

This is an opt-in **synthetic staging preview**, coordinated with Commonplace G0
candidate 08. It does not install SQL, deploy the app, enroll learners or resume
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
No live backend or personal record is used by these tests.

Before real use, review Commonplace candidates 01 → 03 → 08, original ownership
and session history, recovery evidence, actual study-app callers and a coordinated
client cutover. Keep the existing start/complete signatures and original `rm_task`,
`rm_day`, `rm_ret` handshake. Do not replace keys, clear storage, infer owners or
replay another account's retries. Receipt retention must be reviewed before pruning.
The preview is not a completed migration, device check or G0 clearance.
