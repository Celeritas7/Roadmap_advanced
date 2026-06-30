import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Context,
  ContextFamily,
  LogInsert,
  Project,
  Role,
  TaskInsert,
} from './types.ts'

// ─── ROLES, PROJECTS, CONTEXTS ───────────────────────────────────────
// Mirrored from design_handoff_roadmap_task_manager/source/data.jsx.
// These are in-code constants — never persisted to the DB.

export const ROLES: Role[] = [
  {
    id: 'attackers',
    label: 'Attackers',
    subtitle: 'ambitions',
    badge: 'FWD',
    mood: 'Push your ambitions forward',
    hue: 18,
    defaultStart: 9,
    defaultEnd: 19,
    weekendActive: false,
    locations: ['home', 'office', 'train'],
  },
  {
    id: 'midplayers',
    label: 'Mid-players',
    subtitle: 'life support',
    badge: 'MID',
    mood: 'Keep the engine running',
    hue: 158,
    defaultStart: 19,
    defaultEnd: 21,
    weekendActive: true,
    locations: ['home', 'office'],
  },
  {
    id: 'defenders',
    label: 'Defenders',
    subtitle: 'self-care',
    badge: 'DEF',
    mood: 'Guard your base',
    hue: 252,
    defaultStart: 21,
    defaultEnd: 23,
    weekendActive: true,
    locations: ['home'],
    // Scope add (M1): on weekends, defenders runs 09:00–21:00 instead.
    weekendStart: 9,
    weekendEnd: 21,
  },
]

export const ROLE_BY_ID: Record<string, Role> = Object.fromEntries(ROLES.map((r) => [r.id, r]))

export const PROJECTS: Project[] = [
  { id: 'dx',        label: 'DX Engineer', short: 'DX',     hue: 18,  role: 'attackers'  },
  { id: 'fullstack', label: 'Fullstack',   short: 'Full',   hue: 220, role: 'attackers'  },
  { id: 'lang',      label: 'Languages',   short: 'Lang',   hue: 138, role: 'attackers'  },
  { id: 'visa',      label: 'Visa',        short: 'Visa',   hue: 200, role: 'attackers'  },
  { id: 'food',      label: 'Food',        short: 'Food',   hue: 38,  role: 'midplayers' },
  { id: 'exercise',  label: 'Exercise',    short: 'Exer',   hue: 165, role: 'midplayers' },
  { id: 'sleep',     label: 'Sleep',       short: 'Sleep',  hue: 250, role: 'defenders'  },
  { id: 'fashion',   label: 'Fashion',     short: 'Style',  hue: 320, role: 'defenders'  },
]

export const PROJECT_BY_ID: Record<string, Project> = Object.fromEntries(
  PROJECTS.map((p) => [p.id, p]),
)

const RAW_CONTEXTS: Record<ContextFamily, { id: string; label: string }[]> = {
  where: [
    { id: 'home', label: '@home' },
    { id: 'train', label: '@train' },
    { id: 'office', label: '@office' },
  ],
  mode: [
    { id: 'audio-only', label: '@audio-only' },
    { id: 'keyboard', label: '@keyboard' },
    { id: 'short-burst', label: '@short-burst' },
    { id: 'deep-focus', label: '@deep-focus' },
  ],
  priority: [
    { id: 'auto-interview', label: '@auto-interview' },
    { id: 'daily-routine', label: '@daily-routine' },
  ],
}

export const CONTEXTS: Context[] = (Object.keys(RAW_CONTEXTS) as ContextFamily[]).flatMap(
  (family) => RAW_CONTEXTS[family].map((c) => ({ ...c, family })),
)

export const CONTEXTS_BY_FAMILY = RAW_CONTEXTS

export const CONTEXT_BY_ID: Record<string, Context> = Object.fromEntries(
  CONTEXTS.map((c) => [c.id, c]),
)

// ─── INITIAL_TREE — seed shape (nested), flattened on insert ──────────

type SeedNode =
  | { kind: 'task'; title: string; done?: boolean; tags?: string[] }
  | { kind: 'group'; title: string; expanded?: boolean; children: SeedNode[] }

export const INITIAL_TREE: SeedNode[] = [
  {
    kind: 'group', title: 'DX Engineer Roadmap', expanded: true,
    children: [
      {
        kind: 'group', title: 'Phase 0 · Apply & Outreach', expanded: true,
        children: [
          { kind: 'task', title: 'Decline 100 design offers in Keigo',         done: false, tags: ['dx', 'home', 'keyboard', 'short-burst'] },
          { kind: 'task', title: 'Build resume v.D — Software/DX hybrid',      done: false, tags: ['dx', 'fullstack', 'home', 'keyboard', 'deep-focus'] },
          { kind: 'task', title: 'Clean GH app, deploy demos',                 done: false, tags: ['dx', 'fullstack', 'home', 'deep-focus'] },
          { kind: 'task', title: 'Pick which 5 from 30+',                      done: true,  tags: ['dx', 'home'] },
          { kind: 'task', title: 'Update READMEs',                             done: false, tags: ['dx', 'fullstack', 'home'] },
          { kind: 'task', title: 'Deploy live demos',                          done: false, tags: ['dx', 'fullstack', 'home', 'deep-focus'] },
        ],
      },
      {
        kind: 'group', title: 'Phase 1 · Land bridge job', expanded: false,
        children: [
          { kind: 'task', title: 'Map the bridge-role market — 20 listings',   done: false, tags: ['dx', 'home', 'short-burst'] },
          { kind: 'task', title: 'Draft cold-outreach template v2',            done: false, tags: ['dx', 'home', 'keyboard'] },
        ],
      },
    ],
  },
  {
    kind: 'group', title: 'Languages', expanded: true,
    children: [
      { kind: 'task', title: 'Chinese HSK-1, 5 words today',                   done: true,  tags: ['lang', 'train', 'audio-only', 'short-burst', 'daily-routine'] },
      { kind: 'task', title: 'Japanese N1 listening practice',                 done: false, tags: ['lang', 'train', 'audio-only'] },
      { kind: 'task', title: 'Chinese conversation Excel update',              done: false, tags: ['lang', 'home', 'keyboard'] },
    ],
  },
  {
    kind: 'group', title: 'Visa renewal · 1 item', expanded: false,
    children: [
      { kind: 'task', title: 'Book consulate appointment',                     done: false, tags: ['visa', 'home', 'auto-interview'] },
    ],
  },
  {
    kind: 'group', title: 'Food', expanded: true,
    children: [
      { kind: 'task', title: 'Meal prep · 3 lunches for the week',             done: false, tags: ['food', 'home', 'short-burst', 'daily-routine'] },
      { kind: 'task', title: 'Grocery run — veg, protein, oats',               done: false, tags: ['food', 'home'] },
      { kind: 'task', title: 'Try the ramen recipe I bookmarked',              done: false, tags: ['food', 'home', 'deep-focus'] },
      { kind: 'task', title: 'Drink 2L water · all day',                       done: true,  tags: ['food', 'daily-routine'] },
    ],
  },
  {
    kind: 'group', title: 'Exercise', expanded: true,
    children: [
      { kind: 'task', title: '30-min easy run',                                done: false, tags: ['exercise', 'daily-routine'] },
      { kind: 'task', title: 'Upper-body session · push/pull',                 done: true,  tags: ['exercise', 'short-burst'] },
      { kind: 'task', title: 'Evening stretch · 10 min',                       done: false, tags: ['exercise', 'home', 'daily-routine'] },
    ],
  },
  {
    kind: 'group', title: 'Sleep', expanded: true,
    children: [
      { kind: 'task', title: 'Lights out by 11 pm',                            done: false, tags: ['sleep', 'home', 'daily-routine'] },
      { kind: 'task', title: 'No screens after 10 pm',                         done: false, tags: ['sleep', 'home', 'daily-routine'] },
      { kind: 'task', title: 'Read 15 min before bed',                         done: false, tags: ['sleep', 'home', 'short-burst'] },
    ],
  },
  {
    kind: 'group', title: 'Fashion', expanded: true,
    children: [
      { kind: 'task', title: 'Iron shirts for the week',                       done: false, tags: ['fashion', 'home', 'short-burst'] },
      { kind: 'task', title: "Plan tomorrow's outfit",                         done: false, tags: ['fashion', 'home'] },
      { kind: 'task', title: 'Donate unused clothes',                          done: false, tags: ['fashion', 'home', 'deep-focus'] },
    ],
  },
]

// ─── INITIAL_LOG (mirrored from data.jsx) ─────────────────────────────
// Stored shape: `notes` holds the free-text title since the new schema
// doesn't carry a dedicated title column on roadmap_daily_logs.

export const INITIAL_LOG: LogInsert[] = [
  { notes: 'Chinese HSK-1, 5 new words', context: 'train', duration_minutes: 15 },
  { notes: 'Pick 5 apps from GitHub',     context: 'home',  duration_minutes: 30 },
]

// ─── seedIfEmpty ─────────────────────────────────────────────────────

export type SeedResult = { seeded: boolean; inserted: number }

export type FullSeedResult = {
  tasks: SeedResult
  logs: SeedResult
}

export async function seedIfEmpty(supabase: SupabaseClient): Promise<FullSeedResult> {
  const [tasks, logs] = await Promise.all([
    seedTasksIfEmpty(supabase),
    seedLogsIfEmpty(supabase),
  ])
  return { tasks, logs }
}

export async function seedTasksIfEmpty(supabase: SupabaseClient): Promise<SeedResult> {
  const { count, error: countError } = await supabase
    .from('roadmap_tasks')
    .select('id', { count: 'exact', head: true })

  if (countError) throw countError
  if ((count ?? 0) > 0) return { seeded: false, inserted: 0 }

  const rows = flattenForInsert(INITIAL_TREE)
  const { error: insertError } = await supabase.from('roadmap_tasks').insert(rows)
  if (insertError) throw insertError
  return { seeded: true, inserted: rows.length }
}

export async function seedLogsIfEmpty(supabase: SupabaseClient): Promise<SeedResult> {
  const { count, error: countError } = await supabase
    .from('roadmap_daily_logs')
    .select('id', { count: 'exact', head: true })

  if (countError) throw countError
  if ((count ?? 0) > 0) return { seeded: false, inserted: 0 }

  const { error: insertError } = await supabase
    .from('roadmap_daily_logs')
    .insert(INITIAL_LOG)
  if (insertError) throw insertError
  return { seeded: true, inserted: INITIAL_LOG.length }
}

// Walks the nested tree depth-first, producing flat rows with parent_id
// stitched via pre-generated UUIDs. Position is index within parent.
function flattenForInsert(tree: SeedNode[]): (TaskInsert & { id: string })[] {
  const rows: (TaskInsert & { id: string })[] = []
  function walk(nodes: SeedNode[], parentId: string | null) {
    nodes.forEach((node, idx) => {
      const id = crypto.randomUUID()
      if (node.kind === 'group') {
        rows.push({
          id,
          parent_id: parentId,
          title: node.title,
          kind: 'group',
          position: idx,
          expanded: node.expanded ?? true,
          tags: [],
        })
        walk(node.children, id)
      } else {
        rows.push({
          id,
          parent_id: parentId,
          title: node.title,
          kind: 'task',
          done: node.done ?? false,
          position: idx,
          tags: node.tags ?? [],
        })
      }
    })
  }
  walk(tree, null)
  return rows
}
