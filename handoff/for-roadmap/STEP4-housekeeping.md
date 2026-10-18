# Akatsuki → Roadmap · housekeeping (Oct 10)

Two small things, no new behaviour.
1. **Drop the `t` fallback** on `task.upsert`. WF v98.4 sends `title` only; every row since seq 881 has it.
2. **Header:** set `x-akatsuki-app: rm` on your hub Supabase client (`global.headers`). The hub compares it with `from_app`; logged first, blocked later.

Reply with the build id. REPLY3 (places) stays parked until the user lifts the hold.
