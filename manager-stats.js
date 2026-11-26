// StreamBox — «Mi diario»: estadísticas de lo que ves, el resumen del año y a qué web se parece tu gusto.
// El diario lo escribe content.js mientras ves algo (minutos por título y día, y los episodios).

let infoCache = {};   // notas guardadas por «Info» (FilmAffinity, IMDb, Rotten Tomatoes), por título
async function loadInfoCache() { infoCache = (await chrome.storage.local.get('info')).info || {}; return infoCache; }
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.info) infoCache = ch.info.newValue || {}; });
loadInfoCache();

const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const fromYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const hoursTxt = min => min >= 60 ? T('{0} h', (Math.round(min / 6) / 10).toLocaleString(T.locale())) : T('{0} min', Math.round(min));
const platName = p => (SB_PLATFORMS[p] || {}).name || p;
const platColor = p => (SB_PLATFORMS[p] || {}).color || '#888';

async function loadHistory() { return (await chrome.storage.local.get('history')).history || { v: 1, days: {}, titles: {} }; }

// Resumen de un periodo: minutos totales, por plataforma, por título, por categoría, por día y por mes
function summarize(hist, from, to) {
  const out = { min: 0, eps: 0, days: 0, byPlat: {}, byTitle: {}, byCat: {}, byDay: {}, byMonth: {}, maxDay: null };
  for (const [d, day] of Object.entries(hist.days)) {
    if ((from && d < from) || (to && d > to)) continue;
    let dm = 0;
    for (const [k, v] of Object.entries(day)) {
      const m = v.m || 0;
      if (!m) continue;
      dm += m;
      const p = k.split(':')[0];
      out.byPlat[p] = (out.byPlat[p] || 0) + m;
      const bt = out.byTitle[k] || (out.byTitle[k] = { min: 0, eps: new Set() });
      bt.min += m; (v.eps || []).forEach(e => bt.eps.add(e));
      const t = state.titles[k] || hist.titles[k] || {};
      const cat = (t.cats || [])[0];
      if (cat) out.byCat[cat] = (out.byCat[cat] || 0) + m;
    }
    if (dm > 0) {
      out.min += dm; out.days++; out.byDay[d] = dm;
      const mo = d.slice(0, 7); out.byMonth[mo] = (out.byMonth[mo] || 0) + dm;
      if (!out.maxDay || dm > out.maxDay.min) out.maxDay = { d, min: dm };
    }
  }
  for (const [k, bt] of Object.entries(out.byTitle)) {
    const t = state.titles[k] || hist.titles[k] || {};
    if (t.type === 'series') out.eps += Math.max(1, bt.eps.size);
  }
  return out;
}
// Rachas de días seguidos viendo algo
function streaks(hist) {
  const days = Object.keys(hist.days).filter(d => Object.values(hist.days[d]).some(v => v.m >= 1)).sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    const cur = fromYmd(d);
    run = prev && Math.round((cur - prev) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = cur;
  }
  // La actual: termina hoy o ayer
  let current = 0;
  if (prev && Math.round((fromYmd(ymd(new Date())) - prev) / 864e5) <= 1) current = run;
  return { best, current };
}
const titleOf = (k, hist) => state.titles[k] || hist.titles[k] || { title: k.split(':')[1], platform: k.split(':')[0] };

// ---------- A qué web se parece tu gusto (correlación de tus estrellas con sus notas) ----------
const SOURCES = [
  { id: 'fa', name: 'FilmAffinity', get: r => r.fa && +r.fa.rating ? +r.fa.rating : null },
  { id: 'imdb', name: 'IMDb', get: r => r.imdb && +r.imdb.rating ? +r.imdb.rating : null },
  { id: 'rtc', name: 'Rotten Tomatoes', sub: 'crítica', get: r => r.rt && r.rt.critics != null ? r.rt.critics : null },
  { id: 'rta', name: 'Rotten Tomatoes', sub: 'público', get: r => r.rt && r.rt.audience != null ? r.rt.audience : null },
];
const srcName = x => x.name + (x.sub ? ' · ' + T(x.sub) : '');
function pearson(pairs) {
  const n = pairs.length;
  if (n < 4) return null;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n, my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
function tasteMatch() {
  const rated = Object.values(state.titles).filter(t => t.rating > 0);
  const res = SOURCES.map(s => {
    const pairs = rated.map(t => [t.rating, infoCache[t.key] ? s.get(infoCache[t.key]) : null]).filter(p => p[1] != null);
    return { ...s, n: pairs.length, r: pearson(pairs) };
  });
  const usable = res.filter(x => x.r != null);
  const best = usable.sort((a, b) => b.r - a.r)[0] || null;
  return { res, best, rated: rated.length, missing: rated.filter(t => !infoCache[t.key]).length };
}
// Para ordenar los pendientes: la nota (0-10) de la fuente que más se parece a ti
function affinityScore(t) {
  const r = infoCache[t.key];
  if (!r) return -1;
  const order = [state.settings.tasteSource, 'fa', 'imdb', 'rta', 'rtc'].filter(Boolean);
  for (const id of order) {
    const s = SOURCES.find(x => x.id === id);
    const v = s && s.get(r);
    if (v != null) return id.startsWith('rt') ? v / 10 : v;
  }
  return -1;
}

// Busca la «Info» de varios títulos, de uno en uno, con un aviso de progreso
async function fetchInfoFor(titles, onStep) {
  let i = 0;
  for (const t of titles) {
    i++;
    try { await titleInfo(t.key); } catch {}
    onStep && onStep(i, titles.length);
  }
  await loadInfoCache();
}

// ---------- Vista ----------
const PERIODS = { month: 'Este mes', d30: 'Últimos 30 días', year: 'Este año', all: 'Desde siempre' };
function periodRange(p) {
  const now = new Date(), today = ymd(now);
  if (p === 'month') return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), today];
  if (p === 'd30') return [ymd(new Date(now - 29 * 864e5)), today];
  if (p === 'year') return [now.getFullYear() + '-01-01', today];
  return ['', ''];
}
async function renderStats(main) {
  main.append(h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico' }, SB.svgEl('grafica', 24, '#fff')), T('Mi diario')));
  const hist = await loadHistory();
  if (!main.isConnected) return;
  main.append(h('p', { class: 'muted', style: 'max-width:820px;margin:-12px 0 20px' },
    T('Lo que has visto, contado por StreamBox mientras reproduces algo en tus plataformas (solo en este navegador; se guarda en la copia de seguridad).')));
  const period = ui.statsPeriod || 'year';
  const [from, to] = periodRange(period);
  const sm = summarize(hist, from, to);
  const st = streaks(hist);
  const thisYear = new Date().getFullYear();
  const hasYear = Object.keys(hist.days).some(d => d.startsWith(thisYear + '-'));
  main.append(h('div', { class: 'toolbar' },
    h('div', { class: 'theme-seg' }, Object.entries(PERIODS).map(([k, label]) => h('button', { class: period === k ? 'on' : '', onclick: () => { ui.statsPeriod = k; render(); } }, T(label)))),
    hasYear ? h('button', { class: 'primary', onclick: () => openWrapped(hist, thisYear) }, '✨ ' + T('Tu resumen de {0}', thisYear)) : null));

  if (!sm.min) {
    main.append(h('div', { class: 'empty' }, Object.keys(hist.days).length
      ? T('No has visto nada en este periodo.')
      : T('Todavía no hay nada en tu diario. Reproduce algo en Netflix, Prime Video, Disney+ o Movistar Plus+ y aparecerá aquí.')));
  } else {
    const titlesN = Object.keys(sm.byTitle).length;
    main.append(h('div', { class: 'kpis' },
      kpi(hoursTxt(sm.min), T('vistas'), sm.min >= 1440 ? T('{0} días seguidos de pantalla', (sm.min / 1440).toFixed(1).replace('.', ',')) : ''),
      kpi(String(titlesN), TN(titlesN, 'título', 'títulos'), sm.eps ? TN(sm.eps, '{0} episodio', '{0} episodios') : ''),
      kpi(String(sm.days), TN(sm.days, 'día con algo visto', 'días con algo visto'), sm.maxDay ? T('Tope: {0} el {1}', hoursTxt(sm.maxDay.min), fromYmd(sm.maxDay.d).toLocaleDateString(T.locale(), { day: 'numeric', month: 'short' })) : ''),
      kpi(String(st.current), TN(st.current, 'día de racha', 'días de racha'), T('Mejor racha: {0}', TN(st.best, '{0} día', '{0} días')))));

    const grid = h('div', { class: 'stats-grid' });
    // Por plataforma
    const plats = Object.entries(sm.byPlat).sort((a, b) => b[1] - a[1]);
    grid.append(statCard(T('Por plataforma'), bars(plats.map(([p, m]) => ({ label: platName(p), value: m, color: platColor(p), txt: hoursTxt(m) })))));
    // Por género
    const cats = Object.entries(sm.byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    grid.append(statCard(T('Por género'), cats.length ? bars(cats.map(([c, m]) => { const cc = SB.CATS.find(x => x.id === c) || { label: c, icon: '' }; return { label: (cc.icon ? cc.icon + ' ' : '') + T(cc.label), value: m, color: 'var(--acc)', txt: hoursTxt(m) }; }))
      : h('p', { class: 'muted' }, T('Sin géneros todavía: pulsa «Categorizar» en Todos los títulos.'))));
    // Lo más visto
    const top = Object.entries(sm.byTitle).sort((a, b) => b[1].min - a[1].min).slice(0, 6);
    grid.append(statCard(T('Lo que más has visto'), h('div', { class: 'toplist' }, top.map(([k, v], i) => {
      const t = titleOf(k, hist);
      return h('div', { class: 'toprow' }, h('span', { class: 'topn' }, String(i + 1)),
        t.img ? h('img', { src: t.img, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'topph', style: '--pc:' + platColor(t.platform) }),
        h('div', { class: 'topinfo' }, h('b', {}, t.title || k), h('small', {}, SB.platformBadge(t.platform || k.split(':')[0], true), ' ', hoursTxt(v.min), v.eps.size > 1 ? ' · ' + TN(v.eps.size, '{0} episodio', '{0} episodios') : '')));
    })), 'wide'));
    // Actividad: las últimas 26 semanas
    grid.append(statCard(T('Actividad'), heatmap(hist), 'wide'));
    // Por mes (en el año o desde siempre)
    if (period === 'year' || period === 'all') {
      const months = Object.entries(sm.byMonth).sort();
      if (months.length > 1) grid.append(statCard(T('Por mes'), columns(months.map(([mo, m]) => ({ label: new Date(mo + '-01T12:00').toLocaleDateString(T.locale(), { month: 'short' }), value: m, txt: hoursTxt(m) }))), 'wide'));
    }
    main.append(grid);
  }
  main.append(tasteCard());
}
function kpi(big, label, sub) { return h('div', { class: 'kpi card' }, h('b', {}, big), h('span', {}, label), sub ? h('small', {}, sub) : null); }
function statCard(title, body, cls) { return h('div', { class: 'card stat-card ' + (cls || '') }, h('h3', {}, title), body); }
function bars(rows) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return h('div', { class: 'bars' }, rows.map(r => h('div', { class: 'bar-row' },
    h('span', { class: 'bar-label' }, r.label),
    h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `width:${Math.max(2, r.value / max * 100)}%;background:${r.color}` })),
    h('span', { class: 'bar-val' }, r.txt))));
}
function columns(rows) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return h('div', { class: 'cols' }, rows.map(r => h('div', { class: 'col', title: r.txt },
    h('span', { class: 'col-val' }, r.txt), h('span', { class: 'col-bar', style: `height:${Math.max(3, r.value / max * 100)}%` }), h('span', { class: 'col-label' }, r.label))));
}
function heatmap(hist) {
  const weeks = 26, today = new Date(), start = new Date(today);
  start.setDate(start.getDate() - (weeks * 7 - 1) - ((today.getDay() + 6) % 7 - 6 + 7) % 7);
  // Empezar en lunes
  while (start.getDay() !== 1) start.setDate(start.getDate() - 1);
  const cells = [];
  const tot = d => Object.values(hist.days[d] || {}).reduce((a, v) => a + (v.m || 0), 0);
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const k = ymd(d), m = tot(k);
    const lv = m <= 0 ? 0 : m < 30 ? 1 : m < 90 ? 2 : m < 180 ? 3 : 4;
    cells.push(h('span', { class: 'hm l' + lv, title: d.toLocaleDateString(T.locale(), { weekday: 'short', day: 'numeric', month: 'short' }) + (m ? ' · ' + hoursTxt(m) : '') }));
  }
  return h('div', { class: 'heat-wrap' }, h('div', { class: 'heat' }, cells),
    h('div', { class: 'heat-legend' }, h('small', {}, T('Menos')), [0, 1, 2, 3, 4].map(l => h('span', { class: 'hm l' + l })), h('small', {}, T('Más'))));
}

function tasteCard() {
  const tm = tasteMatch();
  const card = h('div', { class: 'card taste' }, h('h3', {}, '🎯 ' + T('¿A qué web se parece tu gusto?')));
  card.append(h('p', { class: 'muted' }, T('Comparo tus estrellas con las notas de FilmAffinity, IMDb y Rotten Tomatoes de los mismos títulos. Cuanto más alta la barra, más se parecen a tus gustos.')));
  if (tm.rated < 4) { card.append(h('p', {}, T('Puntúa al menos 4 títulos con estrellas para poder compararlo ({0} de 4).', tm.rated))); return card; }
  if (tm.missing) {
    const btn = h('button', { class: 'secondary' }, T('Buscar las notas de mis {0} títulos puntuados sin datos', tm.missing));
    btn.onclick = async () => {
      btn.disabled = true;
      await fetchInfoFor(Object.values(state.titles).filter(t => t.rating > 0 && !infoCache[t.key]), (i, n) => btn.textContent = T('Buscando… {0} de {1}', i, n));
      render();
    };
    card.append(h('p', {}, btn));
  }
  const usable = tm.res.filter(x => x.r != null);
  if (!usable.length) { card.append(h('p', { class: 'muted' }, T('Aún no hay suficientes títulos con nota en las otras webs.'))); return card; }
  card.append(h('div', { class: 'bars' }, tm.res.map(x => h('div', { class: 'bar-row' + (tm.best && x.id === tm.best.id ? ' best' : '') },
    h('span', { class: 'bar-label' }, srcName(x)),
    h('span', { class: 'bar-track' }, x.r != null ? h('span', { class: 'bar-fill', style: `width:${Math.max(2, (x.r + 1) / 2 * 100)}%;background:var(--grad)` }) : null),
    h('span', { class: 'bar-val' }, x.r != null ? Math.round(Math.max(0, x.r) * 100) + '%' : '—', h('small', {}, ' · ' + TN(x.n, '{0} título', '{0} títulos')))))));
  if (tm.best && tm.best.r > 0.2) {
    const cur = state.settings.tasteSource === tm.best.id;
    card.append(h('div', { class: 'taste-best' },
      h('span', {}, T('Tu gusto se parece más a {0}.', srcName(tm.best))),
      cur ? h('span', { class: 'muted' }, '✓ ' + T('Se usa para «Según tu web afín»'))
        : h('button', { class: 'primary', onclick: async () => { state.settings.tasteSource = tm.best.id; await persist(['settings']); render(); } }, T('Usarla para ordenar'))));
    card.append(h('p', { class: 'muted small' }, T('En cualquier lista, «Ordenar: Según tu web afín» pone primero lo que mejor nota tiene en esa web.')));
  }
  return card;
}

// ---------- Tu resumen del año (tipo «Wrapped») ----------
function openWrapped(hist, year) {
  const sm = summarize(hist, year + '-01-01', year + '-12-31');
  const st = streaks(hist);
  const topT = Object.entries(sm.byTitle).sort((a, b) => b[1].min - a[1].min)[0];
  const topP = Object.entries(sm.byPlat).sort((a, b) => b[1] - a[1])[0];
  const topC = Object.entries(sm.byCat).sort((a, b) => b[1] - a[1])[0];
  const tm = tasteMatch();
  const slides = [];
  slides.push([T('Tu {0} en StreamBox', year), h('div', { class: 'w-big' }, hoursTxt(sm.min)), T('viendo pelis y series'), sm.min >= 1440 ? T('Eso son {0} días enteros delante de la pantalla.', (sm.min / 1440).toFixed(1).replace('.', ',')) : T('Repartidas en {0}.', TN(sm.days, '{0} día', '{0} días'))]);
  if (topP) slides.push([T('Tu plataforma del año'), h('div', { class: 'w-plat', style: '--pc:' + platColor(topP[0]) }, platName(topP[0])), T('{0} de todo lo que viste', Math.round(topP[1] / sm.min * 100) + '%'), hoursTxt(topP[1])]);
  if (topT) { const t = titleOf(topT[0], hist); slides.push([T('Lo que más viste'), t.img ? h('img', { class: 'w-img', src: t.img, alt: '', referrerpolicy: 'no-referrer' }) : null, h('div', { class: 'w-title' }, t.title || topT[0]), hoursTxt(topT[1].min) + (topT[1].eps.size > 1 ? ' · ' + TN(topT[1].eps.size, '{0} episodio', '{0} episodios') : '')]); }
  if (topC) { const cc = SB.CATS.find(x => x.id === topC[0]) || { label: topC[0], icon: '🎬' }; slides.push([T('Tu género'), h('div', { class: 'w-big' }, cc.icon), h('div', { class: 'w-title' }, T(cc.label)), hoursTxt(topC[1])]); }
  slides.push([T('Constancia'), h('div', { class: 'w-big' }, String(st.best)), TN(st.best, 'día seguido viendo algo', 'días seguidos viendo algo'), sm.maxDay ? T('Tu día más maratoniano: {0}, con {1}.', fromYmd(sm.maxDay.d).toLocaleDateString(T.locale(), { day: 'numeric', month: 'long' }), hoursTxt(sm.maxDay.min)) : '']);
  if (tm.best && tm.best.r > 0.2) slides.push([T('Tu gusto'), h('div', { class: 'w-title' }, srcName(tm.best)), T('es la web que más coincide con tus estrellas'), Math.round(tm.best.r * 100) + '%']);
  let i = 0;
  const stage = h('div', { class: 'w-stage' });
  const dots = h('div', { class: 'w-dots' });
  const draw = () => {
    stage.replaceChildren(h('div', { class: 'w-slide' }, ...slides[i].filter(Boolean).map((x, j) => typeof x === 'string' ? h(j === 0 ? 'h2' : 'p', {}, x) : x)));
    dots.replaceChildren(...slides.map((_, j) => h('span', { class: j === i ? 'on' : '' })));
  };
  const close = () => { ov.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
  const next = () => { if (i < slides.length - 1) { i++; draw(); } else close(); };
  const prev = () => { if (i > 0) { i--; draw(); } };
  const ov = h('div', { class: 'wrapped', onclick: e => { if (e.target === ov) close(); } },
    h('div', { class: 'w-card' },
      h('button', { class: 'w-close', title: T('Cerrar'), onclick: close }, '✕'),
      stage,
      h('div', { class: 'w-nav' }, h('button', { onclick: prev }, '‹'), dots, h('button', { onclick: next }, '›'))));
  document.addEventListener('keydown', key);
  document.body.append(ov);
  draw();
}
