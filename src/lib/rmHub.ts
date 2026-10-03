// V2-Q — NEW FILE src/lib/rmHub.ts — Roadmap's wiring to the Akatsuki hub (R022).
// Replaces wfLink.ts + wfConfig.ts. Roadmap no longer reads or writes weekly_focus_*:
//   · WF tasks arrive as task.upsert on the stream → mirrored into roadmap_tasks
//   · ticking a mirror publishes task.done; `done` flips here only on WF's reply
//   · mirrors pair through akatsuki_links (task_links dropped in 0006)
// bootHub() runs once: signed in AND the store has loaded (App.tsx).
import { supabase } from './supabase.ts'
import { dayKey } from './dailyReset.ts'
import { PROJECT_BY_ID, applyVocabContexts } from '../seed.ts'
import * as sync from '../store/sync.ts'
import * as suggester from './suggester.ts'
import type { HubReplyRow, HubTagRow, RmHubInstance, TaskRow, TaskUpdate, WfAddr } from '../types.ts'
import type { useStore } from '../store/useStore.ts'

type Store = typeof useStore

export const BUILD_ID: string = __BUILD_ID__
export const MIRROR_TAG = 'wf'
export const ORPHAN_TAG = 'orphaned'
export const PARKED_TAG = 'parked'

const REPLY_CURSOR = 'rm-ak-reply-seq'
const PENDING_KEY = 'rm-ak-pending-done'
// [ak] logging is debug-only; warnings and errors always log.
const dbg: (...a: unknown[]) => void = import.meta.env.DEV ? console.debug.bind(console) : () => {}

let store: Store | null = null
let hub: RmHubInstance | null = null
let booting: Promise<void> | null = null
let tagRows: HubTagRow[] = []
const rmByAddr = new Map<string, string>()   // addrKey → roadmap_tasks.id
const addrByRm = new Map<string, WfAddr>()   // roadmap_tasks.id → WF src_addr, word for word
const lastSeq = new Map<string, number>()

export const addrKey = (a: WfAddr) => `${a.board_id}/${a.item_key}/${a.sub_id}`
export const hubAddrOf = (rmId: string): WfAddr | null => addrByRm.get(rmId) ?? null
export const rmIdOf = (a: WfAddr): string | null => rmByAddr.get(addrKey(a)) ?? null
export const hubInstance = () => hub
export const hubTags = () => tagRows
// akatsuki_task_tags may carry the address as `addr` (jsonb), as three columns,
// or only as `addr_key` "board/item_key/sub". item_key itself may contain '/'
// (study:MEDICINE/Neurology/Elite) — board_id and sub_id never do.
export function tagAddr(r: HubTagRow): WfAddr {
  if (r.addr) return r.addr
  if (r.board_id && r.sub_id) return { board_id: String(r.board_id), item_key: String(r.item_key ?? ''), sub_id: String(r.sub_id) }
  const parts = String(r.addr_key ?? '').split('/')
  return { board_id: parts[0] ?? '', item_key: parts.slice(1, -1).join('/'), sub_id: parts[parts.length - 1] ?? '' }
}

const get = () => store!.getState()
function remember(addr: WfAddr, rmId: string) {
  rmByAddr.set(addrKey(addr), rmId)
  addrByRm.set(rmId, addr)
}
function patchTree(row: TaskRow) {
  const tree = get().tree
  store!.setState({ tree: tree.some((t) => t.id === row.id) ? tree.map((t) => (t.id === row.id ? row : t)) : [...tree, row] })
}

// R022: project from the item_key prefix. study: → lang · app: / office: → dx.
export const projectOfItemKey = (itemKey: string): string => (itemKey.split(':')[0] === 'study' ? 'lang' : 'dx')
export function projectOfRow(row: TaskRow | undefined, addr: WfAddr): string {
  return row?.tags.find((t) => t !== MIRROR_TAG && PROJECT_BY_ID[t]) ?? projectOfItemKey(addr.item_key)
}
// attackers → attacker, midplayers → midplayer, defenders → defender
export function levelOfProject(project: string): string | null {
  const role = PROJECT_BY_ID[project]?.role
  return (role && window.RmHub.LEVEL_OF_ROLE[role]) || null
}

// ── Mirrors ─────────────────────────────────────────────────────────────
async function folderFor(project: string): Promise<string> {
  const label = PROJECT_BY_ID[project]?.label ?? project
  const tops = get().tree.filter((r) => r.kind === 'group' && r.parent_id === null)
  const hit = tops
    .filter((r) => r.tags.includes(project) || r.title.startsWith(label))
    .sort((a, b) => a.position - b.position)[0]
  if (hit) return hit.id
  const row = await sync.insertTask({ parent_id: null, title: label, kind: 'group', position: tops.length, expanded: true, tags: [project] })
  patchTree(row)
  return row.id
}

function mirrorTags(base: string[], project: string, p: Record<string, unknown>): string[] {
  const rest = base.filter((t) => t !== ORPHAN_TAG && t !== PARKED_TAG && t !== MIRROR_TAG && t !== project)
  const out = [MIRROR_TAG, project, ...rest]
  if (p.del) out.push(ORPHAN_TAG)   // WF deleted it: keep, mark
  if (p.lat) out.push(PARKED_TAG)   // WF parked it: keep, hidden from the suggester
  return out
}

// task.upsert → upsert the mirror, return its id (null when orphaned).
// Title, date and done are WF's; Roadmap never edits them on a mirror.
async function onTask(addr: WfAddr, p: Record<string, unknown>, seq: number): Promise<string | null> {
  const k = addrKey(addr)
  if ((lastSeq.get(k) ?? -1) >= seq) return rmByAddr.get(k) ?? null
  const known = rmByAddr.get(k)
  const row = known ? get().tree.find((t) => t.id === known) : undefined
  const project = projectOfRow(row, addr)
  const title = String(p.t ?? p.title ?? '').trim()
  let id: string | null = null

  if (!row) {
    // Known pair whose row is gone (deleted here before the hub): don't resurrect.
    if (known || p.del) {
      lastSeq.set(k, seq)
      return null
    }
    if (!title) throw new Error('task.upsert without a title')   // malformed → rejected
    const parent = await folderFor(project)
    const created = await sync.insertTask({
      parent_id: parent,
      title,
      kind: 'task',
      position: get().tree.filter((t) => t.parent_id === parent).length,
      done: p.done === true,
      tags: mirrorTags([], project, p),
    })
    patchTree(created)
    remember(addr, created.id)
    id = created.id
  } else {
    const patch: TaskUpdate = {}
    const tags = mirrorTags(row.tags, project, p)
    if (tags.join('|') !== row.tags.join('|')) patch.tags = tags
    if (!p.del) {
      if (title && title !== row.title) patch.title = title
      if (typeof p.done === 'boolean' && p.done !== row.done) patch.done = p.done
    }
    if (Object.keys(patch).length) patchTree(await sync.updateTask(row.id, patch))
    if (p.done === true) clearPending(row.id)
    remember(addr, row.id)
    id = p.del ? null : row.id
  }
  lastSeq.set(k, seq)
  return id
}

async function tagOrphan(rmId: string) {
  const row = get().tree.find((t) => t.id === rmId)
  if (row && !row.tags.includes(ORPHAN_TAG)) patchTree(await sync.updateTask(rmId, { tags: [...row.tags, ORPHAN_TAG] }))
}

// session.completed → the existing roadmap_complete_session logic, from the
// stream instead of the study app calling the RPC.
async function onSession(p: Record<string, unknown>): Promise<void> {
  const taskId = (p.task_id ?? p.taskId) as string | undefined
  if (!taskId) throw new Error('session.completed without task_id')
  const { error } = await supabase.rpc('roadmap_complete_session', {
    p_task_id: taskId,
    p_source: String(p.source ?? p.app ?? 'stream'),
    p_day_key: String(p.day_key ?? dayKey()),
    p_duration: (p.duration_min ?? p.duration ?? null) as number | null,
    p_feedback: (p.feedback ?? {}) as Record<string, unknown>,
    p_verification: String(p.verification ?? 'app'),
  })
  if (error) throw error
  void get().refreshSessions()
}

// ── task.done round trip ────────────────────────────────────────────────
type Pending = Record<string, { key: string; seq: number | null; sid: string | null; at: number }>
const readPending = (): Pending => {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}') as Pending } catch { return {} }
}
function writePending(p: Pending) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(p))
  store?.setState({ pendingDone: Object.keys(p) })
}
function clearPending(rmId: string) {
  const p = readPending()
  if (p[rmId]) { delete p[rmId]; writePending(p) }
}

/** Ticking a WF mirror. Publishes task.done; does NOT flip done — the reply does. */
export async function tickMirror(rmId: string): Promise<void> {
  if (!hub) throw new Error('Not connected to the hub yet — try again in a moment.')
  const addr = addrByRm.get(rmId)
  if (!addr || readPending()[rmId]) return
  const sid = suggester.openSuggestionFor(addrKey(addr))
  const r = await hub.done(addr, sid)   // contract errors throw — shown, never retried
  dbg('[ak] task.done', addrKey(addr), r.status, r.seq)
  if (r.status === 'closed') {
    // WF already answered today's request — final (STEP2 adapter). The only way
    // here: WF applied it earlier today, then un-ticked it (task.upsert set the
    // mirror back to open). The hub takes one done per task per logical day, so
    // DON'T flip the box — WF's truth is "not done". Say so.
    const st = (r.reply as { status?: string } | undefined)?.status
    if (st === 'unknown' || st === 'stale') await tagOrphan(rmId)   // adapter orphaned the link already
    else store!.setState({ error: 'Weekly Focus already recorded this task done today and won\u2019t take a second one — tick it in Weekly Focus.' })
    return
  }
  writePending({ ...readPending(), [rmId]: { key: addrKey(addr), seq: r.seq ?? null, sid, at: Date.now() } })
  void pollReplies()
}

let polling = false
/** WF's replies to done/skip, paged on reply_seq. Max seen is the cursor. */
export async function pollReplies(): Promise<void> {
  if (!hub || polling) return
  polling = true
  try {
    const since = Number(localStorage.getItem(REPLY_CURSOR) || 0)
    const rows = (await hub.wfReplies(since)).sort((a, b) => a.reply_seq - b.reply_seq)
    let max = since
    for (const r of rows) {
      await applyReply(r)
      max = Math.max(max, r.reply_seq || 0)
    }
    if (max > since) localStorage.setItem(REPLY_CURSOR, String(max))
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.warn('[ak] replies', err.code, err.message)
  } finally {
    polling = false
  }
}

async function applyReply(r: HubReplyRow) {
  const status = r.reply?.status
  const rmId = r.src_addr ? rmIdOf(r.src_addr) : null
  if (!rmId || !status) return
  if (r.kind === 'task.done') {
    if (status === 'applied' || status === 'already') {
      const row = get().tree.find((t) => t.id === rmId)
      if (row && !row.done) patchTree(await sync.updateTask(rmId, { done: true }))
      clearPending(rmId)
      await suggester.markDone(rmId, (r.payload?.suggestion_id as string | null | undefined) ?? null)
    } else if (status === 'unknown') {
      await tagOrphan(rmId)   // the adapter has already orphaned the link
      clearPending(rmId)
    } else if (status === 'stale') {
      clearPending(rmId)
      store!.setState({ error: 'Weekly Focus changed that task since — check it there.' })
    }
  } else if (r.kind === 'task.skipped' && status === 'unknown') {
    await tagOrphan(rmId)
  }
}

// ── Tags (akatsuki_task_tags) ──────────────────────────────────────────
// Roadmap's half: type + effort guessed ONCE, level from the project's role.
async function writeGuesses() {
  for (const r of tagRows) {
    if (r.type && r.effort && r.level) continue
    const addr = tagAddr(r)
    const rmId = rmIdOf(addr)
    const row = rmId ? get().tree.find((t) => t.id === rmId) : undefined
    if (!row) continue
    const g = window.RmHub.guess({ title: row.title, ctx: r.ctx ?? [] })
    const v = { type: r.type ?? g.type, effort: r.effort ?? g.effort, level: r.level ?? levelOfProject(projectOfRow(row, addr)), guessed: r.guessed ?? true }
    try {
      await hub!.tag(hubAddrOf(rmId!) ?? addr, v)
      Object.assign(r, v)
    } catch (e) {
      console.warn('[ak] tag', (e as Error).message)
    }
  }
}

export async function refreshTags(): Promise<void> {
  if (!hub) return
  tagRows = await hub.tags()
  await writeGuesses()
}

/** A user correction. Writes guessed:false so the guess never overwrites it. */
export async function correctTag(addr: WfAddr, patch: { type?: string; effort?: string }): Promise<void> {
  if (!hub) return
  const r = tagRows.find((x) => addrKey(tagAddr(x)) === addrKey(addr))
  const rmId = rmIdOf(addr)
  const row = rmId ? get().tree.find((t) => t.id === rmId) : undefined
  const next = {
    type: patch.type ?? r?.type ?? null,
    effort: patch.effort ?? r?.effort ?? null,
    level: r?.level ?? levelOfProject(projectOfRow(row, addr)),
    guessed: false,
  }
  await hub.tag(addr, next)
  if (r) Object.assign(r, next)
  store!.setState({ hubRev: get().hubRev + 1 })
}

// ── Boot ────────────────────────────────────────────────────────────────

// One consumer per device: two tabs consuming the same pending row would both
// insert a mirror (the Sep 21 duplicate-folder bug, again). Other tabs wait
// for the lock and take over when the leader closes.
function asLeader(fn: () => void) {
  if (!('locks' in navigator)) { fn(); return }
  void navigator.locks.request('rm-ak-leader', () => { fn(); return new Promise<void>(() => {}) })
}

export function bootHub(s: Store): Promise<void> {
  if (booting) return booting
  store = s
  s.setState({ hubState: 'booting', hubError: null })
  booting = (async () => {
    if (typeof window.RmHub !== 'function' || typeof window.AkatsukiBanner !== 'function') {
      throw Object.assign(new Error('Hub scripts not loaded — check public/akatsuki/ and index.html'), { code: 'AK300' })
    }
    dbg('[ak] rm build', BUILD_ID)
    hub = window.RmHub(supabase, { onTask, onAnswer: suggester.onAnswer, onSession, log: dbg })
    // Roadmap's own banner calls onAnswer directly instead of publishing to itself.
    // No seq for those — the log row takes null (0006 made seq nullable).
    const banner = window.AkatsukiBanner(supabase, 'rm', {
      log: dbg,
      onAnswer: (p, from) => suggester.onAnswer(p, from, null),
    })
    window.rm = { supabase, hub, banner, build: BUILD_ID }

    const vocab = await hub.loadVocab()
    applyVocabContexts(vocab.context)
    for (const l of await hub.links()) if (l.rmId) remember(l.wf, l.rmId)
    tagRows = await hub.tags()
    await writeGuesses()
    dbg('[ak] links', rmByAddr.size, '· tags', tagRows.length)

    suggester.attach(s)
    s.setState({ hubState: 'live', hubRev: get().hubRev + 1, pendingDone: Object.keys(readPending()) })
    banner.start()
    asLeader(() => {
      suggester.start(hub!, banner)   // before hub.start(): the first consume may deliver an answer at once
      hub!.start()
    })
    void pollReplies()
    window.setInterval(() => { if (Object.keys(readPending()).length) void pollReplies() }, 15_000)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void pollReplies() })
  })().catch((e: { code?: string; message?: string }) => {
    booting = null
    console.error('[ak] boot failed', e?.code, e?.message)
    s.setState({ hubState: 'error', hubError: String(e?.message ?? e) })
  })
  return booting
}
