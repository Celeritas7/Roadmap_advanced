// rmSession.js — Roadmap session reporter (NO-BUILD variant)
// Place at: js/rmSession.js in Japanese_study_app_advanced
//
// This repo is plain ES modules served as static files — there is no Vite and
// no import.meta.env, so config is plain constants below. It is also a
// DIFFERENT Supabase project from Roadmap, so these are Roadmap's URL and key,
// not this app's.
//
// Zero dependencies — one fetch to one RPC. The whole integration surface is
// rmComplete(). If Roadmap's schema changes, the RPC signature absorbs it and
// this file stays put.

// ─── config ───────────────────────────────────────────────────────────
// Roadmap's project (wylxvmkcrexwfpjpbhyy), NOT this app's (ulgrfumbwjovbjzjiems).
const RM_URL = 'https://wylxvmkcrexwfpjpbhyy.supabase.co';
const RM_KEY = 'sb_publishable_e3pDOuxIdstaC7s0a680kQ_R10TrAyv';

// Which app reported the completion. Repo slug.
const RM_SOURCE = 'japanese-study-app-advanced';

// ─── logical day ──────────────────────────────────────────────────────
// Roadmap's day flips at 4 AM local, NOT midnight. This MUST match
// Roadmap's src/lib/dailyReset.ts — if the two ever disagree, a late-night
// session lands on the wrong day and silently breaks the streak.
const RM_RESET_HOUR = 4;

export function rmDayKey(d = new Date()) {
  const s = new Date(d.getTime() - RM_RESET_HOUR * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return `${s.getFullYear()}-${p(s.getMonth() + 1)}-${p(s.getDate())}`;
}

// ─── handshake ────────────────────────────────────────────────────────
// Roadmap launches this app with ?rm_task=<uuid>&rm_day=<YYYY-MM-DD>. The
// params are stashed on first load so they survive the many navigations
// between launch and the results screen — including the full page loads this
// app does for anime-reader.html / script-reader.html.

const KEY = 'rm-handshake';

function readHandshake() {
  try {
    const q = new URLSearchParams(location.search);
    const task = q.get('rm_task');
    if (task) {
      const hs = {
        task,
        day: q.get('rm_day') || rmDayKey(),
        ret: q.get('rm_ret') || null,
        t0: Date.now(),
      };
      sessionStorage.setItem(KEY, JSON.stringify(hs));
      return hs;
    }
    const stored = sessionStorage.getItem(KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// Call once at app start, before anything strips the query string.
export function rmInit() {
  const hs = readHandshake();
  if (hs) console.log('[rmSession] launched from Roadmap, task', hs.task);
  return hs;
}

// True when this page was opened from a Roadmap stop — use it to show a
// "back to Roadmap" affordance if you ever want one.
export function rmIsLaunched() {
  return !!readHandshake();
}

// ─── the one call ─────────────────────────────────────────────────────
// Call when a study session genuinely FINISHES — the results screen, not app
// open and not partial progress. That honesty is the entire value of the
// ledger: the moment this fires on mere opening, "✓ confirmed" in Roadmap
// stops meaning anything.
//
//   rmComplete({ feedback: { words: 12, mode: 'goi' } });
//
// durationMin defaults to time since the app was launched from Roadmap, which
// is a fair proxy for a 5-minute study stop. Pass it explicitly if the app
// ever tracks real elapsed study time.
//
// Never throws, never blocks, returns false harmlessly when the app was
// opened directly rather than launched from Roadmap. A missed report is a
// missing tick in Roadmap, not a broken study app.
export async function rmComplete({ durationMin = null, feedback = {}, taskId = null } = {}) {
  const hs = readHandshake();
  const task = taskId || hs?.task;
  if (!task) return false;
  if (!RM_KEY || RM_KEY === 'PASTE_ROADMAP_ANON_KEY_HERE') {
    console.warn('[rmSession] RM_KEY not set — edit js/rmSession.js');
    return false;
  }

  let mins = durationMin;
  if (mins == null && hs?.t0) {
    mins = Math.max(1, Math.round((Date.now() - hs.t0) / 60000));
  }

  try {
    const res = await fetch(`${RM_URL}/rest/v1/rpc/roadmap_complete_session`, {
      method: 'POST',
      headers: {
        apikey: RM_KEY,
        Authorization: `Bearer ${RM_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_task_id: task,
        p_source: RM_SOURCE,
        // The day the LAUNCH happened — a session started 3:50 AM and
        // finished 4:10 belongs to the day it started.
        p_day_key: hs?.day || rmDayKey(),
        p_duration: mins,
        p_feedback: feedback,
        p_verification: 'app',
      }),
      keepalive: true,
    });
    if (!res.ok) {
      console.warn('[rmSession] report failed', res.status, await res.text());
      return false;
    }
    console.log('[rmSession] reported completion for task', task);
    return true;
  } catch (e) {
    console.warn('[rmSession] report error', e);
    return false;
  }
}

// Optional: send the user back to Roadmap after reporting.
export function rmReturn() {
  const hs = readHandshake();
  if (hs?.ret) location.href = hs.ret;
}
