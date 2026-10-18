# V2-P · Settings — stage 1: the data model

Migration only. **Nothing in the app changes**, and nothing breaks: `seed.ts`
stays the runtime source until stage 2 ships the UI. This exists so the tables
and their RLS can be proven on their own — which is the sequencing you picked,
and a good call given 0003 turned up three surprises.

Depends on `0003_real_gate.sql` being applied.

## Files

| File | Where |
|---|---|
| `0004_settings_model.sql.txt` | Supabase SQL editor, one transaction. Also save as `supabase/migrations/0004_settings_model.sql` |
| `0004_rollback.sql.txt` | save as `supabase/migrations/0004_rollback.sql` — only run if needed |

Do **not** run both. The rollback is the undo.

## What it creates

Four tables, all `user_id NOT NULL DEFAULT auth.uid()`, RLS on, one owner
policy each, `TO authenticated` — same pattern as 0003.

| table | rows seeded | notes |
|---|---|---|
| `roadmap_roles` | 3 | label, subtitle, badge, mood, hue, start/end hour, weekend override, position |
| `roadmap_projects` | 8 | label, short, hue, nullable `role_id`, position |
| `roadmap_locations` | 3 | home / office / train |
| `roadmap_role_locations` | 6 | join table, not a `text[]` |

**Applied Oct 4** — counts verified 3 / 8 / 3 / 6. Eight projects: `wf` and
`weekly` (V2-D quarantine + catch-all) were removed from `seed.ts` in V2-Q and
are not seeded. Triggers use the live `roadmap_set_updated_at()`, not 0001's
`roadmap_touch_updated_at()` (never applied).

## Decisions carried in from the form

- **`(id, user_id)` composite primary key.** The text id stays readable
  because folder tags and `?plan=dx` URLs are built from it; the composite
  makes a second user non-colliding without uuid churn. Every FK between
  these tables is composite too.
- **`role_id` is nullable** — null is Unassigned, where a project lands if its
  role is deleted without reassignment.
- **Locations are a join table**, not `text[]`, so renaming or deleting one
  can't leave a dangling string on a role.
- **Weekend override is two nullable columns**, null unless the role changes
  its window at the weekend. Only Defenders does today (09–21).
- **The seed writes `user_id` explicitly** rather than relying on
  `auth.uid()`. The SQL editor has no session — `auth.uid()` is null there,
  and every seeded row would be invisible the moment RLS evaluated it. This
  is the trap that would have made the whole migration look like it worked.

## Decided for you (both skipped twice)

- **Locations and WF contexts stay two vocabularies.** `home`/`office`/`train`
  overlap with `@home`/`@office`/`@train`, but `@deep-work`, `@phone-only` and
  the two Claude contexts are modes, not places. Settings will show the
  overlap; nothing syncs between them. (WF contexts now come from
  `akatsuki_vocab`, not `wfConfig.ts` — deleted in V2-Q.)
- **Adding a location does not create a WF context.**

Both are data-level choices — reversible later without a redesign.

## Verify

Shape and row checks are written at the foot of the migration. The one that
matters most:

```sql
select count(*) from roadmap_projects
 where user_id <> 'e91a5f37-e63a-4fd0-8488-4d7a51d56822';  -- must be 0
```

If that is non-zero, the seed ran with a null `auth.uid()` and the app will
read nothing in stage 2.

## Stage 2 — not in this handoff

The Settings modal (layout A: sidebar tabs, roles collapsed by default,
projects grouped by role with drag-to-reassign), the gear icon, moving the
theme switcher out of the header, `seed.ts` rewired to read these tables, the
Unassigned card on Home, and Save/Cancel with per-section Restore defaults.

Say when this migration verifies clean and I'll build it.
