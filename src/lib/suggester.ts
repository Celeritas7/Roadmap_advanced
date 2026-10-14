// V2-Q — NEW FILE src/lib/suggester.ts — "the one task for right now".
// Rules live in window.RmHub (guess / score / pick / say / nextTone / isMiss);
// this file owns only the loop and Roadmap's PRIVATE log (roadmap_suggestions).
// Runs in the leader tab, only while Roadmap is open — the banner tells the
// other apps so when nothing is current.
import { supabase } from './supabase.ts'
import { dayKey, prevDayKey } from './dailyReset.ts'
import * as sessionSync from '../store/studySessions.ts'
import { activeRoleIds, effectiveRoleId } from '../store/selectors.ts'
import { addrKey, hubAddrOf, hubInstance, hubPlaces, hubTags, hubWhere, levelOfProject, projectOfRow, refreshTags, rmIdOf, tagAddr } from './rmHub.ts'
import type { AkBanner, Device, Energy, PlaceSource, RmHubInstance, SuggestCtx, SuggestTask, WfAddr } from '../types.ts'
import type { useStore } from '../store/useStore.ts'

type Store = typeof useStore

const UNTIL_MIN = 90
const CHECKIN_TTL = 3 * 3600_000
const TICK_MS = 60_000
const K_CHECKIN = 'rm-ak-checkin'
const K_DEVICE = 'rm-ak-device'
const K_PLACE = 'rm-ak-place'
const K_PLACE_AT = 'rm-ak-place-at'
const PICK_TTL = 2 * 3600_000          // R033 (a): a manual pick wins for 2 h
const STALE_VISIT_MS = 30 * 60_000     // R033 (c): a visit that ended < 30 min ago
const WHERE_MAX_AGE = 5 * 60_000       // a whereNow() read older than this (tab was hidden) is ignored
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
  if (v === 'anywhere' || v === 'auto' || !list.length) return v   // places not loaded yet: keep the pick
  const hit = list.find((p) => p.id === v) ?? hubInstance()?.hub.matchPlace(list, v) ?? list.find((p) => p.class === v)
  const id = hit ? hit.id : 'anywhere'
  if (id !== v) localStorage.setItem(K_PLACE, id)   // also clears a retired pick
  return id
}
/** 'auto' clears the override (the hub decides again). Anything else, 'anywhere' included, is a timed pick. */
export function savePlace(id: string) {
  if (id === 'auto') {
    localStorage.removeItem(K_PLACE)
    localStorage.removeItem(K_PLACE_AT)
  } else {
    localStorage.setItem(K_PLACE, id)
    localStorage.setItem(K_PLACE_AT, String(Date.now()))
  }
  bump()
  void tick()
}
/** The manual pick ('anywhere' or a place id), if made in the last 2 h; else null. Picks without a time (pre-R033) count as old. */
export function pickedPlace(): string | null {
  const id = readPlace()
  if (id === 'auto') return null
  const at = Number(localStorage.getItem(K_PLACE_AT) || 0)
  return Date.now() - at < PICK_TTL ? id : null
}

// R033 · ctx.place, in order: (a) a fresh manual pick → (b) whereNow()[0] →
// (c) the newest visit, stale: ended < 30 min ago, or still open (until null,
// aged from since) → (d) 'anywhere'. Empty whereNow() means unknown, never "away".
// `open` = (c) on a visit with no until.
export type ResolvedPlace = { cls: string; label: string; src: PlaceSource; at: number | null; open?: boolean }
export function resolvePlace(): ResolvedPlace {
  const pick = pickedPlace()
  if (pick) {
    const at = Number(localStorage.getItem(K_PLACE_AT))
    if (pick === 'anywhere') return { cls: 'anywhere', label: 'anywhere', src: 'pick', at }
    const p = hubPlaces().find((x) => x.id === pick)
    return { cls: p?.class ?? 'anywhere', label: p?.label ?? pick, src: 'pick', at }
  }
  const w = hubWhere()
  const now = Date.now()
  if (now - w.at < WHERE_MAX_AGE) {   // a read this old is no read: the tab was in the background
    const r = w.now[0]   // newest first; two devices may report one stop — take the newest, no dedupe
    if (r) return { cls: r.class, label: r.place_label ?? r.anchor_label ?? r.class, src: 'hub', at: Date.parse(r.last_seen_at) }
    const v = w.visits[0]
    if (v) {
      const label = v.place_label ?? v.anchor_label ?? v.class
      if (!v.until) return { cls: v.class, label, src: 'stale', at: Date.parse(v.since), open: true }
      const ended = Date.parse(v.until)
      if (now - ended < STALE_VISIT_MS) return { cls: v.class, label, src: 'stale', at: ended }
    }
  }
  return { cls: 'anywhere', label: 'anywhere', src: 'none', at: null }
}

function buildCtx(): SuggestCtx {
  const s = store!.getState()
  const d = new Date()
  const c = readCheckin()
  const pl = resolvePlace()
  return {
    hour: d.getHours(),
    weekend: d.getDay() === 0 || d.getDay() === 6,
    energy: c?.energy ?? 'mid',
    mood: c?.mood ?? '',
    device: readDevice(),
    place: pl.cls,
    activeRole: effectiveRoleId(activeRoleIds(s.now, s.settings?.role_overrides ?? {}), s.selectedRole),
    place_src: pl.src,
    place_age_min: pl.at == null ? null : Math.max(0, Math.round((d.getTime() - pl.at) / 60_000)),
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

// ── The log ────────────────────────────────────────────────────────────
async function latestRow(): Promise<SuggestionRow | null> {
  const { data, error } = await supabase.from('roadmap_suggestions').select(COLS).order('made_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as SuggestionRow | null
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
    const now = Date.now()
    let prev = await latestRow()
    if (prev && isLive(prev, now)) { latest = prev; return }
    if (prev && !prev.answer && !prev.done_at && prev.missed == null) {
      // `until` passed with no answer → a miss.
      const { error } = await supabase.from('roadmap_suggestions').update({ missed: true }).eq('id', prev.id).is('answered_at', null)
      if (error) throw error
      prev = { ...prev, missed: true }
    }
    const ctx = buildCtx()
    // Don't hand straight back the task that was just skipped or missed.
    const avoid = prev && (prev.missed || prev.answer === 'skip') ? addrKey(prev.task) : null
    const t = window.RmHub.pick(candidates().filter((c) => addrKey(c.addr) !== avoid), ctx)
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
    const until = new Date(now + UNTIL_MIN * 60_000).toISOString()
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
