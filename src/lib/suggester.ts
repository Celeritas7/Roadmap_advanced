// V2-Q — NEW FILE src/lib/suggester.ts — "the one task for right now".
// Rules live in window.RmHub (guess / score / pick / say / nextTone / isMiss);
// this file owns only the loop and Roadmap's PRIVATE log (roadmap_suggestions).
// Runs in the leader tab, only while Roadmap is open — the banner tells the
// other apps so when nothing is current.
import { supabase } from './supabase.ts'
import { dayKey, prevDayKey } from './dailyReset.ts'
import * as sessionSync from '../store/studySessions.ts'
import { activeRoleIds, effectiveRoleId } from '../store/selectors.ts'
import { categoryOf, lockedSlots, rotate, type Served } from './rotation.ts'
import { addrKey, hubAddrOf, hubInstance, hubPlaces, hubTags, levelOfProject, projectOfRow, refreshTags, rmIdOf, tagAddr } from './rmHub.ts'
import type { AkBanner, Device, Energy, RmHubInstance, SuggestCtx, SuggestTask, WfAddr } from '../types.ts'
import type { useStore } from '../store/useStore.ts'

type Store = typeof useStore

const UNTIL_MIN = 90
const CHECKIN_TTL = 3 * 3600_000
const TICK_MS = 60_000
const K_CHECKIN = 'rm-ak-checkin'
const K_DEVICE = 'rm-ak-device'
const K_PLACE = 'rm-ak-place'
const K_STUCK = 'rm-ak-stuck'
const COLS = 'id, task, rm_task_id, title, level, ctx, tone_step, say, made_at, until, answer, reason, answer_app, answered_at, missed, done_at'

export type SuggestionRow = {
  id: string
  task: WfAddr
  rm_task_id: string | null
  title: string
  level: string | null
  ctx: SuggestCtx
  tone_step: number
  say: string
  made_at: string
  until: string
  answer: string | null
  reason: string | null
  answer_app: string | null
  answered_at: string | null
  missed: boolean | null
  done_at: string | null
}

let store: Store | null = null
let hub: RmHubInstance | null = null
let banner: AkBanner | null = null
let timer: number | undefined
let busy = false
let latest: SuggestionRow | null = null
let served: Served[] = []   // refreshed each tick; read by doableNow()

const bump = () => store?.setState({ hubRev: store.getState().hubRev + 1 })

// ── Context inputs (device-local) ──────────────────────────────────────
export type Checkin = { energy: Energy; mood: string; at: number }
export function readCheckin(): Checkin | null {
  try { return JSON.parse(localStorage.getItem(K_CHECKIN) || 'null') as Checkin | null } catch { return null }
}
/** The 3×3 grid is asked only when the last check-in is older than 3 h. */
export const needsCheckin = () => {
  const c = readCheckin()
  return !c || Date.now() - c.at > CHECKIN_TTL
}
export function saveCheckin(energy: Energy, mood: string) {
  localStorage.setItem(K_CHECKIN, JSON.stringify({ energy, mood, at: Date.now() }))
  bump()
  void tick()
}
export function clearCheckin() { localStorage.removeItem(K_CHECKIN); bump() }

export function readDevice(): Device {
  const d = localStorage.getItem(K_DEVICE)
  if (d === 'phone' || d === 'laptop' || d === 'either') return d
  return matchMedia('(pointer: coarse)').matches ? 'phone' : 'laptop'
}
export function saveDevice(d: Device) { localStorage.setItem(K_DEVICE, d); bump() }
// R023: manual pick from the hub's places() until R018 (GPS) lands.
// Stored value is a place id. Pre-R023 it was an enum word ('transit'):
// resolve by id → alias/label → class, else 'anywhere'; write the id back.
export function readPlace(): string {
  const v = localStorage.getItem(K_PLACE) || 'anywhere'
  const list = hubPlaces()
  if (v === 'anywhere' || !list.length) return v   // places not loaded yet: keep the pick
  const hit = list.find((p) => p.id === v) ?? hubInstance()?.hub.matchPlace(list, v) ?? list.find((p) => p.class === v)
  const id = hit ? hit.id : 'anywhere'
  if (id !== v) localStorage.setItem(K_PLACE, id)   // also clears a retired pick
  return id
}
export function savePlace(id: string) { localStorage.setItem(K_PLACE, id); bump(); void tick() }
export const placeClassOf = (id: string): string =>
  id === 'anywhere' ? 'anywhere' : hubPlaces().find((p) => p.id === id)?.class ?? 'anywhere'

// Stuck / delayed / travelling: a fixed window of spare time. While it runs,
// only tasks whose effort fits the minutes left are offered, and any of them —
// low priority included — may lead when nothing else can be done.
export type Stuck = { minutes: number; since: number; until: number }
export function readStuck(): Stuck | null {
  try {
    const s = JSON.parse(localStorage.getItem(K_STUCK) || 'null') as Stuck | null
    return s && s.until > Date.now() ? s : null
  } catch { return null }
}
export function saveStuck(minutes: number | null) {
  if (minutes) {
    const now = Date.now()
    localStorage.setItem(K_STUCK, JSON.stringify({ minutes, since: now, until: now + minutes * 60_000 }))
  } else localStorage.removeItem(K_STUCK)
  bump()
  void tick()
}
const EFFORT_MIN: Record<string, number> = { quick: 10, medium: 30, deep: 60 }
const fits = (t: SuggestTask, s: Stuck | null) =>
  !s || (EFFORT_MIN[t.effort ?? 'medium'] ?? 30) <= (s.until - Date.now()) / 60_000

function buildCtx(): SuggestCtx {
  const s = store!.getState()
  const d = new Date()
  const c = readCheckin()
  return {
    hour: d.getHours(),
    weekend: d.getDay() === 0 || d.getDay() === 6,
    energy: c?.energy ?? 'mid',
    mood: c?.mood ?? '',
    device: readDevice(),
    place: placeClassOf(readPlace()),
    activeRole: effectiveRoleId(activeRoleIds(s.now, s.settings?.role_overrides ?? {}), s.selectedRole),
  }
}

function candidates(): SuggestTask[] {
  const tree = store!.getState().tree
  const out: SuggestTask[] = []
  for (const r of hubTags()) {
    const tagA = tagAddr(r)
    const rmId = rmIdOf(tagA)
    const row = rmId ? tree.find((t) => t.id === rmId) : undefined
    if (!row || !rmId) continue
    const addr = hubAddrOf(rmId) ?? tagA
    out.push({
      addr, rmId, title: row.title, done: row.done,
      parked: row.tags.includes('parked'), deleted: row.tags.includes('orphaned'),
      ctx: r.ctx ?? [], urg: r.urg, dl: r.dl, type: r.type, effort: r.effort, place_class: r.place_class ?? null,
      level: r.level ?? levelOfProject(projectOfRow(row, addr)),
    })
  }
  return out
}

// Everything doable here and now, best first: the rotation's slot, then tasks
// that keep today's one-slot-per-category, then the rest. The tail is what
// lets a low-priority task lead when nothing ahead of it can be done.
function ranked(pool: SuggestTask[], ctx: SuggestCtx): SuggestTask[] {
  const score = window.RmHub.score
  const stuck = readStuck()
  const doable = pool.filter((t) => score(t, ctx) > -Infinity && fits(t, stuck))
  const turn = new Set(rotate(doable, ctx, served, score))
  const locks = lockedSlots(served)
  const keepsLock = (t: SuggestTask) => {
    const k = locks.get(categoryOf(t.addr.item_key))
    return !k || k === t.addr.item_key
  }
  const tier = (t: SuggestTask) => (turn.has(t) ? 0 : keepsLock(t) ? 1 : 2)
  return doable.sort((a, b) => tier(a) - tier(b) || score(b, ctx) - score(a, ctx))
}

/** Home's "doable here" list. Uses the history from the last pick. */
export function doableNow(limit = 5): SuggestTask[] {
  if (!store || !window.RmHub) return []
  return ranked(candidates(), buildCtx()).slice(0, limit)
}

// ── The log ────────────────────────────────────────────────────────────
async function latestRow(): Promise<SuggestionRow | null> {
  const { data, error } = await supabase.from('roadmap_suggestions').select(COLS).order('made_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as SuggestionRow | null
}
// Fair-rotation input: when each WF item was last started or done.
const SERVED_DAYS = 120
async function servedHistory(): Promise<Served[]> {
  const { data, error } = await supabase
    .from('roadmap_suggestions')
    .select('task, answered_at, done_at')
    .or('answer.eq.start,done_at.not.is.null')
    .gte('made_at', new Date(Date.now() - SERVED_DAYS * 86_400_000).toISOString())
  if (error) throw error
  const out: Served[] = []
  for (const r of (data ?? []) as { task: WfAddr; answered_at: string | null; done_at: string | null }[]) {
    const at = r.done_at ?? r.answered_at
    if (at) out.push({ task: r.task, at })
  }
  return out
}

// Live = not missed, not done, unanswered or started, and `until` not passed.
const isLive = (r: SuggestionRow, now: number) =>
  !r.missed && !r.done_at && (!r.answer || r.answer === 'start') && Date.parse(r.until) > now

export function openSuggestionFor(key: string): string | null {
  return latest && isLive(latest, Date.now()) && addrKey(latest.task) === key ? latest.id : null
}

// ── The loop ───────────────────────────────────────────────────────────
export async function tick(): Promise<void> {
  if (!hub || busy) return
  busy = true
  try {
    await refreshTags()
    served = await servedHistory()
    const now = Date.now()
    let prev = await latestRow()
    if (prev && isLive(prev, now)) {
      // A stuck window opened after this suggestion and it doesn't fit the
      // time left: replace it. Not a miss, so the tone doesn't rise.
      const stuck = readStuck()
      const cur = stuck && !prev.answer && Date.parse(prev.made_at) < stuck.since
        ? candidates().find((c) => addrKey(c.addr) === addrKey(prev!.task))
        : undefined
      if (!cur || fits(cur, stuck)) { latest = prev; return }
      const answeredAt = new Date().toISOString()
      const { error } = await supabase
        .from('roadmap_suggestions')
        .update({ answer: 'skip', reason: 'not enough time', answered_at: answeredAt, missed: false })
        .eq('id', prev.id)
        .is('answered_at', null)
      if (error) throw error
      prev = { ...prev, answer: 'skip', reason: 'not enough time', answered_at: answeredAt, missed: false }
    }
    if (prev && !prev.answer && !prev.done_at && prev.missed == null) {
      // `until` passed with no answer → a miss.
      const { error } = await supabase.from('roadmap_suggestions').update({ missed: true }).eq('id', prev.id).is('answered_at', null)
      if (error) throw error
      prev = { ...prev, missed: true }
    }
    const ctx = buildCtx()
    // Don't hand straight back the task that was just skipped or missed.
    const avoid = prev && (prev.missed || prev.answer === 'skip') ? addrKey(prev.task) : null
    const t = ranked(candidates().filter((c) => addrKey(c.addr) !== avoid), ctx)[0] ?? null
    if (!t) {
      latest = null
      await hub.clearSuggestion()
      await banner?.refresh()
      return
    }
    // Tone: +1 per miss, reset on done, frozen while energy is low.
    // A night miss doesn't raise the tone (STEP2 point 10).
    const step = prev ? window.RmHub.nextToneAt(prev.tone_step, { missed: !!prev.missed, done: !!prev.done_at, energy: ctx.energy }, ctx.hour) : 0
    const id = `sg-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const stuck = readStuck()
    const until = new Date(Math.min(now + UNTIL_MIN * 60_000, stuck?.until ?? Infinity)).toISOString()
    const say = window.RmHub.say(t.title, step, ctx.energy, ctx.hour)
    const { data, error } = await supabase
      .from('roadmap_suggestions')
      .insert({ id, task: t.addr, rm_task_id: t.rmId, title: t.title, level: t.level ?? null, ctx, tone_step: step, say, until })
      .select(COLS)
      .single()
    if (error) throw error
    latest = data as SuggestionRow
    await hub.suggest({ id, task: t.addr, title: t.title, level: t.level ?? null, say, toneStep: step, until })
    await banner?.refresh()
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.warn('[ak] suggest', err.code, err.message)
  } finally {
    busy = false
    bump()
  }
}

/** suggestion.answered from any app's banner (including Roadmap's own). */
export async function onAnswer(p: Record<string, unknown>, fromApp: string, seq: number | null): Promise<void> {
  const sid = String(p.suggestion_id ?? '')
  const action = String(p.action ?? '')
  const reason = typeof p.reason === 'string' && p.reason.trim() ? p.reason.trim() : null
  if (!sid || !action) throw new Error('suggestion.answered without suggestion_id/action')   // malformed → rejected

  const { error: le } = await supabase
    .from('roadmap_suggestion_answers')
    .upsert({ seq, suggestion_id: sid, from_app: fromApp, action, reason, answered_at_app: p.at ?? null }, { onConflict: 'user_id,seq', ignoreDuplicates: true })
  if (le) throw le
  // (seq null = answered on Roadmap's own banner; NULLs don't collide on the unique key)

  const { data, error } = await supabase.from('roadmap_suggestions').select(COLS).eq('id', sid).maybeSingle()
  if (error) throw error
  const row = data as SuggestionRow | null
  if (!row || row.answered_at) return   // unknown id, or a later answer from another app: logged only

  const missed = window.RmHub.isMiss({ action, reason: reason ?? '' })   // dismiss = miss; skip with a reason = not
  const { error: ue } = await supabase
    .from('roadmap_suggestions')
    .update({ answer: action, reason, answer_app: fromApp, answered_at: new Date().toISOString(), missed })
    .eq('id', sid)
    .is('answered_at', null)
  if (ue) throw ue

  const h = hub ?? hubInstance()   // any tab can publish; only the leader runs the loop
  if (action === 'skip' && reason && h) await h.skip(row.task, reason, sid)
  if (action === 'start' && row.rm_task_id) await sessionSync.startSession(row.rm_task_id)
  if (action !== 'start') void tick()
}

/** WF confirmed a done. Closes the suggestion it answered (tone resets). */
export async function markDone(rmId: string, sid: string | null): Promise<void> {
  const id = sid ?? (latest && latest.rm_task_id === rmId ? latest.id : null)
  if (!id) return
  const { error } = await supabase.from('roadmap_suggestions').update({ done_at: new Date().toISOString() }).eq('id', id).is('done_at', null)
  if (error) console.warn('[ak] markDone', error.message)
  void tick()
}

export function attach(s: Store) { store = s }
export function start(h: RmHubInstance, b: AkBanner) {
  hub = h
  banner = b
  if (timer) return
  void tick()
  timer = window.setInterval(() => void tick(), TICK_MS)
}

// ── Friday review (private) ────────────────────────────────────────────
export type WeekReview = { misses: SuggestionRow[]; skips: SuggestionRow[]; done: number; streak: number }

/** Monday 04:00 local of the logical week containing `d`. */
export function weekStart(d = new Date()): Date {
  const x = new Date(d.getTime() - 4 * 3600_000)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  x.setHours(4, 0, 0, 0)
  return x
}
/** Friday 18:00 local through the weekend. */
export function reviewDue(d = new Date()): boolean {
  const dow = d.getDay()
  return (dow === 5 && d.getHours() >= 18) || dow === 6 || dow === 0
}

export async function weekReview(): Promise<WeekReview> {
  const { data, error } = await supabase.from('roadmap_suggestions').select(COLS).gte('made_at', weekStart().toISOString()).order('made_at')
  if (error) throw error
  const rows = (data ?? []) as SuggestionRow[]
  // Streak: consecutive logical days, ending today or yesterday, with ≥1 suggestion done.
  const { data: d2, error: e2 } = await supabase
    .from('roadmap_suggestions')
    .select('done_at')
    .not('done_at', 'is', null)
    .gte('done_at', new Date(Date.now() - 60 * 86_400_000).toISOString())
  if (e2) throw e2
  const days = new Set(((d2 ?? []) as { done_at: string }[]).map((r) => dayKey(new Date(r.done_at))))
  let cur = days.has(dayKey()) ? dayKey() : prevDayKey(dayKey())
  let streak = 0
  while (days.has(cur)) { streak++; cur = prevDayKey(cur) }
  return {
    misses: rows.filter((r) => r.missed),
    skips: rows.filter((r) => r.answer === 'skip' && !r.missed),
    done: rows.filter((r) => r.done_at).length,
    streak,
  }
}
