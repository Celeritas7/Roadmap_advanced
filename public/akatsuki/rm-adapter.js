/* rm-adapter.js — Roadmap's side of the hub.  R022 · Oct 3
 *
 * Classic script.  Lives in public/akatsuki/ next to akatsuki-client.js; loaded from
 * index.html BEFORE the Vite module:
 *   <script src="/akatsuki/akatsuki-client.js"></script>
 *   <script src="/akatsuki/rm-adapter.js"></script>
 * Then, after sign-in and after tasks + links have loaded:
 *   window.rm = { hub: RmHub(supabase, { onTask, onAnswer, onSession, log }) }
 *   rm.hub.start()
 *
 * Rules kept here so the app can't break them:
 *   · WF owns tasks.  Roadmap never writes weekly_focus_*.  done → task.done, skip → task.skipped, WF applies.
 *   · A mirror is found through akatsuki_links (a=wf, b=rm).  No WF id on a roadmap_tasks row.
 *   · Publish on real change only.  put() diff-gates against what was last read.
 *   · Enums come from akatsuki_vocab.  Nothing below hardcodes a list except as a fallback.
 */
(function () {
  const APP = 'rm';
  const addrKey = (a) => `${a.board_id}/${a.item_key}/${a.sub_id}`;
  const dayKey = (d = new Date()) => { const x = new Date(d.getTime() - 4 * 3600e3); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };  // LOCAL date, 4 AM reset (R022 step-1 point 1)
  const stable = (o) => JSON.stringify(o, Object.keys(o || {}).sort());

  function RmHub(supabase, opts = {}) {
    const log = opts.log || (() => {});
    const hub = window.Akatsuki(supabase, APP, { log });
    const lastPut = new Map();   // doc/path/key → stable(value) — the diff gate
    let vocab = null, stop = null;

    async function loadVocab() {
      const { data, error } = await supabase.from('akatsuki_vocab').select('ns,id,schema,meta').in('ns', ['enum', 'context']);
      if (error) throw new Error(error.message);
      vocab = { enum: {}, context: [] };
      for (const r of data) { if (r.ns === 'enum') vocab.enum[r.id] = r.schema?.values || []; else vocab.context.push({ id: r.id, ...r.meta }); }
      return vocab;
    }

    async function put(doc, path, key, value) {
      const k = `${doc}/${path}/${key}`, v = stable(value);
      if (lastPut.get(k) === v) return false;
      await hub.put(doc, path, key, value); lastPut.set(k, v); return true;
    }

    const api = {
      hub, addrKey, dayKey,
      vocab: () => vocab,
      enums: (id) => (vocab && vocab.enum[id]) || [],

      /** Pairs wf addr ↔ roadmap_tasks.id.  Call on load; pass the result to the store. */
      async links() {
        const { data, error } = await supabase.from('akatsuki_links').select('a_addr,b_addr,orphaned_at,seq')
          .match({ a_app: 'wf', b_app: APP }).order('seq');
        if (error) throw new Error(error.message);
        return data.map(l => ({ wf: l.a_addr, rmId: l.b_addr && l.b_addr.id, orphaned: !!l.orphaned_at }));
      },

      /** The shared tag store (view).  WF's ctx/urg/dl + Roadmap's type/effort/level, one row per WF subtask. */
      async tags() {
        const { data, error } = await supabase.from('akatsuki_task_tags').select('*');
        if (error) throw new Error(error.message);
        for (const r of data) if (r.type || r.effort || r.level) lastPut.set(`task_tags/rm/${r.addr_key}`, stable({ type: r.type, effort: r.effort, level: r.level, guessed: r.guessed }));
        return data;
      },
      /** Roadmap's half of a task's tags.  guessed=false once the user corrected it. */
      tag(addr, { type, effort, level, guessed = true }) { return put('task_tags', 'rm', addrKey(addr), { type, effort, level, guessed }); },

      /** The one task for right now.  Every connected app's banner reads this row. */
      suggest(s) {
        const v = { id: s.id, task: s.task, title: s.title, level: s.level, say: s.say, tone_step: s.toneStep || 0,
                    until: s.until, made_at: new Date().toISOString() };
        return put('roadmap_now', 'suggestion', '', v);
      },
      clearSuggestion() { lastPut.delete('roadmap_now/suggestion/'); return hub.remove('roadmap_now', 'suggestion', ''); },

      /** WF applies.  One per task per logical day.  status 'closed' = WF already answered today: final, do not re-send;
       *  read result.reply.status (applied|already = done; unknown|stale = origin gone → orphan the mirror). */
      async done(addr, suggestionId) {
        const r = await hub.publish({ to: 'wf', kind: 'task.done', addr, key: `rm:done:${addrKey(addr)}:${dayKey()}`,
          payload: { ...addr, at: new Date().toISOString(), suggestion_id: suggestionId || null } });
        if (r.status === 'closed' && r.reply && (r.reply.status === 'unknown' || r.reply.status === 'stale')) await hub.orphan(addr).catch(() => {});
        return r;
      },
      /** WF parks it.  The reason stays in Roadmap — it is NOT in the payload WF stores, only validated here. */
      skip(addr, reason, suggestionId) {
        if (!reason || !reason.trim()) throw Object.assign(new Error('skip needs a reason — an empty one is a miss, not a skip'), { code: 'AK300' });
        return hub.publish({ to: 'wf', kind: 'task.skipped', addr, key: `rm:skip:${addrKey(addr)}:${suggestionId}`,
          payload: { ...addr, reason: reason.trim(), at: new Date().toISOString(), suggestion_id: suggestionId } });
      },
      /** WF's answers to done/skip.  status: applied | already | unknown | stale.  unknown → orphan the mirror. */
      async wfReplies(since = 0) {
        const rows = [...await hub.replies('task.done', since), ...await hub.replies('task.skipped', since)];
        for (const r of rows) if (r.reply && r.reply.status === 'unknown') await hub.orphan(r.src_addr).catch(() => {});
        return rows;
      },

      /** Consume: WF tasks in, banner answers in, jlpt sessions in.  Returns stop().
       *  A callback may return { defer: 'reason' } — passed through, the row stays pending (R017). */
      start(ms = 15000) {
        if (stop) return stop;
        const passDefer = (v) => (v && typeof v === 'object' && v.defer) ? v : null;
        stop = hub.listen({
          'task.upsert': async (r) => {
            // r.payload: WF's subtask as published; r.src_addr: {board_id,item_key,sub_id}
            if (!opts.onTask) return { defer: 'store not ready' };
            const out = await opts.onTask(r.src_addr, r.payload, r.seq);   // → roadmap_tasks.id | null (orphaned) | { defer }
            if (passDefer(out)) return out;
            if (r.payload.del) { await hub.orphan(r.src_addr).catch(() => {}); }
            return out ? { addr: { id: out } } : {};
          },
          'suggestion.answered': async (r) => {
            if (!opts.onAnswer) return { defer: 'store not ready' };
            const out = await opts.onAnswer(r.payload, r.from_app, r.seq);   // log it; action=skip → api.skip(addr, reason, id)
            return passDefer(out) || {};
          },
          'session.completed': async (r) => {
            if (!opts.onSession) return { defer: 'store not ready' };
            const out = await opts.onSession(r.payload, r.seq); return passDefer(out) || {};
          }
        }, ms);
        return stop;
      },
      stop() { if (stop) stop(); stop = null; },
      loadVocab
    };
    return api;
  }

  /* ── The suggester, as pure helpers.  The app owns the loop; these keep the rules in one place. ──
   * ctx = { hour, weekend, energy: low|mid|high, mood, device: phone|laptop|either, place, activeRole }
   * task = a row of akatsuki_task_tags joined with the mirror (level, project role) */
  const LEVEL_OF_ROLE = { attackers: 'attacker', midplayers: 'midplayer', defenders: 'defender' };
  const PLACE_OF_CTX = { '@home': 'home', '@office': 'office', '@train': 'transit' };
  const DEVICE_OF_CTX = { '@phone-only': 'phone', '@keyboard': 'laptop', '@needs-claude-code': 'laptop' };

  function guess(task) {   // Roadmap's half, from title + WF ctx.  guessed:true until the user corrects.
    const t = (task.title || '').toLowerCase(), ctx = task.ctx || [];
    const type = /prompt|write|draft|essay|doc/.test(t) ? 'writing' : /screenshot|collect|capture/.test(t) ? 'screenshots'
               : /review|check|read/.test(t) ? (/read/.test(t) ? 'reading' : 'review') : /code|fix|build|deploy|bug/.test(t) ? 'coding'
               : /buy|pick up|post|bank|form|renew|book/.test(t) ? (/buy|pick up|post/.test(t) ? 'errand' : 'admin') : /practice|drill|study/.test(t) ? 'practice' : 'admin';
    const effort = ctx.includes('@short-burst') ? 'quick' : ctx.includes('@deep-focus') || ctx.includes('@deep-work') ? 'deep' : 'medium';
    return { type, effort, guessed: true };
  }
  function deviceOf(task) { for (const c of task.ctx || []) if (DEVICE_OF_CTX[c]) return DEVICE_OF_CTX[c]; return 'either'; }
  function placeOf(task)  { for (const c of task.ctx || []) if (PLACE_OF_CTX[c])  return PLACE_OF_CTX[c];  return 'anywhere'; }

  function score(task, ctx) {
    if (task.done || task.deleted || task.parked) return -Infinity;
    const dev = deviceOf(task), pl = placeOf(task);
    if (dev !== 'either' && ctx.device !== 'either' && dev !== ctx.device) return -Infinity;      // hard: can't do it on this device
    if (pl !== 'anywhere' && ctx.place !== 'anywhere' && pl !== ctx.place) return -Infinity;     // hard: wrong place
    let s = 10;
    if (task.urg === true) s += 6;                                                                  // WF urg is a boolean (A7)
    if (task.dl) { const days = (Date.parse(task.dl) - Date.now()) / 864e5; s += days < 1 ? 8 : days < 3 ? 4 : 0; }
    if (ctx.weekend && ctx.place === 'cafe' && task.type === 'writing') s += 5;
    if (!ctx.weekend && ctx.hour < 10 && ctx.place === 'transit' && dev === 'phone') s += 5;
    if (task.effort === 'deep' && ctx.place === 'transit') s -= 4;
    if (ctx.activeRole && LEVEL_OF_ROLE[ctx.activeRole] === task.level) s += 3;                  // role adds weight, never filters
    const night = isNight(ctx.hour);                                                               // R022 step-1 point 10
    if (night) s *= task.level === 'attacker' ? 0.3 : task.level === 'midplayer' ? 0.6 : 1;
    if (night && task.effort === 'deep') s *= 0.5;
    if (ctx.energy === 'low' && task.level === 'attacker') s *= 0.4;                              // tired: less attacker work, never hidden
    if (ctx.energy === 'high' && task.level === 'attacker') s *= 1.2;
    return s;
  }
  function pick(tasks, ctx) { let best = null, bs = -Infinity; for (const t of tasks) { const s = score(t, ctx); if (s > bs) { bs = s; best = t; } } return best; }

  // Tone: commanding on the surface, caring underneath.  5 steps, reset on a done, paused while tired.
  const SAY = [
    (t) => `Start this now: ${t}.`,
    (t) => `${t}. You skipped the last one — this one, now.`,
    (t) => `Two misses. ${t}. Why did the last one slip? Tell me after.`,
    (t) => `Three. ${t}. I'm keeping count, and I'm asking: what is getting in the way?`,
    (t) => `Four misses. ${t}. Stop. Do this one thing, then tell me what happened.`,
    (t) => `Five. ${t}. I'm not angry at you — I'm angry at the gap between you and your list. Close it.`
  ];
  const SOFT = (t) => `You're running low. One small thing, no rush: ${t}. Then rest.`;
  const NIGHT = (t) => `It's late. If you do one thing, make it small: ${t}. Otherwise sleep — that counts too.`;
  const isNight = (hour) => hour != null && (hour >= 23 || hour < 6);
  function say(title, toneStep, energy, hour) {
    if (isNight(hour)) return NIGHT(title);                                                        // night: no escalation
    return energy === 'low' ? SOFT(title) : SAY[Math.min(5, Math.max(0, toneStep | 0))](title);
  }
  function nextToneAt(step, o, hour) { return isNight(hour) ? step : nextTone(step, o); }
  function nextTone(step, { missed, done, energy }) { if (done) return 0; if (missed && energy !== 'low') return Math.min(5, step + 1); return step; }
  const isMiss = (answer) => !answer || answer.action === 'dismiss' || (answer.action === 'skip' && !(answer.reason || '').trim());

  window.RmHub = Object.assign(RmHub, { guess, score, pick, say, nextTone, nextToneAt, isNight, isMiss, deviceOf, placeOf, LEVEL_OF_ROLE, addrKey, dayKey });
})();
