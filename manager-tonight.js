// StreamBox — «¿Qué veo esta noche?» y «Se va pronto».
// Elige entre lo que ya tienes guardado cruzando el tiempo que tienes, el ánimo, con quién lo ves,
// la duración (de «Info»), tus estrellas, las notas de tu web afín, lo que ya has visto (el diario)
// y lo que está a punto de irse de su plataforma.

let leavingCache = {};
async function loadLeaving() { leavingCache = (await chrome.storage.local.get('leaving')).leaving || {}; return leavingCache; }
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.leaving) leavingCache = ch.leaving.newValue || {}; });
loadLeaving();
const leavingOf = k => { const v = leavingCache[k]; return v && v.at && SB.daysLeft(v.at) >= 0 ? v.at : 0; };

const MOODS = [
  { id: 'any', ico: '🎲', label: 'Lo que sea', cats: [] },
  { id: 'reir', ico: '😂', label: 'Reír', cats: ['comedia', 'animacion', 'infantil'] },
  { id: 'tension', ico: '😱', label: 'Tensión', cats: ['thriller', 'terror', 'crimen', 'accion', 'belica'] },
  { id: 'emocion', ico: '🥹', label: 'Emocionarme', cats: ['drama', 'romance', 'musical'] },
  { id: 'evadirme', ico: '🚀', label: 'Evadirme', cats: ['fantasia', 'cifi', 'aventura', 'anime', 'animacion'] },
  { id: 'aprender', ico: '🧠', label: 'Aprender', cats: ['documental', 'historica', 'deportes'] },
];
const WHO = [
  { id: 'solo', ico: '🙋', label: 'Solo' },
  { id: 'pareja', ico: '💑', label: 'En pareja', boost: ['romance', 'comedia', 'drama', 'thriller'] },
  { id: 'amigos', ico: '🍕', label: 'Con amigos', boost: ['comedia', 'terror', 'accion', 'aventura'] },
  { id: 'familia', ico: '👨‍👩‍👧', label: 'En familia', need: ['infantil', 'animacion', 'aventura', 'comedia', 'fantasia', 'musical'], avoid: ['terror', 'thriller', 'crimen', 'belica'] },
];
const TIMES = [[30, '30 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [0, 'Sin prisa']];
const KINDS = [['', 'Me da igual'], ['movie', 'Peli'], ['series', 'Serie']];
const runtimeTxt = m => m >= 60 ? T('{0} h {1} min', Math.floor(m / 60), m % 60).replace(/ 0 min$/, '') : T('{0} min', m);

function watchedMinutes(hist) {
  const out = {}, recent = {};
  const since = ymd(new Date(Date.now() - 30 * 864e5));
  for (const [d, day] of Object.entries(hist.days)) for (const [k, v] of Object.entries(day)) {
    out[k] = (out[k] || 0) + (v.m || 0);
    if (d >= since) recent[k] = (recent[k] || 0) + (v.m || 0);
  }
  return { total: out, recent };
}

function scoreTitles(prefs, hist, exclude = new Set()) {
  const mood = MOODS.find(m => m.id === prefs.mood) || MOODS[0];
  const who = WHO.find(w => w.id === prefs.who) || WHO[0];
  const wm = watchedMinutes(hist);
  const doneInQueue = new Set(state.queue.items.filter(i => i.done).map(i => i.k));
  const inLists = new Set(state.lists.flatMap(l => l.items.map(i => i.k)));
  const out = [];
  for (const t of Object.values(state.titles)) {
    if (!inLists.has(t.key) || exclude.has(t.key)) continue;
    if ((state.settings.platforms || {})[t.platform] === false) continue;
    if (prefs.kind && t.type && t.type !== prefs.kind) continue;
    const info = infoCache[t.key] || {};
    const run = +info.runtime || 0;
    const cats = t.cats || [];
    const isSeries = t.type === 'series';
    const seen = wm.total[t.key] || 0;
    // Pelis ya vistas fuera (se dan por vistas con más de la mitad de su duración, o hora y media sin saberla)
    if (!isSeries && (doneInQueue.has(t.key) || seen >= (run ? run * 0.6 : 60))) continue;
    if (who.need && !cats.some(c => who.need.includes(c))) continue;
    if (who.avoid && cats.some(c => who.avoid.includes(c))) continue;
    let s = 0;
    const why = [];
    // Ánimo
    if (mood.cats.length) {
      const hit = cats.find(c => mood.cats.includes(c));
      if (hit) { s += 3; const cc = SB.CATS.find(x => x.id === hit); if (cc) why.push(cc.icon + ' ' + T(cc.label)); }
      else s -= cats.length ? 2 : 0.5;
    }
    if (who.boost && cats.some(c => who.boost.includes(c))) s += 1;
    // Tiempo
    if (prefs.time && run) {
      if (!isSeries) { if (run > prefs.time + 10) s -= 6; else { s += 1.2; why.push('⏱ ' + runtimeTxt(run)); } }
      else { const n = Math.floor((prefs.time + 5) / run); if (n < 1) s -= 4; else { s += 1; why.push('⏱ ' + TN(n, 'Te cabe {0} episodio', 'Te caben {0} episodios')); } }
    } else if (run) why.push('⏱ ' + runtimeTxt(run) + (isSeries ? ' · ' + T('por episodio') : ''));
    // Tus estrellas y las notas de tu web afín
    if (t.rating) { s += (t.rating - 3) * 1.5; why.push('★'.repeat(t.rating)); }
    const aff = affinityScore(t);
    if (aff >= 0) { s += (aff - 6) * 0.9; const src = SOURCES.find(x => x.id === (state.settings.tasteSource || 'fa')) || SOURCES[0]; if (aff >= 7) why.push('👍 ' + src.name + ' ' + (Math.round(aff * 10) / 10).toLocaleString(T.locale())); }
    // Lo que se va pronto, primero
    const lv = leavingOf(t.key);
    if (lv && SB.daysLeft(lv) <= 14) { s += 2.5; why.push('⏳ ' + (SB.daysLeft(lv) <= 1 ? T('Se va mañana') : T('Se va en {0} días', SB.daysLeft(lv)))); }
    // Lo que opinan los demás en tus listas compartidas (sobre todo si no lo ves solo)
    const oa = typeof othersAvg === 'function' ? othersAvg(t.key) : null;
    if (oa) { s += (oa.avg - 3) * (who.id === 'solo' ? 0.6 : 1.4); if (oa.avg >= 4) why.push('👥 ' + T('Al grupo le gusta ({0})', oa.avg.toLocaleString(T.locale(), { maximumFractionDigits: 1 }))); }
    // Series a medias: seguir con ellas
    if (isSeries && wm.recent[t.key]) { s += 1.5; why.push('▶ ' + T('La estás viendo')); }
    s += Math.random() * 1.4;
    out.push({ t, s, why });
  }
  return out.sort((a, b) => b.s - a.s);
}

function chipGroup(label, opts, value, onPick) {
  return h('div', { class: 'tn-group' }, h('span', { class: 'tn-lab' }, label),
    h('div', { class: 'chips' }, opts.map(o => h('button', { class: 'chip' + (o.id === value ? ' on' : ''), onclick: () => onPick(o.id) }, (o.ico ? o.ico + ' ' : '') + T(o.label)))));
}

async function renderTonight(main) {
  main.append(h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico' }, SB.svgEl('palomitas', 24, '#fff')), T('¿Qué veo esta noche?')));
  const [hist] = await Promise.all([loadHistory(), loadLeaving(), loadInfoCache()]);
  if (!main.isConnected) return;
  const p = ui.tonight || (ui.tonight = { time: 90, mood: 'any', who: 'solo', kind: '', shown: [] });
  const redraw = () => render();
  main.append(h('div', { class: 'card tn-card' },
    chipGroup(T('¿Cuánto tiempo tienes?'), TIMES.map(([v, l]) => ({ id: v, label: l })), p.time, v => { p.time = v; redraw(); }),
    chipGroup(T('¿Qué te apetece?'), MOODS, p.mood, v => { p.mood = v; redraw(); }),
    chipGroup(T('¿Con quién?'), WHO, p.who, v => { p.who = v; redraw(); }),
    chipGroup(T('¿Peli o serie?'), KINDS.map(([v, l]) => ({ id: v, label: l })), p.kind, v => { p.kind = v; redraw(); }),
    h('div', { class: 'tn-go' }, h('button', { class: 'primary big', onclick: () => propose(false) }, '🎲 ' + T('Proponme algo')))));
  const res = h('div', { class: 'tn-res' });
  main.append(res);

  async function propose(more) {
    // Para acertar con la duración y las notas hace falta la «Info» de los candidatos: se busca la que falte
    const inLists = new Set(state.lists.flatMap(l => l.items.map(i => i.k)));
    const missing = Object.values(state.titles).filter(t => inLists.has(t.key) && !infoCache[t.key]).slice(0, 15);
    if (missing.length) {
      const msg = h('div', { class: 'tinfo-load' }, h('span', { class: 'spin' }), T('Buscando duración y notas de {0} títulos…', missing.length));
      res.replaceChildren(msg);
      await fetchInfoFor(missing, (i, n) => { msg.lastChild.textContent = T('Buscando duración y notas… {0} de {1}', i, n); });
    }
    if (!more) p.shown = [];
    const list = scoreTitles(p, hist, new Set(p.shown));
    const picks = list.slice(0, 3);
    p.shown.push(...picks.map(x => x.t.key));
    if (!picks.length) {
      res.replaceChildren(h('div', { class: 'empty' }, p.shown.length && more ? T('No me quedan más ideas con estas condiciones. Prueba a cambiar algo.') : T('No encuentro nada que encaje entre lo que tienes guardado. Prueba con más tiempo, otro ánimo o «Lo que sea».')));
      return;
    }
    res.replaceChildren(h('div', { class: 'tn-picks' }, picks.map((x, i) => pickCard(x, i))),
      h('div', { class: 'tn-more' }, h('button', { class: 'secondary', onclick: () => propose(true) }, '🔄 ' + T('Otras ideas'))));
  }
  if (p.shown && p.shown.length) propose(false);

  // ---------- Se va pronto ----------
  const soon = Object.values(state.titles).map(t => ({ t, at: leavingOf(t.key) })).filter(x => x.at && SB.daysLeft(x.at) <= 30).sort((a, b) => a.at - b.at);
  const sec = h('div', { class: 'tn-leaving' }, h('div', { class: 'section-head' }, h('h3', {}, '⏳ ' + T('Se va pronto')),
    h('button', { class: 'secondary', onclick: async e => { e.target.disabled = true; e.target.textContent = T('Comprobando…'); await chrome.runtime.sendMessage({ type: 'leavingCheck' }).catch(() => {}); await loadLeaving(); render(); } }, '⟳ ' + T('Comprobar fechas'))));
  if (!soon.length) sec.append(h('p', { class: 'muted' }, T('Nada de lo que tienes guardado se va en los próximos 30 días (que se sepa). StreamBox lo mira cada pocos días en Netflix, Prime Video y Movistar Plus+, y en cualquier plataforma cuando abres la ficha y lo indica.')));
  else sec.append(h('div', { class: 'qlist' }, soon.map(x => leavingRow(x.t, x.at))));
  main.append(sec);
}

function pickCard(x, i) {
  const t = x.t;
  const info = infoCache[t.key] || {};
  const q = SB.inQueue(state, t.key);
  return h('div', { class: 'tn-pick', style: '--pc:' + platColor(t.platform) + ';animation-delay:' + i * 80 + 'ms' },
    h('a', { class: 'tn-poster', href: SB.playUrl(t), target: '_blank', rel: 'noopener' },
      t.img ? h('img', { src: t.img, alt: '', referrerpolicy: 'no-referrer' }) : h('div', { class: 'tph' }, h('span', {}, t.title)),
      h('span', { class: 'tn-badge' }, SB.platformBadge(t.platform, true))),
    h('div', { class: 'tn-body' },
      h('b', { class: 'tn-title' }, t.title || t.pid),
      h('small', { class: 'muted' }, [SB.typeLabel(t.type), t.year].filter(Boolean).join(' · ')),
      x.why.length ? h('div', { class: 'tn-why' }, x.why.slice(0, 4).map(w => h('span', {}, w))) : null,
      info.plot ? h('p', { class: 'tn-plot' }, info.plot.replace(/^(Serie de TV|Miniserie de TV)[^.]*\.\s*(\d+ temporadas?[^.]*\.\s*)?/i, '')) : null,
      h('div', { class: 'tn-actions' },
        h('a', { class: 'primary small-btn', href: SB.playUrl(t), target: '_blank', rel: 'noopener' }, '▶ ' + T('Ver ahora')),
        h('button', { class: 'secondary', disabled: q, onclick: async e => { SB.queueAdd(state, t); await persist(['queue', 'titles']); renderSide(); e.target.disabled = true; e.target.textContent = '✓ ' + T('En la cola'); } }, q ? '✓ ' + T('En la cola') : '＋ ' + T('A la cola')))));
}

function leavingRow(t, at) {
  const d = SB.daysLeft(at);
  const info = infoCache[t.key];
  const alt = info && info.where ? info.where.offers.filter(o => o.platform !== t.platform) : null;
  const altBox = h('div', { class: 'tn-alt' });
  const drawAlt = r => {
    const others = r && r.where ? r.where.offers.filter(o => o.platform !== t.platform) : [];
    altBox.replaceChildren(others.length ? h('span', {}, T('También en:') + ' ', ...others.slice(0, 4).map(o => h('a', { href: o.link || r.where.url, target: '_blank', rel: 'noopener', class: 'where-it' + (o.platform ? '' : ' other') }, o.platform && SB_PLATFORMS[o.platform] ? SB.platformBadge(o.platform, true) : null, o.name)))
      : h('span', { class: 'muted' }, r && r.where ? T('No está en ninguna otra plataforma de suscripción.') : ''));
  };
  if (alt) drawAlt(info);
  else altBox.append(h('button', { class: 'linkish', onclick: async e => { e.target.textContent = T('Buscando…'); const r = await titleInfo(t.key); drawAlt(r); } }, T('¿Dónde más está?')));
  return h('div', { class: 'qrow tn-lrow' + (d <= 3 ? ' urgent' : '') },
    h('a', { class: 'qthumb', href: SB.playUrl(t), target: '_blank', rel: 'noopener' }, t.img ? h('img', { src: t.img, alt: '', referrerpolicy: 'no-referrer' }) : h('div', { class: 'tph' }, h('span', {}, t.title))),
    h('div', { class: 'qinfo' },
      h('a', { class: 'tname', href: SB.playUrl(t), target: '_blank', rel: 'noopener' }, t.title || t.pid),
      h('small', {}, SB.platformBadge(t.platform, true), ' ', d <= 0 ? T('Hoy es el último día') : d === 1 ? T('Mañana es el último día') : T('Último día: {0} · quedan {1} días', new Date(at).toLocaleDateString(T.locale(), { day: 'numeric', month: 'long' }), d)),
      altBox),
    h('a', { class: 'primary small-btn', href: SB.playUrl(t), target: '_blank', rel: 'noopener' }, '▶ ' + T('Ver')));
}
