# Run V2-S with Claude Code

## Setup (once)
1. Download this folder (`v2s-akatsuki-places`) and unzip it to
   `Roadmap_advanced/docs/v2s-akatsuki-places/`.
2. Open a terminal in `Roadmap_advanced/` and run `claude`.

## Step 1: SQL (you do this, before the prompt)
Supabase dashboard → SQL editor → paste `0007_places_to_hub.sql.txt` → Run.
Then run the four checks at the bottom of that file. Expected results: `null` · `6` · `0` · only the roles FK.
If it raises an error, stop and paste the error into Claude Code.

## Step 2: paste this into Claude Code
```
Apply the V2-S handoff in docs/v2s-akatsuki-places/. Follow APPLY.md.

1. Copy docs/v2s-akatsuki-places/0007_places_to_hub.sql.txt to
   supabase/migrations/0007_places_to_hub.sql, and 0007_rollback.sql.txt to
   supabase/migrations/0007_rollback.sql. Don't run either one; the SQL was already applied by hand.
2. Replace public/akatsuki/akatsuki-client.js and public/akatsuki/rm-adapter.js
   with the copies in docs/v2s-akatsuki-places/public/akatsuki/.
3. Apply each *.PATCH.txt as exact FIND → REPLACE edits:
   types.PATCH.txt → src/types.ts, rmHub.PATCH.txt → src/lib/rmHub.ts,
   suggester.PATCH.txt → src/lib/suggester.ts,
   NowStrip.PATCH.txt → src/features/home/NowStrip.tsx.
   If a FIND string doesn't match exactly, stop and show me the real code.
   Don't guess.
4. Run npm run build and fix only type errors caused by these edits.
5. Show me the diff. Don't commit yet.
```

## Step 3: test (you, in the browser)
Ask Claude Code to `npm run dev`, then go through APPLY.md §4 (tests 1–5).

## Step 4: ship
Tell Claude Code:
```
Commit with message "V2-S: places move to the hub (R023)", push, and print
the full sha. Put the sha into docs/v2s-akatsuki-places/REPLY3.md.
```
Then deploy the way you usually do, and send `REPLY3.md` and the 0007 migration file to Akatsuki.
