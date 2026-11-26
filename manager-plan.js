// StreamBox — Maratones (episodios por día hasta una fecha), Suscripciones (cuánto te cuesta y qué
// conviene tener activo cada mes) y Marcadores (momentos guardados desde el reproductor).

// ---------- Utilidades ----------
const todayYmd = () => ymd(new Date());
const daysBetween = (a, b) => Math.round((fromYmd(b) - fromYmd(a)) / 864e5);
const money = v => new Intl.NumberFormat(T.locale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v || 0);
// Episodios que trae la sinopsis de FilmAffinity («Serie de TV (2019-2026). 5 temporadas. 40 episodios»)
const totalEpisodes = k => { const p = (infoCache[k] || {}).plot || ''; const m = p.match(/(\d+)\s+episodios/i); return m ? +m[1] : 0; };
// Episodios distintos vistos de un título desde una fecha (según el diario)
function episodesSeen(hist, k, from, to) {
  const ids = new Set();
  for (const [d, day] of Object.entries(hist.days)) {
    if ((from && d < from) || (to && d > to) || !day[k]) continue;
    (day[k].eps || []).forEach(e => ids.add(e));
    if (!(day[k].eps || []).length && day[k].m >= 15) ids.add(d + ':' + k); // sin id de episodio: un episodio por día con algo visto
  }
  return ids.size;
}

// =====================================================================
// Maratones
// =====================================================================
async function loadMarathons() { return (await chrome.storage.local.get('marathons')).marathons || {}; }
async function saveMarathons(m) { await chrome.storage.local.set({ marathons: m }); }
function marathonStatus(m, hist, k) {
  const today = todayYmd();
  const seen = episodesSeen(hist, k, m.start);
  const seenToday = episodesSeen(hist, k, today, today);
  const left = Math.max(0, m.total - seen);
  const daysLeft = Math.max(1, daysBetween(today, m.until) + 1);
  const leftBeforeToday = Math.max(0, m.total - (seen - seenToday));
  const quotaToday = Math.ceil(leftBeforeToday / daysLeft);
  const todo = Math.max(0, quotaToday - seenToday);
  // Lo que «tocaba» llevar visto a día de hoy si se reparte por igual
  const span = Math.max(1, daysBetween(m.start, m.until) + 1);
  const elapsed = Math.min(span, daysBetween(m.start, today) + 1);
  const expected = Math.round(m.total * elapsed / span);
  return { seen, seenToday, left, daysLeft, quotaToday, todo, diff: seen - expected, done: left === 0, late: today > m.until && left > 0 };
}
async function marathonSection(main) {
  const hist = await loadHistory();
  const ms = await loadMarathons();
  const keys = Object.keys(ms).filter(k => state.titles[k]);
  const box = h('div', { class: 'card mara' }, h('div', { class: 'section-head', style: 'margin:0 0 10px' }, h('h3', { style: 'margin:0' }, '🏃 ' + T('Maratones')),
    h('button', { class: 'secondary', onclick: () => marathonForm(box) }, '＋ ' + T('Nuevo maratón'))));
  box.append(h('p', { class: 'muted small', style: 'margin:0 0 10px' }, T('Elige una serie y hasta cuándo quieres terminarla: StreamBox reparte los episodios por días, lleva la cuenta con lo que ves y cada día te pone en la cola los que tocan.')));
  if (!keys.length) box.append(h('p', { class: 'muted' }, T('No tienes ningún maratón en marcha.')));
  for (const k of keys) {
    const m = ms[k], t = state.titles[k], st = marathonStatus(m, hist, k);
    const pct = Math.round(Math.min(1, st.seen / Math.max(1, m.total)) * 100);
    const state_ = st.done ? '🏁 ' + T('¡Terminado!') : st.late ? '⚠️ ' + T('Se pasó la fecha: te quedan {0}', TN(st.left, '{0} episodio', '{0} episodios'))
      : st.diff >= 1 ? '🚀 ' + T('Vas {0} por delante', TN(st.diff, '{0} episodio', '{0} episodios'))
      : st.diff <= -1 ? '🐢 ' + T('Vas {0} por detrás', TN(-st.diff, '{0} episodio', '{0} episodios')) : '✓ ' + T('Vas al día');
    const row = h('div', { class: 'mara-row' },
      h('div', { class: 'mara-top' }, h('b', {}, t.title), SB.platformBadge(t.platform, true),
        h('span', { class: 'muted small' }, T('hasta el {0}', fromYmd(m.until).toLocaleDateString(T.locale(), { weekday: 'short', day: 'numeric', month: 'short' }))),
        h('span', { class: 'mara-state' }, state_)),
      h('div', { class: 'mara-bar' }, h('span', { style: `width:${pct}%` })),
      h('div', { class: 'mara-foot' },
        h('span', {}, T('{0} de {1} episodios', st.seen, m.total) + ' · ' + (st.done ? '' : st.todo ? T('Hoy te tocan {0}', st.todo) : T('Hoy ya has cumplido'))),
        h('div', { class: 'row', style: 'gap:6px' },
          !st.done && st.todo ? h('button', { class: 'primary small-btn', onclick: async () => {
            // A la cabeza de la cola, con los episodios de hoy, y a verla
            state.queue.items = state.queue.items.filter(i => i.k !== k);
            SB.queueAdd(state, t, st.todo);
            const it = state.queue.items.pop(); const firstPending = state.queue.items.findIndex(i => !i.done);
            state.queue.items.splice(firstPending < 0 ? state.queue.items.length : firstPending, 0, it);
            await persist(['queue', 'titles']); playQueueFromManager();
          } }, '▶ ' + T('Ver los de hoy ({0})', st.todo)) : null,
          h('button', { class: 'icon-btn', title: T('Cambiar'), onclick: () => marathonForm(box, k) }, '✎'),
          h('button', { class: 'icon-btn', title: T('Quitar el maratón'), onclick: async () => { delete ms[k]; await saveMarathons(ms); render(); } }, '✕'))));
    box.append(row);
  }
  main.append(box);
}
function marathonForm(box, editKey) {
  $('.mara-form')?.remove();
  const series = Object.values(state.titles).filter(t => t.type === 'series').sort(cmpTitle);
  if (!series.length) { toastM(T('Guarda primero alguna serie en tus listas.'), true); return; }
  const sel = h('select', { class: 'tv-select' }, series.map(t => h('option', { value: t.key }, t.title)));
  const eps = h('input', { type: 'number', min: '1', max: '999', class: 'num-input' });
  const until = h('input', { type: 'date', class: 'num-input', min: todayYmd() });
  const fill = () => { const n = totalEpisodes(sel.value); if (!editKey && n) eps.value = String(n); };
  sel.onchange = fill;
  loadMarathons().then(ms => {
    if (editKey && ms[editKey]) { sel.value = editKey; sel.disabled = true; eps.value = ms[editKey].total; until.value = ms[editKey].until; }
    else { until.value = ymd(new Date(Date.now() + 6 * 864e5)); fill(); if (!eps.value) eps.value = '8'; }
  });
  const hint = h('small', { class: 'muted' });
  const upd = () => { const d = until.value ? Math.max(1, daysBetween(todayYmd(), until.value) + 1) : 0; hint.textContent = d && +eps.value ? T('≈ {0} al día durante {1}', TN(Math.ceil(+eps.value / d), '{0} episodio', '{0} episodios'), TN(d, '{0} día', '{0} días')) : ''; };
  eps.oninput = upd; until.oninput = upd; setTimeout(upd, 50);
  const form = h('div', { class: 'mara-form' },
    h('label', {}, T('Serie'), sel), h('label', {}, T('Episodios que te quedan'), eps), h('label', {}, T('Terminarla antes del'), until), hint,
    h('div', { class: 'row', style: 'gap:8px' },
      h('button', { class: 'primary', onclick: async () => {
        if (!(+eps.value > 0) || !until.value) return;
        const ms = await loadMarathons();
        const k = editKey || sel.value;
        ms[k] = Object.assign(ms[k] || { start: todayYmd() }, { total: +eps.value, until: until.value });
        await saveMarathons(ms); render();
      } }, editKey ? T('Guardar') : T('Empezar el maratón')),
      h('button', { class: 'secondary', onclick: () => form.remove() }, T('Cancelar'))));
  box.append(form);
}

// =====================================================================
// Suscripciones
// =====================================================================
// Precios orientativos en España (se pueden cambiar)
const SUB_PRICES = { netflix: 13.99, prime: 4.99, disney: 9.99, movistar: 9.99 };
function subsOf() { const s = state.settings.subs || {}; return Object.fromEntries(Object.keys(SB_PLATFORMS).map(p => [p, Object.assign({ on: true, price: SUB_PRICES[p] || 9.99 }, s[p] || {})])); }
// Horas pendientes por plataforma: pelis no vistas y lo que queda de las series
function pendingHours(hist) {
  const wm = watchedMinutes(hist);
  const inLists = new Set(state.lists.flatMap(l => l.items.map(i => i.k)));
  const out = {}, approx = {};
  for (const t of Object.values(state.titles)) {
    if (!inLists.has(t.key)) continue;
    const info = infoCache[t.key] || {};
    const run = +info.runtime || (t.type === 'series' ? 45 : 105);
    let min;
    if (t.type === 'series') {
      const total = totalEpisodes(t.key) || 10;
      const seen = episodesSeen(hist, t.key);
      min = Math.max(0, total - seen) * run;
      if (!totalEpisodes(t.key) || !info.runtime) approx[t.platform] = true;
    } else {
      if ((wm.total[t.key] || 0) >= run * 0.6) continue;
      min = run; if (!info.runtime) approx[t.platform] = true;
    }
    out[t.platform] = (out[t.platform] || 0) + min;
  }
  return { min: out, approx };
}
async function renderSubs(main) {
  main.append(h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico' }, SB.svgEl('dinero', 24, '#fff')), T('Suscripciones')));
  const hist = await loadHistory();
  await loadInfoCache();
  if (!main.isConnected) return;
  main.append(h('p', { class: 'muted', style: 'max-width:820px;margin:-12px 0 20px' },
    T('Cruza lo que tienes pendiente en tus listas con lo que de verdad ves (tu diario) para decirte cuánto te cuesta cada hora y qué plataforma conviene tener activa cada mes. Los precios son orientativos: cámbialos por los tuyos.')));
  const subs = subsOf();
  const since = ymd(new Date(Date.now() - 59 * 864e5));
  const used = summarize(hist, since, '').byPlat;
  const pend = pendingHours(hist);
  const follow = state.follow || {};
  const save = async () => { state.settings.subs = subs; await persist(['settings']); };
  // Ritmo: horas al mes que sueles ver (para el plan); 20 h si aún no hay datos
  const months = Math.max(1, Math.min(6, Object.keys(summarize(hist, '', '').byMonth).length));
  const perMonth = Math.max(8, Math.round((summarize(hist, ymd(new Date(Date.now() - months * 30 * 864e5)), '').min / 60) / months) || 20);
  let monthly = 0;
  // Los consejos según el uso solo valen si el diario ya lleva un tiempo apuntando
  const firstDay = Object.keys(hist.days).sort()[0];
  const histOld = !!firstDay && daysBetween(firstDay, todayYmd()) >= 30;
  if (!histOld) main.append(h('p', { class: 'qnotice', style: 'margin-top:0' }, h('span', { class: 'qn-ico' }, 'i'), h('span', {}, T('Tu diario lleva poco tiempo apuntando lo que ves: los consejos de uso aparecerán cuando tenga al menos un mes de datos.'))));
  const cards = Object.keys(SB_PLATFORMS).map(p => {
    const s = subs[p], ph = (pend.min[p] || 0) / 60, uh = (used[p] || 0) / 60;
    if (s.on) monthly += +s.price || 0;
    const perHour = s.on && uh > 0.2 ? (+s.price * 2) / uh : null;
    const nextShow = Object.entries(follow).filter(([k, r]) => k.startsWith(p + ':') && r.next && r.next > Date.now() && state.titles[k]).sort((a, b) => a[1].next - b[1].next)[0];
    let verdict = '', vcls = '';
    if (!histOld) { if (!s.on && ph >= 6) { verdict = '📅 ' + T('Tienes {0} pendientes: actívala un mes y date un atracón.', hoursTxt(ph * 60)); vcls = 'tip'; } }
    else if (s.on && uh < 2 && ph < 4) { verdict = '💡 ' + T('Apenas la usas y no tienes casi nada pendiente: podrías darte de baja.'); vcls = 'warn'; }
    else if (s.on && uh < 2 && ph >= 4) { verdict = '⏳ ' + T('Tienes {0} pendientes pero llevas 2 meses sin usarla: o le das un empujón o la pausas.', hoursTxt(ph * 60)); vcls = 'warn'; }
    else if (!s.on && ph >= 6) { verdict = '📅 ' + T('Tienes {0} pendientes: actívala un mes y date un atracón.', hoursTxt(ph * 60)); vcls = 'tip'; }
    else if (s.on && perHour != null && perHour < 1) { verdict = '👍 ' + T('Le sacas partido: sale a {0} la hora.', money(perHour)); vcls = 'ok'; }
    if (nextShow) verdict += (verdict ? ' ' : '') + '🔔 ' + T('Estreno de «{0}» el {1}: si no la tienes, actívala ese día.', state.titles[nextShow[0]].title, new Date(nextShow[1].next).toLocaleDateString(T.locale(), { day: 'numeric', month: 'long' }));
    const on = h('input', { type: 'checkbox' }); on.checked = !!s.on;
    on.onchange = async () => { s.on = on.checked; await save(); render(); };
    const price = h('input', { type: 'number', min: '0', step: '0.01', value: String(s.price), class: 'num-input price' });
    price.onchange = async () => { s.price = +price.value || 0; await save(); render(); };
    return h('div', { class: 'card sub-card' + (s.on ? '' : ' off'), style: '--pc:' + platColor(p) },
      h('div', { class: 'sub-head' }, SB.platformBadge(p, true), h('b', {}, platName(p)),
        h('label', { class: 'sub-on' }, on, T('La tengo')), h('label', { class: 'sub-price' }, price, h('span', {}, T('€/mes')))),
      h('div', { class: 'sub-nums' },
        h('div', {}, h('b', {}, (pend.approx[p] ? '≈ ' : '') + hoursTxt(ph * 60)), h('small', {}, T('pendientes en tus listas'))),
        h('div', {}, h('b', {}, hoursTxt(uh * 60)), h('small', {}, T('vistas en 60 días'))),
        h('div', {}, h('b', {}, perHour != null ? money(perHour) : '—'), h('small', {}, T('por hora vista')))),
      verdict ? h('p', { class: 'sub-verdict ' + vcls }, verdict) : null);
  });
  main.append(h('div', { class: 'kpis' },
    kpi(money(monthly), T('al mes'), T('{0} al año', money(monthly * 12))),
    kpi(hoursTxt(Object.values(pend.min).reduce((a, b) => a + b, 0)), T('pendientes en total'), T('A tu ritmo (~{0} al mes)', hoursTxt(perMonth * 60))),
    kpi(hoursTxt(Object.values(used).reduce((a, b) => a + b, 0)), T('vistas en 60 días'), '')));
  main.append(h('div', { class: 'sub-grid' }, cards));
  // Plan de rotación: una plataforma cada mes, empezando por la que más pendiente tienes
  const order = Object.keys(SB_PLATFORMS).map(p => ({ p, h: (pend.min[p] || 0) / 60 })).filter(x => x.h >= 1).sort((a, b) => b.h - a.h);
  if (order.length > 1) {
    const plan = []; let d = new Date(); d.setDate(1);
    for (const x of order) { const n = Math.max(1, Math.ceil(x.h / perMonth)); for (let i = 0; i < n && plan.length < 12; i++) { plan.push({ p: x.p, m: new Date(d) }); d.setMonth(d.getMonth() + 1); } }
    const cost = plan.reduce((a, x) => a + (+subs[x.p].price || 0), 0);
    main.append(h('div', { class: 'card plan-card' }, h('h3', { style: 'margin-top:0' }, '🔁 ' + T('Plan de rotación')),
      h('p', { class: 'muted small' }, T('En vez de pagarlas todas a la vez: una cada mes, empezando por donde más tienes pendiente y a tu ritmo de ~{0} al mes. Te costaría {1} en total frente a {2} con todas activas.', hoursTxt(perMonth * 60), money(cost), money(monthly * plan.length))),
      h('div', { class: 'plan' }, plan.map(x => h('div', { class: 'plan-m', style: '--pc:' + platColor(x.p) },
        h('small', {}, x.m.toLocaleDateString(T.locale(), { month: 'long', year: x.m.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })),
        SB.platformBadge(x.p, true), h('b', {}, platName(x.p)))))));
  }
}

// =====================================================================
// Marcadores
// =====================================================================
async function renderBookmarks(main) {
  main.append(h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico' }, SB.svgEl('marcador', 24, '#fff')), T('Marcadores')));
  main.append(h('p', { class: 'muted', style: 'max-width:820px;margin:-12px 0 20px' },
    T('Momentos que has guardado desde el reproductor (menú de StreamBox → «🔖 Marcar»). Pulsa «Ir» y StreamBox abre el título y salta a ese segundo.')));
  let { bookmarks = [] } = await chrome.storage.local.get('bookmarks');
  if (!main.isConnected) return;
  const q = h('input', { type: 'search', class: 'f-search', placeholder: T('Buscar en tus marcadores…') });
  const list = h('div', { class: 'qlist' });
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    const items = bookmarks.filter(b => !s || ((state.titles[b.key] || {}).title + ' ' + b.note + ' ' + b.label).toLowerCase().includes(s));
    list.replaceChildren(...items.map(b => bookmarkRow(b, async () => { bookmarks = bookmarks.filter(x => x.id !== b.id); await chrome.storage.local.set({ bookmarks }); draw(); }, async note => { b.note = note; await chrome.storage.local.set({ bookmarks }); })));
    if (!items.length) list.append(h('div', { class: 'empty' }, bookmarks.length ? T('Ningún marcador coincide.') : T('Aún no tienes marcadores. Mientras ves algo, abre el menú de StreamBox en el reproductor y pulsa «🔖 Marcar».')));
  };
  q.oninput = draw;
  if (bookmarks.length) main.append(h('div', { class: 'toolbar' }, q));
  main.append(list);
  draw();
}
const fmtSec = sec => { sec = Math.max(0, Math.floor(sec || 0)); const hh = Math.floor(sec / 3600), mm = Math.floor(sec / 60) % 60, ss = sec % 60; return (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0'); };
function bookmarkRow(b, onDelete, onNote) {
  const t = state.titles[b.key] || { title: b.key, platform: b.key.split(':')[0] };
  const note = h('input', { type: 'text', class: 'bm-note', value: b.note || '', placeholder: T('Añade una nota…'), maxlength: '140' });
  note.onchange = () => onNote(note.value.trim());
  const go = async () => {
    await chrome.storage.local.set({ pendingSeek: { id: b.id + ':' + Date.now(), key: b.key, epId: b.epId, t: b.t, note: b.note, at: Date.now() } });
    let url = b.url;
    const p = SBP.get(t.platform);
    if (t.platform === 'prime' && p) url = p.watchUrl(t.pid, t);       // Prime: con «autoplay» para que arranque el vídeo
    if (t.platform === 'movistar') url = SB.playUrl(t);                  // Movistar: la ficha (se pulsa «Ver» sola si hace falta)
    window.open(url, '_blank');
  };
  return h('div', { class: 'qrow bm-row' },
    h('a', { class: 'qthumb', href: '#', onclick: e => { e.preventDefault(); go(); } }, t.img ? h('img', { src: t.img, alt: '', referrerpolicy: 'no-referrer' }) : h('div', { class: 'tph' }, h('span', {}, t.title)), h('span', { class: 'bm-time' }, fmtSec(b.t))),
    h('div', { class: 'qinfo' },
      h('b', { class: 'tname' }, t.title),
      h('small', {}, SB.platformBadge(t.platform, true), ' ', [b.label && b.label !== t.title ? b.label : '', new Date(b.at).toLocaleDateString(T.locale(), { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')),
      note),
    h('button', { class: 'primary small-btn', onclick: go }, '▶ ' + T('Ir a {0}', fmtSec(b.t))),
    h('button', { class: 'icon-btn', title: T('Borrar'), onclick: onDelete }, '✕'));
}
