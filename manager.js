// StreamBox — gestor de listas
let state = { lists: [], titles: {}, settings: {} };
let view = { name: 'list', id: null };
// Filtros de la vista actual (se conservan al cambiar de lista)
const ui = { q: '', platform: '', type: '', stars: '', cat: '', listFilter: '', allSort: 'added', statsPeriod: 'year' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(k));
  return el;
};
const PALETTE = SB.PALETTE;

let saving = false;
async function persist(keys = ['lists', 'titles', 'settings', 'queue', 'follow']) {
  saving = true;
  const o = {}; keys.forEach(k => o[k] = state[k]);
  await SB.save(o);
  setTimeout(() => saving = false, 50);
}
chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area !== 'local' || saving || !(ch.lists || ch.titles || ch.settings || ch.queue || ch.follow || ch.followCheckedAt)) return;
  const prev = T.lang();
  state = await SB.load(); applyTheme();
  if (T.lang() !== prev) translateStatic();
  // No redibujar mientras se escribe en un campo del gestor
  if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $('#main').contains(document.activeElement)) { renderSide(); return; }
  render();
});

// ---------- Tema del gestor ----------
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const dark = SB.isDark(state.settings, darkMQ.matches);
  const v = SB.themeVars(state.settings, dark);
  const r = document.documentElement.style;
  for (const [k, css] of [['bg', 'bg'], ['panel', 'panel'], ['panel2', 'panel2'], ['line', 'line'], ['txt', 'txt'], ['mut', 'mut'], ['acc', 'acc'], ['acc2', 'acc2'], ['grad', 'grad'], ['accSoft', 'acc-soft'], ['shadow', 'shadow']]) r.setProperty('--' + css, v[k]);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  const bl = $('.brand-logo');
  if (bl) bl.replaceChildren(SB.logoEl(30, v.acc, v.acc2));
}
darkMQ.addEventListener('change', applyTheme);

// ---------- Rutas ----------
function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === 'new') { history.replaceState(null, '', '#'); createList(); return; }
  if (hash.startsWith('list=')) view = { name: 'list', id: hash.slice(5) };
  else if (hash === 'all') view = { name: 'all' };
  else if (hash === 'queue') view = { name: 'queue' };
  else if (hash === 'follow') view = { name: 'follow' };
  else if (hash === 'stats') view = { name: 'stats' };
  else if (hash === 'tonight') view = { name: 'tonight' };
  else if (hash === 'subs') view = { name: 'subs' };
  else if (hash === 'discover') view = { name: 'discover' };
  else if (hash === 'bookmarks') view = { name: 'bookmarks' };
  else if (hash.startsWith('cat=')) view = { name: 'cat', id: hash.slice(4) };
  else if (hash === 'settings') view = { name: 'settings' };
  else if (hash === 'help' || hash.startsWith('help=')) view = { name: 'help', section: hash.split('=')[1] || '' };
  else view = { name: 'list', id: null };
  render();
}
window.addEventListener('hashchange', route);
function go(v) {
  view = v;
  const hash = v.name === 'list' ? (v.id ? 'list=' + v.id : '') : v.name === 'cat' ? 'cat=' + v.id : v.name;
  history.replaceState(null, '', hash ? '#' + hash : location.pathname);
  render();
  $('#main').scrollTop = 0;
}

// ---------- Barra lateral ----------
function renderSide() {
  const box = $('#listList');
  box.replaceChildren();
  state.lists.forEach((l, i) => {
    const it = h('div', { class: 'g-item' + (view.name === 'list' && view.id === l.id ? ' on' : ''), draggable: 'true', title: l.name },
      SB.iconEl(l, 26), h('span', { class: 'n' }, l.name), h('span', { class: 'c' }, String(l.items.length)));
    it.onclick = () => go({ name: 'list', id: l.id });
    it.ondragstart = e => { e.dataTransfer.setData('text/sb-list', String(i)); };
    it.ondragover = e => { if (e.dataTransfer.types.includes('text/sb-list') || e.dataTransfer.types.includes('text/sb-title')) { e.preventDefault(); it.classList.add('drag-over'); } };
    it.ondragleave = () => it.classList.remove('drag-over');
    it.ondrop = async e => {
      e.preventDefault(); it.classList.remove('drag-over');
      // Soltar un título sobre una lista lo añade a esa lista
      const tk = e.dataTransfer.getData('text/sb-title');
      if (tk) {
        if (state.titles[tk] && !l.items.some(x => x.k === tk)) { l.items.unshift({ k: tk, at: Date.now() }); await persist(['lists']); render(); toastM(T('Añadido a «{0}»', l.name)); }
        return;
      }
      const from = +e.dataTransfer.getData('text/sb-list');
      if (isNaN(from) || from === i) return;
      const [m] = state.lists.splice(from, 1);
      state.lists.splice(i, 0, m);
      await persist(['lists']); render();
    };
    box.append(it);
  });
  if (!state.lists.length) box.append(h('div', { class: 'muted', style: 'padding:8px 10px' }, T('Sin listas todavía')));
  // Categorías automáticas (solo las que tienen algún título)
  const counts = catCounts();
  const used = SB.CATS.filter(c => counts[c.id]).sort((a, b) => counts[b.id] - counts[a.id]);
  if (used.length) {
    const open = state.settings.catsOpen !== false;
    box.append(h('button', { class: 'side-sec', onclick: async () => { state.settings.catsOpen = !open; await persist(['settings']); renderSide(); } },
      h('span', {}, T('Categorías')), h('span', { class: 'side-sec-arrow' }, open ? '▾' : '▸')));
    if (open) for (const c of used) {
      const it = h('div', { class: 'g-item cat' + (view.name === 'cat' && view.id === c.id ? ' on' : ''), title: T(c.label) },
        h('span', { class: 'cat-ico' }, c.icon), h('span', { class: 'n' }, T(c.label)), h('span', { class: 'c' }, String(counts[c.id])));
      it.onclick = () => go({ name: 'cat', id: c.id });
      box.append(it);
    }
  }
  $$('.side-nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view.name));
  const tb = $('.side-nav button[data-view="tonight"]');
  if (tb && typeof leavingCache === 'object') { let c = tb.querySelector('.c'); if (!c) { c = h('span', { class: 'c' }); tb.append(c); } const n = Object.keys(state.titles).filter(k => { const a = leavingOf(k); return a && SB.daysLeft(a) <= 7; }).length; c.textContent = n ? '⏳ ' + n : ''; tb.classList.toggle('has-new', n > 0); }
  const fb = $('.side-nav button[data-view="follow"]');
  if (fb) { let c = fb.querySelector('.c'); if (!c) { c = h('span', { class: 'c' }); fb.append(c); } const nn = Object.values(state.follow || {}).filter(r => r.isNew).length; c.textContent = nn ? String(nn) : ''; fb.classList.toggle('has-new', nn > 0); }
  const qb = $('.side-nav button[data-view="queue"]');
  if (qb) { let c = qb.querySelector('.c'); if (!c) { c = h('span', { class: 'c' }); qb.append(c); } const np = SB.queuePending(state).length; c.textContent = np ? String(np) : ''; qb.classList.toggle('playing', !!state.queue.playing); }
}

async function createList() {
  const l = SB.newList(state, T('Nueva lista'));
  await persist(['lists']);
  go({ name: 'list', id: l.id });
  setTimeout(() => { const n = $('.name-input'); n && (n.focus(), n.select()); }, 30);
}

function toastM(msg, isErr) {
  $('#m-toast')?.remove();
  const t = h('div', { id: 'm-toast', class: 'banner' + (isErr ? ' err' : '') }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- Vistas ----------
function render() {
  renderSide();
  const main = $('#main');
  main.replaceChildren();
  main.dataset.view = view.name;
  if (view.name === 'all') return renderAll(main);
  if (view.name === 'cat') return renderAll(main, view.id);
  if (view.name === 'queue') return renderQueue(main);
  if (view.name === 'follow') return renderFollow(main);
  if (view.name === 'stats') return renderStats(main);
  if (view.name === 'tonight') return renderTonight(main);
  if (view.name === 'subs') return renderSubs(main);
  if (view.name === 'discover') return renderDiscover(main);
  if (view.name === 'bookmarks') return renderBookmarks(main);
  if (view.name === 'settings') return renderSettings(main);
  if (view.name === 'help') return renderHelp(main);
  let l = state.lists.find(x => x.id === view.id);
  if (!l && state.lists.length) { l = state.lists[0]; view.id = l.id; renderSide(); }
  if (!l) return renderWelcome(main);
  renderList(main, l);
}

function renderWelcome(main) {
  main.append(h('div', { class: 'card welcome' },
    h('div', { class: 'welcome-logo' }, SB.logoEl(64, ...(() => { const v = SB.themeVars(state.settings, false); return [v.acc, v.acc2]; })())),
    h('h1', {}, T('👋 Bienvenido a StreamBox')),
    h('p', {}, T('Crea tus propias listas de pelis y series («Pelis que me han encantado», «Ver en Navidad», «Documentales de deporte»…) con el icono y el color que quieras, mezclando plataformas. Pasos:')),
    h('ol', {},
      h('li', {}, T('Crea una lista con «+ Nueva lista».')),
      h('li', {}, T('Entra en Netflix, Prime Video, Disney+ o Movistar Plus+: en cada miniatura, en la ficha y en el reproductor verás el botón de StreamBox para añadirlo a tus listas.')),
      h('li', {}, T('Vuelve aquí para ver, ordenar y editar tus listas. Al pulsar un título se abre en su plataforma.'))),
    h('button', { class: 'primary', onclick: createList }, T('+ Crear mi primera lista'))));
}

// ---------- Filtros comunes (buscador, plataforma, tipo) ----------
function filterBar(titles, onChange, extra = [], opts = {}) {
  const q = h('input', { type: 'search', placeholder: T('Buscar por título, año o notas…'), value: ui.q, class: 'f-search' });
  q.oninput = () => { ui.q = q.value; onChange(); };
  const plats = [...new Set(titles.map(t => t.platform))];
  if (ui.platform && !plats.includes(ui.platform)) ui.platform = '';
  const chips = h('div', { class: 'chips' });
  const drawChips = () => chips.replaceChildren(
    h('button', { class: 'chip' + (!ui.platform ? ' on' : ''), onclick: () => { ui.platform = ''; drawChips(); onChange(); } }, T('Todas')),
    ...plats.map(p => h('button', { class: 'chip' + (ui.platform === p ? ' on' : ''), onclick: () => { ui.platform = ui.platform === p ? '' : p; drawChips(); onChange(); } },
      SB.platformBadge(p, true), (SBP.get(p) || { name: p }).name)));
  drawChips();
  const seg = h('div', { class: 'theme-seg small' });
  const drawSeg = () => seg.replaceChildren(...[['', T('Todo')], ['movie', T('Pelis')], ['series', T('Series')]].map(([v, t]) =>
    h('button', { class: ui.type === v ? 'on' : '', onclick: () => { ui.type = v; drawSeg(); onChange(); } }, t)));
  drawSeg();
  const stars = h('select', { class: 'tv-select', title: T('Filtrar por mi puntuación') },
    h('option', { value: '' }, T('★ Cualquier puntuación')),
    ...[5, 4, 3, 2, 1].map(n => h('option', { value: String(n) }, '★'.repeat(n) + (n < 5 ? ' ' + T('o más') : ''))),
    h('option', { value: 'none' }, T('Sin puntuar')));
  stars.value = ui.stars;
  stars.onchange = () => { ui.stars = stars.value; onChange(); };
  let catSel = null;
  if (!opts.noCat) {
    const present = new Set(titles.flatMap(t => t.cats || []));
    if (ui.cat && ui.cat !== 'none' && !present.has(ui.cat)) ui.cat = '';
    if (present.size) {
      catSel = h('select', { class: 'tv-select', title: T('Filtrar por categoría') },
        h('option', { value: '' }, '🏷 ' + T('Todas las categorías')),
        ...SB.CATS.filter(c => present.has(c.id)).map(c => h('option', { value: c.id }, c.icon + ' ' + T(c.label))),
        h('option', { value: 'none' }, T('Sin categoría')));
      catSel.value = ui.cat;
      catSel.onchange = () => { ui.cat = catSel.value; onChange(); };
    }
  }
  return h('div', { class: 'toolbar filters' }, q, plats.length > 1 ? chips : null, seg, stars, catSel, ...extra);
}
function catCounts() {
  const n = {};
  for (const t of Object.values(state.titles)) for (const c of t.cats || []) n[c] = (n[c] || 0) + 1;
  return n;
}
function applyFilters(list) {
  const s = ui.q.trim().toLowerCase();
  return list.filter(t => {
    if (ui.platform && t.platform !== ui.platform) return false;
    if (ui.type && t.type !== ui.type) return false;
    if (ui.cat === 'none' && t.cats && t.cats.length) return false;
    if (ui.cat && ui.cat !== 'none' && !(t.cats || []).includes(ui.cat)) return false;
    if (ui.stars === 'none' && t.rating) return false;
    if (ui.stars && ui.stars !== 'none' && (t.rating || 0) < +ui.stars) return false;
    if (s && !(`${t.title} ${t.year} ${t.note || ''}`.toLowerCase().includes(s))) return false;
    return true;
  });
}
const filtersOn = () => !!(ui.q.trim() || ui.platform || ui.type || ui.stars || ui.cat);

const cmpTitle = (a, b) => (a.title || '').localeCompare(b.title || '', T.locale(), { sensitivity: 'base', numeric: true });
const SORTS = {
  manual: { label: 'Mi orden (arrastrar)' },
  added: { label: 'Añadidos recientemente', fn: (a, b) => b._at - a._at },
  oldest: { label: 'Añadidos hace más tiempo', fn: (a, b) => a._at - b._at },
  az: { label: 'Título (A-Z)', fn: cmpTitle },
  za: { label: 'Título (Z-A)', fn: (a, b) => cmpTitle(b, a) },
  yearDesc: { label: 'Año (más nuevos)', fn: (a, b) => (+b.year || 0) - (+a.year || 0) || cmpTitle(a, b) },
  yearAsc: { label: 'Año (más antiguos)', fn: (a, b) => (+a.year || 9999) - (+b.year || 9999) || cmpTitle(a, b) },
  rating: { label: 'Mi puntuación', fn: (a, b) => (b.rating || 0) - (a.rating || 0) || cmpTitle(a, b) },
  platform: { label: 'Plataforma', fn: (a, b) => a.platform.localeCompare(b.platform) || cmpTitle(a, b) },
  group: { label: 'Votos del grupo', fn: (a, b) => (sortCtxList ? groupScore(sortCtxList, b.key) - groupScore(sortCtxList, a.key) : 0) || (b.rating || 0) - (a.rating || 0) || cmpTitle(a, b) },
  affinity: { label: 'Según tu web afín', fn: (a, b) => affinityScore(b) - affinityScore(a) || (b.rating || 0) - (a.rating || 0) || cmpTitle(a, b) },
};
// Vista en cuadrícula (carátulas) o en lista (filas compactas); se recuerda en Ajustes
const gridMode = () => state.settings.view === 'list' ? 'list' : 'grid';
function applyMode(grid) { grid.classList.toggle('as-list', gridMode() === 'list'); return grid; }
function viewToggle(grid) {
  const seg = h('div', { class: 'view-seg', role: 'group', 'aria-label': T('Vista') });
  const draw = () => seg.replaceChildren(...[['grid', 'cuadricula', T('Ver en cuadrícula')], ['list', 'lista', T('Ver en lista')]].map(([v, ico, tt]) =>
    h('button', { class: gridMode() === v ? 'on' : '', title: tt, 'aria-pressed': String(gridMode() === v), onclick: async () => {
      if (gridMode() === v) return;
      state.settings.view = v; applyMode(grid); draw(); closeInfo(); await persist(['settings']);
    } }, SB.svgEl(ico, 17, 'currentColor'))));
  draw();
  return seg;
}
function sortSelect(value, keys, onChange) {
  const sel = h('select', { class: 'tv-select', title: T('Ordenar') }, ...keys.map(k => h('option', { value: k }, T(SORTS[k].label))));
  sel.value = value;
  sel.onchange = () => onChange(sel.value);
  return h('label', { class: 'row', style: 'gap:8px' }, h('span', { class: 'muted' }, T('Ordenar:')), sel);
}

// ---------- Tarjeta de un título ----------
function titleCard(t, ctx) {
  const p = SBP.get(t.platform) || { name: t.platform };
  const url = t.url || (p.titleUrl ? p.titleUrl(t.pid) : '#');
  const poster = h('a', { class: 'tposter', href: url, target: '_blank', rel: 'noopener', title: T('Abrir en {0}', p.name), draggable: 'false' });
  const fallback = () => poster.replaceChildren(h('div', { class: 'tph' }, h('span', {}, t.title || t.pid)), badges());
  const lv = typeof leavingOf === 'function' ? leavingOf(t.key) : 0;
  const lvd = lv ? SB.daysLeft(lv) : 99;
  const badges = () => h('div', { class: 'tbadges' }, SB.platformBadge(t.platform),
    lvd <= 30 ? h('span', { class: 'tleave' + (lvd <= 7 ? ' urgent' : ''), title: T('Se va de {0} el {1}', p.name, new Date(lv).toLocaleDateString(T.locale(), { day: 'numeric', month: 'long' })) }, '⏳ ' + (lvd <= 0 ? T('Último día') : lvd === 1 ? T('Mañana') : T('{0} días', lvd))) : null);
  if (t.img) {
    const img = h('img', { src: t.img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', draggable: 'false' });
    img.onerror = fallback;
    poster.append(img, badges());
  } else fallback();
  poster.append(h('span', { class: 'tplay' }, '▶'),
    h('button', { class: 'tplayon', type: 'button', title: T('Reproducir en otro dispositivo'), onclick: e => { e.preventDefault(); e.stopPropagation(); openPlayOn(t, e.currentTarget); } }, '📲 ' + T('Reproducir en…')));
  const meta = [SB.typeLabel(t.type), t.year].filter(Boolean).join(' · ');
  const lists = h('div', { class: 'tlists' }, state.lists.map(l => {
    const on = l.items.some(i => i.k === t.key);
    const b = h('button', { class: 'gt' + (on ? ' on' : ''), title: (on ? T('Quitar de «{0}»', l.name) : T('Añadir a «{0}»', l.name)) }, SB.iconEl(l, 20));
    b.onclick = async () => {
      if (l.items.some(i => i.k === t.key)) {
        if (ctx.list && ctx.list.id === l.id) return removeFromCurrent();
        SB.removeFromList(state, l, t.key);
      } else l.items.unshift({ k: t.key, at: Date.now() });
      await persist(['lists', 'titles']);
      if (!state.titles[t.key]) return render();
      b.classList.toggle('on'); b.title = l.items.some(i => i.k === t.key) ? T('Quitar de «{0}»', l.name) : T('Añadir a «{0}»', l.name);
      renderSide();
    };
    return b;
  }));
  const removeFromCurrent = async () => {
    SB.removeFromList(state, ctx.list, t.key);
    await persist(['lists', 'titles']); render();
    toastM(T('«{0}» quitado de la lista', t.title || t.pid));
  };
  const qBtn = h('button', { class: 'icon-btn qadd' + (SB.inQueue(state, t.key) >= 0 ? ' on' : '') }, SB.svgEl('cola', 17, 'currentColor'));
  const drawQ = () => { const i = SB.inQueue(state, t.key); qBtn.classList.toggle('on', i >= 0); qBtn.title = i >= 0 ? T('En la cola (n.º {0}) · quitar', i + 1) : T('Añadir a la cola de reproducción'); };
  drawQ();
  qBtn.onclick = async () => {
    if (SB.inQueue(state, t.key) >= 0) SB.queueRemove(state, t.key); else SB.queueAdd(state, t);
    await persist(['queue', 'titles']); drawQ(); renderSide();
  };
  const fBtn = t.type === 'movie' ? null : h('button', { class: 'icon-btn qadd' + (SB.isFollowing(state, t.key) ? ' on' : ''), title: SB.isFollowing(state, t.key) ? T('Siguiendo · dejar de seguir') : T('Seguir: avisarme de episodios nuevos') }, SB.svgEl('campana', 16, 'currentColor'));
  if (fBtn) fBtn.onclick = async () => {
    if (SB.isFollowing(state, t.key)) SB.unfollow(state, t.key);
    else { SB.follow(state, t); chrome.runtime.sendMessage({ type: 'followCheck', keys: [t.key] }); }
    await persist(['follow', 'titles']); render();
  };
  const actions = h('div', { class: 'tactions' },
    fBtn,
    qBtn,
    h('button', { class: 'icon-btn', title: T('Editar datos'), onclick: () => openEditor(t) }, SB.svgEl('lapiz', 16, 'currentColor')),
    ctx.list
      ? h('button', { class: 'icon-btn', title: T('Quitar de esta lista'), onclick: removeFromCurrent }, '✕')
      : h('button', { class: 'icon-btn', title: T('Quitar de todas las listas'), onclick: async () => {
        if (!confirm(T('¿Quitar «{0}» de todas tus listas?', t.title || t.pid))) return;
        state.lists.forEach(l => l.items = l.items.filter(i => i.k !== t.key)); SB.dropOrphans(state);
        await persist(['lists', 'titles']); render();
      } }, '🗑'));
  const card = h('div', { class: 'tcard', draggable: 'true', 'data-k': t.key, style: '--pc:' + ((SBP.get(t.platform) || {}).color || '#888') },
    poster,
    h('div', { class: 'tinfo' },
      h('a', { class: 'tname', href: url, target: '_blank', rel: 'noopener', draggable: 'false' }, t.title || t.pid),
      h('div', { class: 'tmeta' },
        h('small', {}, meta || h('span', { class: 'tmissing', onclick: () => openEditor(t) }, T('Sin tipo ni año · completar'))),
        (() => { const b = h('button', { class: 'tinfo-btn', type: 'button', 'aria-label': T('Notas en FilmAffinity, IMDb y Rotten Tomatoes y datos básicos'), onclick: e => toggleInfo(e.currentTarget, t) }, T('Info'), h('span', { class: 'caret' }, '▾')); infoHover(b, t); return b; })()),
      // Categorías en una sola línea (las que no caben se ven al pasar el ratón por «+n»)
      h('div', { class: 'tcats' }, (() => {
        const cs = (t.cats || []).map(SB.catOf).filter(Boolean);
        const chips = cs.slice(0, 2).map(c => h('button', { class: 'tcat', title: T('Ver la categoría «{0}»', T(c.label)), onclick: () => go({ name: 'cat', id: c.id }) }, c.icon + ' ' + T(c.label)));
        if (cs.length > 2) chips.push(h('span', { class: 'tcat more', title: cs.slice(2).map(c => T(c.label)).join(', ') }, '+' + (cs.length - 2)));
        return chips;
      })()),
      t.note ? h('div', { class: 'tnote', title: t.note, onclick: () => openEditor(t) }, '📝 ' + t.note) : null,
      // Estrellas a la izquierda y acciones a la derecha, en la misma fila
      ctx.list && ctx.list.shared ? votesEl(ctx.list, t) : null,
      h('div', { class: 'trate' }, SB.starsEl(t.rating || 0, async v => {
        const x = state.titles[t.key]; if (!x) return;
        x.rating = v; await persist(['titles']);
        if (ui.stars) render();
      }, 15), actions)),
    h('div', { class: 'tfoot' }, lists));
  card.ondragstart = e => { e.dataTransfer.setData('text/sb-title', t.key); e.dataTransfer.effectAllowed = 'copyMove'; card.classList.add('dragging'); };
  card.ondragend = () => card.classList.remove('dragging');
  if (ctx.reorder) {
    card.ondragover = e => { if (e.dataTransfer.types.includes('text/sb-title')) { e.preventDefault(); card.classList.add('drag-over'); } };
    card.ondragleave = () => card.classList.remove('drag-over');
    card.ondrop = async e => {
      e.preventDefault(); card.classList.remove('drag-over');
      const from = e.dataTransfer.getData('text/sb-title');
      if (!from || from === t.key) return;
      const items = ctx.list.items;
      const fi = items.findIndex(i => i.k === from); if (fi < 0) return;
      const [m] = items.splice(fi, 1);
      items.splice(items.findIndex(i => i.k === t.key), 0, m);
      await persist(['lists']); render();
    };
  }
  return card;
}

// Títulos (con la fecha en que se añadieron) de una lista o de todas
function titlesOf(list) {
  if (list) return list.items.map(i => state.titles[i.k] && Object.assign({ _at: i.at || 0 }, state.titles[i.k])).filter(Boolean);
  const at = {};
  for (const l of state.lists) for (const i of l.items) at[i.k] = Math.max(at[i.k] || 0, i.at || 0);
  return Object.values(state.titles).map(t => Object.assign({ _at: at[t.key] || t.added || 0 }, t));
}

// ---------- Vista de una lista ----------
let sortCtxList = null;
function renderList(main, l) {
  sortCtxList = l;
  const name = h('input', { type: 'text', class: 'name-input', value: l.name, maxlength: '60' });
  name.oninput = () => { l.name = name.value; renderSide(); };
  name.onchange = () => persist(['lists']);
  const iconBtn = h('button', { class: 'big-icon', title: T('Cambiar icono') }, SB.iconEl(l, 64));
  iconBtn.onclick = () => openPicker(l);
  main.append(h('div', { class: 'editor-top' }, iconBtn, name,
    h('button', { class: 'secondary', title: T('Compartir esta lista con un código'), onclick: () => shareList(l) }, '👥 ' + (l.shared ? T('Compartida') : T('Compartir'))),
    h('button', { class: 'danger', onclick: async () => {
      if (!confirm(T('¿Borrar la lista «{0}»? Los títulos que solo estén en esta lista se olvidarán.', l.name))) return;
      state.lists = state.lists.filter(x => x.id !== l.id); SB.dropOrphans(state); view.id = null;
      await persist(['lists', 'titles']); go({ name: 'list', id: null });
    } }, T('Borrar lista'))));

  const all = titlesOf(l);
  const sort = l.sort && SORTS[l.sort] ? l.sort : 'manual';
  const grid = applyMode(h('div', { class: 'tgrid' }));
  const count = h('span', { class: 'muted f-count' });
  let shown = [];
  const fill = () => {
    let list = applyFilters(all);
    if (SORTS[sort].fn) list = list.slice().sort(SORTS[sort].fn);
    shown = list;
    const reorder = sort === 'manual' && !filtersOn();
    count.textContent = filtersOn() ? T('{0} de {1}', list.length, all.length) : TN(all.length, '{0} título', '{0} títulos');
    grid.classList.toggle('reorder', reorder);
    grid.replaceChildren(...list.map(t => titleCard(t, { list: l, reorder })));
    if (!all.length) grid.append(h('div', { class: 'empty' }, T('Esta lista está vacía. Añade títulos desde Netflix, Prime Video, Disney+ o Movistar Plus+ con el botón de StreamBox o pega aquí abajo el enlace de un título.')));
    else if (!list.length) grid.append(h('div', { class: 'empty' }, T('Ningún título coincide con los filtros.')));
  };
  const queueAll = h('button', { class: 'secondary', title: T('Añade a la cola los títulos que se ven, en este orden') }, '＋ ' + T('Todo a la cola'));
  queueAll.onclick = async () => {
    const before = state.queue.items.length;
    shown.forEach(t => SB.queueAdd(state, t));
    await persist(['queue', 'titles']); renderSide();
    toastM(T('{0} títulos añadidos a la cola', state.queue.items.length - before));
  };
  main.append(h('div', { class: 'section-head' }, h('h3', {}, T('Títulos')), h('div', { class: 'row', style: 'gap:14px' }, count, all.length ? queueAll : null, viewToggle(grid))),
    filterBar(all, fill, [sortSelect(sort, Object.keys(SORTS).filter(k => k !== 'group' || l.shared), async v => { l.sort = v; await persist(['lists']); render(); })]));
  if (sort === 'manual' && all.length > 1) main.append(h('p', { class: 'muted hint' }, T('Arrastra las carátulas para cambiar el orden. También puedes soltarlas sobre otra lista del menú lateral para añadirlas allí.')));
  main.append(grid);
  fill();
  main.append(addByLink(l));
}

// Añadir un título pegando su enlace
function addByLink(l) {
  const url = h('input', { type: 'url', placeholder: T('Pega el enlace de un título de Netflix, Prime Video, Disney+ o Movistar Plus+'), style: 'flex:1;min-width:320px' });
  const msg = h('div', { class: 'msg' });
  const btn = h('button', { class: 'primary' }, T('Añadir'));
  const doAdd = async () => {
    const r = SBP.parse(url.value);
    msg.className = 'msg';
    if (!r) { msg.className = 'msg err'; msg.textContent = T('No reconozco ese enlace. Plataformas disponibles: {0}.', SBP.list().map(p => p.name).join(', ')); return; }
    btn.disabled = true; msg.textContent = T('Buscando los datos del título…');
    let meta = {};
    try { meta = await SBP.get(r.platform).fetchMeta(r.pid); } catch (e) { console.warn(e); }
    // Prime Video y Disney+: se guarda el enlace tal cual (sin parámetros) para abrirlo en el mismo dominio
    const link = r.platform === 'netflix' ? '' : r.platform === 'movistar' ? SBP.get('movistar').titleUrl(r.pid, { url: url.value.trim() }) : url.value.trim().split(/[?#]/)[0].replace(/\/ref=.*$/, '');
    SB.addToList(state, l, Object.assign({ platform: r.platform, pid: r.pid, url: link }, meta));
    await persist(['lists', 'titles']);
    render();
    toastM(meta.title ? T('Añadido «{0}»', meta.title) : T('Añadido. No se pudieron leer sus datos: complétalos con ✎.'));
  };
  btn.onclick = doAdd;
  url.onkeydown = e => { if (e.key === 'Enter') doAdd(); };
  return h('div', {}, h('h3', {}, T('Añadir por enlace')), h('div', { class: 'row' }, url, btn), msg);
}

// ---------- Todos los títulos ----------
function renderAll(main, catId) {
  const cat = catId && SB.catOf(catId);
  if (cat) ui.cat = '';
  const every = titlesOf(null);
  const all = cat ? every.filter(t => (t.cats || []).includes(cat.id)) : every;
  if (cat) main.append(h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico emoji' }, cat.icon), T(cat.label)));
  else main.append(h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico' }, SB.svgEl('cuadricula', 24, '#fff')), T('Todos los títulos')));
  const listSel = h('select', { class: 'tv-select', title: T('Lista') },
    h('option', { value: '' }, T('Todas las listas')), ...state.lists.map(l => h('option', { value: l.id }, l.name)));
  if (ui.listFilter && !state.lists.some(l => l.id === ui.listFilter)) ui.listFilter = '';
  listSel.value = ui.listFilter;
  const grid = applyMode(h('div', { class: 'tgrid' }));
  const count = h('span', { class: 'muted f-count' });
  const fill = () => {
    let list = applyFilters(all);
    if (ui.listFilter) { const l = state.lists.find(x => x.id === ui.listFilter); list = list.filter(t => l && l.items.some(i => i.k === t.key)); }
    list = list.slice().sort(SORTS[ui.allSort] && SORTS[ui.allSort].fn || SORTS.added.fn);
    const on = filtersOn() || ui.listFilter;
    count.textContent = on ? T('{0} de {1}', list.length, all.length) : TN(all.length, '{0} título', '{0} títulos');
    grid.replaceChildren(...list.map(t => titleCard(t, {})));
    if (!all.length) grid.append(h('div', { class: 'empty' }, T('Todavía no has guardado ningún título.')));
    else if (!list.length) grid.append(h('div', { class: 'empty' }, T('Ningún título coincide con los filtros.')));
  };
  listSel.onchange = () => { ui.listFilter = listSel.value; fill(); };
  main.append(h('p', { class: 'muted', style: 'margin:-12px 0 24px' }, cat
      ? T('Categoría automática: aquí entra solo todo lo que guardas de este género, de cualquier plataforma. Puedes corregir las categorías de un título con el lápiz ✎.')
      : T('Todo lo que has guardado, de todas las plataformas. Pulsa los iconos de cada título para meterlo o sacarlo de tus listas.')),
    h('div', { class: 'section-head', style: 'margin-top:0' }, categorizeBtn(), h('div', { class: 'row', style: 'gap:14px' }, count, viewToggle(grid))),
    filterBar(all, fill, [listSel, sortSelect(ui.allSort, Object.keys(SORTS).filter(k => k !== 'manual' && k !== 'group'), v => { ui.allSort = v; fill(); })], { noCat: !!cat }),
    grid);
  fill();
}

// ---------- «Info»: notas en otras webs y datos básicos ----------
// Se abre al pasar el ratón por «Info» (y se queda fija si se pulsa). Va en una ventana flotante
// por encima de todo, del ancho que necesita, sin tocar el tamaño de la tarjeta.
let infoTimer = 0;
function closeInfo() {
  clearTimeout(infoTimer);
  const pop = $('.tinfo-pop');
  if (!pop) return;
  pop._btn?.classList.remove('on');
  pop.remove();
}
document.addEventListener('mousedown', e => { const pop = $('.tinfo-pop'); if (pop && pop._pinned && !pop.contains(e.target) && !pop._btn.contains(e.target)) closeInfo(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInfo(); });
addEventListener('scroll', () => { const pop = $('.tinfo-pop'); if (pop && !pop._pinned) closeInfo(); else if (pop) placeInfo(pop); }, true);
addEventListener('resize', () => { const pop = $('.tinfo-pop'); if (pop) placeInfo(pop); });
// Al lado de la tarjeta (a la derecha o, si no cabe, a la izquierda), sin taparla; en la vista
// de lista, debajo (o encima) del botón
function placeInfo(pop) {
  const btn = pop._btn, r = btn.getBoundingClientRect();
  if (!btn.isConnected || !r.width) return closeInfo();
  const card = btn.closest('.tcard'), cr = (card || btn).getBoundingClientRect();
  const w = pop.offsetWidth, hgt = pop.offsetHeight, m = 10;
  const clampTop = y => Math.max(m, Math.min(innerHeight - hgt - m, y));
  let left, top;
  const isRow = card && card.closest('.as-list');
  if (isRow && innerWidth - r.right - m >= w + 12) { left = r.right + 12; top = clampTop(r.top - 24); }
  else if (!isRow && innerWidth - cr.right - m >= w + 4) { left = cr.right + 10; top = clampTop(cr.top); }
  else if (!isRow && cr.left - w - 10 >= m) { left = cr.left - w - 10; top = clampTop(cr.top); }
  else {
    left = Math.max(m, Math.min(innerWidth - w - m, r.left - 16));
    top = r.bottom + 8 + hgt <= innerHeight - m ? r.bottom + 8 : r.top - hgt - 8 >= m ? r.top - hgt - 8 : clampTop(r.bottom + 8);
  }
  pop.style.left = Math.round(left) + 'px'; pop.style.top = Math.round(top) + 'px';
}
function infoHover(btn, t) {
  btn.addEventListener('mouseenter', () => {
    clearTimeout(infoTimer);
    const pop = $('.tinfo-pop');
    if (pop && pop._btn === btn) return;
    if (pop && pop._pinned) return;
    infoTimer = setTimeout(() => openInfo(btn, t), 220);
  });
  btn.addEventListener('mouseleave', () => { clearTimeout(infoTimer); leaveSoon(); });
}
function leaveSoon() {
  infoTimer = setTimeout(() => { const pop = $('.tinfo-pop'); if (pop && !pop._pinned && !pop.matches(':hover') && !pop._btn.matches(':hover')) closeInfo(); }, 280);
}
function toggleInfo(btn, t, force) {
  const pop = $('.tinfo-pop');
  if (pop && pop._btn === btn && !force) {
    if (pop._pinned) return closeInfo();
    pop._pinned = true; pop.classList.add('pinned'); return;
  }
  openInfo(btn, t, force, true);
}
function openInfo(btn, t, force, pinned) {
  closeInfo();
  const card = btn.closest('.tcard');
  const pop = h('div', { class: 'tinfo-pop' + (pinned ? ' pinned' : ''), role: 'dialog', style: '--pc:' + ((card && card.style.getPropertyValue('--pc')) || '#888') },
    h('div', { class: 'tinfo-head' }, SB.platformBadge(t.platform, true), h('b', {}, t.title || t.pid), t.year ? h('span', { class: 'muted' }, t.year) : null),
    h('div', { class: 'tinfo-body' }, h('div', { class: 'tinfo-load' }, h('span', { class: 'spin' }), T('Buscando notas y datos…'))));
  pop._btn = btn; pop._pinned = !!pinned; btn.classList.add('on');
  pop.addEventListener('mouseenter', () => clearTimeout(infoTimer));
  pop.addEventListener('mouseleave', leaveSoon);
  document.body.append(pop);
  placeInfo(pop);
  titleInfo(t.key, !!force).then(r => {
    if (!pop.isConnected) return;
    $('.tinfo-body', pop).replaceChildren(...infoView(r || { error: T('sin respuesta') }, t, btn));
    placeInfo(pop);
  }).catch(e => { if (pop.isConnected) $('.tinfo-body', pop).replaceChildren(h('div', { class: 'tinfo-empty' }, T('No se pudo consultar: {0}', e.message))); });
}
// «Dónde verla»: en qué plataformas está (según JustWatch), con enlace directo a cada una
function whereEl(where, t) {
  const offers = where.offers.slice().sort((a, b) => (b.platform === t.platform) - (a.platform === t.platform) || (!!b.platform - !!a.platform));
  return h('div', { class: 'where' }, h('span', { class: 'where-lab' }, T('Dónde verla')),
    h('div', { class: 'where-list' }, offers.slice(0, 8).map(o => {
      const known = o.platform && SB_PLATFORMS[o.platform];
      return h('a', { class: 'where-it' + (o.platform === t.platform ? ' here' : '') + (known ? '' : ' other'), href: o.link || where.url, target: '_blank', rel: 'noopener',
        title: o.platform === t.platform ? T('Donde lo guardaste') : T('Abrir en {0}', o.name) },
        known ? SB.platformBadge(o.platform, true) : null, h('span', {}, known ? known.name : o.name), o.type === 'ADS' ? h('small', {}, T('con anuncios')) : o.type === 'FREE' ? h('small', {}, T('gratis')) : null);
    })),
    h('a', { class: 'where-jw', href: where.url, target: '_blank', rel: 'noopener', title: 'JustWatch' }, 'JustWatch ↗'));
}
// Se busca desde el propio gestor (tiene permiso para leer esas webs) y se guarda una semana
const INFO_DAYS = 7;
const infoBusy = {};
async function titleInfo(key, force) {
  const t = state.titles[key];
  if (!t) return { error: T('el título ya no está guardado') };
  const { info = {} } = await chrome.storage.local.get('info');
  const old = info[key];
  if (old && !force && old.title === t.title && Date.now() - old.at < (old.found ? INFO_DAYS : 1) * 864e5) return old;
  if (!infoBusy[key]) infoBusy[key] = SBInfo.lookup(t).finally(() => setTimeout(() => delete infoBusy[key], 0));
  const r = await infoBusy[key];
  const cur = (await chrome.storage.local.get('info')).info || {};
  cur[key] = r;
  for (const k of Object.keys(cur)) if (!state.titles[k]) delete cur[k];
  await chrome.storage.local.set({ info: cur });
  return r;
}
function infoView(r, t, btn) {
  if (r.error) return [h('div', { class: 'tinfo-empty' }, T('No se pudo consultar: {0}', r.error))];
  const out = [];
  const num = v => String(v).replace('.', T.locale().startsWith('en') ? '.' : ',');
  const votes = n => n ? new Intl.NumberFormat(T.locale()).format(n) : '';
  const chip = (cls, label, value, sub, url, title) => h('a', { class: 'rchip ' + cls, href: url, target: '_blank', rel: 'noopener', title: title || label },
    h('span', { class: 'rlab' }, label), h('b', {}, value), sub ? h('small', {}, sub) : null);
  const chips = [];
  if (r.fa) chips.push(chip('fa', 'FilmAffinity', r.fa.rating ? num(r.fa.rating) : '—', r.fa.votes ? TN(r.fa.votes, '{0} voto', '{0} votos').replace(String(r.fa.votes), votes(r.fa.votes)) : '', r.fa.url));
  if (r.imdb) chips.push(r.imdb.rating ? chip('imdb', 'IMDb', num(r.imdb.rating), r.imdb.votes ? TN(r.imdb.votes, '{0} voto', '{0} votos').replace(String(r.imdb.votes), votes(r.imdb.votes)) : '', r.imdb.url)
    : chip('imdb', 'IMDb', '↗', '', r.imdb.url, r.imdb.search ? T('Buscar en IMDb') : T('IMDb no deja leer su nota desde aquí: ábrelo para verla (después de entrar una vez en imdb.com suele funcionar)')));
  if (r.rt) {
    if (r.rt.critics != null) chips.push(chip('rt' + (r.rt.critics >= 60 ? ' fresh' : ' rotten'), '🍅 ' + T('Crítica'), r.rt.critics + '%', r.rt.criticsCount ? TN(r.rt.criticsCount, '{0} reseña', '{0} reseñas') : '', r.rt.url, 'Rotten Tomatoes · Tomatometer'));
    if (r.rt.audience != null) chips.push(chip('rt pop', '🍿 ' + T('Público'), r.rt.audience + '%', '', r.rt.url, 'Rotten Tomatoes · Popcornmeter'));
    if (r.rt.critics == null && r.rt.audience == null) chips.push(chip('rt', 'Rotten Tomatoes', '↗', '', r.rt.url));
  }
  if (chips.length && r.found) out.push(h('div', { class: 'rchips' }, chips));
  if (!r.found) {
    const q = encodeURIComponent(t.title);
    out.push(h('div', { class: 'tinfo-empty' }, T('No he encontrado «{0}» en FilmAffinity ni en Rotten Tomatoes. Búscalo tú:', t.title || t.pid), ' ',
      h('a', { href: 'https://www.filmaffinity.com/es/search.php?stext=' + q, target: '_blank', rel: 'noopener' }, 'FilmAffinity'), ' · ',
      h('a', { href: 'https://www.imdb.com/find/?q=' + q, target: '_blank', rel: 'noopener' }, 'IMDb'), ' · ',
      h('a', { href: 'https://www.rottentomatoes.com/search?search=' + q, target: '_blank', rel: 'noopener' }, 'Rotten Tomatoes')));
  }
  if (r.where && r.where.offers && r.where.offers.length) out.push(whereEl(r.where, t));
  const rows = [];
  const row = (k, v) => { if (v && String(v).trim()) rows.push(h('dt', {}, k), h('dd', {}, v)); };
  if (r.original && SB.cleanTitle(r.original).toLowerCase() !== String(t.title || '').toLowerCase()) row(T('Título original'), r.original);
  row(T('Año'), r.year ? String(r.year) : '');
  row(T('Duración'), r.runtime ? (t.type === 'series' ? T('{0} min por episodio', r.runtime) : r.runtime >= 60 ? T('{0} h {1} min', Math.floor(r.runtime / 60), r.runtime % 60) : T('{0} min', r.runtime)) : '');
  row(T('País'), (r.countries || []).join(', '));
  row(t.type === 'series' ? T('Creación') : T('Dirección'), (r.directors || []).join(', '));
  row(T('Reparto'), (r.cast || []).join(', '));
  row(T('Géneros'), (r.genres || []).join(', '));
  if (rows.length) out.push(h('dl', { class: 'tinfo-dl' }, rows));
  if (r.plot) {
    const p = h('p', { class: 'tinfo-plot clamp' }, r.plot);
    p.onclick = () => p.classList.toggle('clamp');
    p.title = T('Pulsa para leerla entera');
    out.push(p);
  }
  out.push(h('div', { class: 'tinfo-foot' },
    h('small', {}, T('Datos de FilmAffinity, IMDb, Rotten Tomatoes y JustWatch · {0}', new Date(r.at).toLocaleDateString(T.locale(), { day: 'numeric', month: 'short' }))),
    h('button', { class: 'icon-btn', title: T('Volver a buscar'), onclick: () => openInfo(btn, t, true, true) }, '⟳')));
  return out;
}

// ---------- Seguimiento de series ----------
const fmtDate = ms => ms ? new Date(ms).toLocaleDateString(T.locale(), { day: 'numeric', month: 'short', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '';
function renderFollow(main) {
  const fol = state.follow || {};
  main.append(h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico' }, SB.svgEl('campana', 24, '#fff')), T('Siguiendo')));
  main.append(h('p', { class: 'muted', style: 'max-width:800px;margin:-12px 0 22px' },
    T('Las series que sigues y lo último que se sabe de ellas. StreamBox las comprueba cada 6 horas (y al entrar en la plataforma): cuando sale un episodio o una temporada nueva, la serie brilla aquí y en el icono de la extensión aparece un número.')));
  const status = h('span', { class: 'muted f-count' });
  chrome.storage.local.get('followCheckedAt').then(({ followCheckedAt }) => { if (followCheckedAt) status.textContent = T('Última comprobación: {0}', new Date(followCheckedAt).toLocaleString(T.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })); });
  const keys = Object.keys(fol).filter(k => state.titles[k]);
  const checkBtn = h('button', { class: 'primary', disabled: !keys.length }, '⟳ ' + T('Comprobar ahora'));
  checkBtn.onclick = async () => {
    checkBtn.disabled = true; checkBtn.textContent = T('Comprobando…');
    const r = await chrome.runtime.sendMessage({ type: 'followCheck' });
    state = await SB.load(); render();
    toastM(r && r.nuevos ? TN(r.nuevos, '{0} serie con novedades', '{0} series con novedades') : T('Sin novedades'));
  };
  const anyNew = keys.some(k => fol[k].isNew);
  main.append(h('div', { class: 'toolbar' }, checkBtn,
    anyNew ? h('button', { class: 'secondary', onclick: async () => { keys.forEach(k => { fol[k].isNew = false; delete fol[k].newSince; }); await persist(['follow']); render(); } }, '✓ ' + T('Marcar todo como visto')) : null,
    status));
  const box = h('div', { class: 'qlist flist' });
  const order = keys.sort((a, b) => (fol[b].isNew - fol[a].isNew) || ((fol[b].newSince || 0) - (fol[a].newSince || 0)) || ((fol[b].latest || fol[b].detectedAt || 0) - (fol[a].latest || fol[a].detectedAt || 0)));
  for (const k of order) {
    const t = state.titles[k], rec = fol[k];
    const p = SBP.get(t.platform) || SB_PLATFORMS[t.platform] || { name: t.platform };
    const epsNow = rec.lastSeason && rec.eps && rec.eps[rec.lastSeason] != null ? rec.eps[rec.lastSeason] : rec.eps && rec.eps.total;
    const what = [rec.lastSeason && !/^T\d+$/.test(rec.lastSeason) ? rec.lastSeason : rec.seasons ? TN(rec.seasons, '{0} temporada', '{0} temporadas') : '',
      epsNow != null ? TN(epsNow, '{0} episodio', '{0} episodios') : ''].filter(Boolean).join(' · ');
    const when = rec.latest ? T('Último episodio: {0}', fmtDate(rec.latest)) : rec.detectedAt ? T('Comprobado desde el {0}', fmtDate(rec.added || rec.detectedAt)) : '';
    const next = rec.next && rec.next > Date.now() ? T('Próximo: {0}', fmtDate(rec.next)) : '';
    const clear = async () => { rec.isNew = false; delete rec.newSince; await persist(['follow']); };
    const row = h('div', { class: 'qrow frow' + (rec.isNew ? ' is-new' : '') },
      h('a', { class: 'qthumb', href: SB.playUrl(t), target: '_blank', rel: 'noopener', onclick: clear },
        t.img ? h('img', { src: t.img, alt: '', referrerpolicy: 'no-referrer' }) : h('div', { class: 'tph' }, h('span', {}, t.title || t.pid))),
      h('div', { class: 'qinfo' },
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' },
          h('a', { class: 'tname', href: SB.playUrl(t), target: '_blank', rel: 'noopener', onclick: clear }, t.title || t.pid),
          rec.isNew ? h('span', { class: 'fnew', title: rec.newSince ? T('Desde el {0}', fmtDate(rec.newSince)) : '' }, '✨ ' + (rec.newWhat === 'season' ? T('¡Temporada nueva!') : T('¡Episodios nuevos!'))) : null),
        h('small', {}, SB.platformBadge(t.platform, true), ' ', what || T('Aún sin datos')),
        h('small', { class: 'fwhen' }, [when, next].filter(Boolean).join(' · ') ||
          (p.followCheck ? T('Pendiente de comprobar') : T('Se comprueba cuando abres la serie en {0}', p.name))),
        rec.error ? h('small', { class: 'ferr' }, '⚠ ' + rec.error) : null),
      rec.isNew ? h('button', { class: 'secondary', onclick: async () => { await clear(); render(); } }, '✓ ' + T('Visto')) : null,
      h('a', { class: 'primary small-btn', href: SB.playUrl(t), target: '_blank', rel: 'noopener', onclick: clear }, '▶ ' + T('Ver')),
      h('button', { class: 'icon-btn', title: T('Dejar de seguir'), onclick: async () => { SB.unfollow(state, k); await persist(['follow', 'titles']); render(); } }, '✕'));
    box.append(row);
  }
  if (!keys.length) box.append(h('div', { class: 'empty' }, T('Aún no sigues ninguna serie. Pulsa «🔔 Seguir» en el menú de StreamBox de una serie (en la plataforma) o la campana de su tarjeta aquí en el gestor.')));
  main.append(box);
}

// ---------- Cola de reproducción ----------
const EPS = [1, 2, 3, 4, 5, 6, 8, 10, 0];
function playQueueFromManager() {
  const fi = SB.queueFirst(state), first = fi && state.titles[fi.k];
  if (!first) return;
  Object.assign(state.queue, { playing: true, epIds: [], hold: '', startedAt: Date.now(), autoplay: { k: fi.k, at: Date.now() } });
  persist(['queue']).then(() => window.open(SB.playUrl(first), '_blank'));
  renderSide(); render();
}
function renderQueue(main) {
  const q = state.queue;
  main.append(h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico' }, SB.svgEl('play', 24, '#fff')), T('Cola de reproducción')));
  main.append(h('p', { class: 'muted', style: 'max-width:780px;margin:-12px 0 22px' },
    T('Pon en orden lo que quieres ver seguido. Al terminar cada película (o los episodios que elijas de cada serie) se abre el siguiente título con una cuenta atrás de 8 segundos que puedes cancelar. Lo que terminas se queda en su sitio en blanco y negro.')));
  main.append(h('div', { class: 'qnotice', role: 'note' }, h('span', { class: 'qn-ico' }, 'i'),
    h('div', {}, h('b', {}, T('A veces tendrás que darle al play tú')), ' ',
      T('Algunas plataformas no dejan que una extensión empiece a reproducir sola: StreamBox abre el título siguiente y lo intenta, pero si el navegador o la plataforma lo bloquean, se quedará en la ficha o en pausa y tendrás que pulsar «Reproducir» manualmente. Pasa sobre todo en Disney+, Movistar Plus+ y cuando el navegador bloquea el sonido automático.'))));
  const maraSlot = h('div'); main.append(maraSlot);
  marathonSection(maraSlot).catch(e => console.warn('[StreamBox] maratones', e));
  const pending = SB.queuePending(state), head = SB.queueFirst(state), seen = q.items.filter(i => i.done);
  const status = q.playing
    ? h('span', { class: 'qstatus on' }, '● ' + T('En marcha'))
    : h('span', { class: 'qstatus' }, pending.length ? T('En pausa') : q.items.length ? T('Todo visto') : '');
  main.append(h('div', { class: 'toolbar' },
    h('button', { class: 'primary', disabled: !pending.length, onclick: playQueueFromManager }, q.playing ? '▶ ' + T('Volver a abrir el actual') : '▶ ' + T('Reproducir la cola')),
    q.playing ? h('button', { class: 'secondary', onclick: async () => { q.playing = false; await persist(['queue']); render(); } }, '■ ' + T('Pausar')) : null,
    q.items.length ? h('button', { class: 'danger', onclick: async () => {
      if (!confirm(T('¿Vaciar la cola?'))) return;
      q.items = []; q.playing = false; q.epIds = []; SB.dropOrphans(state); await persist(['queue', 'titles']); render();
    } }, T('Vaciar cola')) : null,
    seen.length ? h('button', { class: 'secondary', onclick: async () => {
      q.items = q.items.filter(i => !i.done); SB.dropOrphans(state); await persist(['queue', 'titles']); render();
    } }, T('Quitar los vistos ({0})', seen.length)) : null,
    status));
  const box = h('div', { class: 'qlist' });
  q.items.forEach((it, idx) => {
    const t = state.titles[it.k]; if (!t) return;
    const p = SBP.get(t.platform) || { name: t.platform };
    const thumb = h('a', { class: 'qthumb', href: SB.playUrl(t), target: '_blank', rel: 'noopener', draggable: 'false' },
      t.img ? h('img', { src: t.img, alt: '', referrerpolicy: 'no-referrer', draggable: 'false' }) : h('div', { class: 'tph' }, h('span', {}, t.title || t.pid)));
    let eps = null;
    if (t.type === 'series') {
      eps = h('select', { class: 'tv-select', title: T('Episodios que ver antes de pasar al siguiente') },
        ...EPS.map(n => h('option', { value: String(n) }, n ? TN(n, '{0} episodio', '{0} episodios') : T('Toda la serie'))));
      eps.value = String(it.eps || 0);
      eps.onchange = async () => { it.eps = +eps.value; await persist(['queue']); };
    }
    const isNow = q.playing && head === it;
    const row = h('div', { class: 'qrow' + (isNow ? ' now' : '') + (it.done ? ' done' : ''), draggable: 'true' },
      h('span', { class: 'qnum' }, isNow ? '▶' : it.done ? '✓' : String(idx + 1)),
      thumb,
      h('div', { class: 'qinfo' },
        h('a', { class: 'tname', href: SB.playUrl(t), target: '_blank', rel: 'noopener' }, t.title || t.pid),
        h('small', {}, SB.platformBadge(t.platform, true), ' ', [SB.typeLabel(t.type), t.year].filter(Boolean).join(' · ') || p.name)),
      it.done ? h('span', { class: 'qseen' }, T('Visto') + (it.doneAt ? ' · ' + new Date(it.doneAt).toLocaleDateString(T.locale(), { day: 'numeric', month: 'short' }) : '')) : null,
      it.done ? h('button', { class: 'secondary', title: T('Volver a ponerlo sin ver en este sitio'), onclick: async () => { delete it.done; delete it.doneAt; await persist(['queue']); render(); } }, '↺ ' + T('Volver a ver'))
        : eps ? h('label', { class: 'row', style: 'gap:8px' }, h('span', { class: 'muted' }, T('Ver:')), eps) : h('span', { class: 'muted qmovie' }, t.type === 'movie' ? T('Película completa') : T('Hasta que termine')),
      h('button', { class: 'icon-btn', title: T('Quitar de la cola'), onclick: async () => { SB.queueRemove(state, it.k); await persist(['queue', 'titles']); render(); } }, '✕'));
    row.ondragstart = e => { e.dataTransfer.setData('text/sb-q', String(idx)); row.classList.add('dragging'); };
    row.ondragend = () => row.classList.remove('dragging');
    row.ondragover = e => { if (e.dataTransfer.types.includes('text/sb-q')) { e.preventDefault(); row.classList.add('drag-over'); } };
    row.ondragleave = () => row.classList.remove('drag-over');
    row.ondrop = async e => {
      e.preventDefault(); row.classList.remove('drag-over');
      const from = +e.dataTransfer.getData('text/sb-q');
      if (isNaN(from) || from === idx) return;
      const headBefore = head && head.k;
      const [m] = q.items.splice(from, 1); q.items.splice(idx, 0, m);
      const nh = SB.queueFirst(state);
      if ((nh && nh.k) !== headBefore) { q.epIds = []; q.hold = ''; }
      await persist(['queue']); render();
    };
    box.append(row);
  });
  if (!q.items.length) box.append(h('div', { class: 'empty' }, T('La cola está vacía. Añade títulos con el botón de cola de cada carátula, con «＋ Todo a la cola» en una lista o desde el menú de StreamBox dentro de las plataformas.')));
  main.append(box);
  if (q.items.length > 1) main.append(h('p', { class: 'muted hint', style: 'margin-top:14px' }, T('Arrastra las filas para cambiar el orden.')));
}

// ---------- Categorizar los títulos que aún no tienen géneros ----------
let categorizing = null;
function categorizeBtn() {
  const pending = Object.values(state.titles).filter(t => !(t.genres && t.genres.length) && !t.catsEdited && SBP.get(t.platform));
  const msg = h('span', { class: 'muted cat-progress' });
  if (categorizing) msg.textContent = categorizing.text;
  if (!pending.length && !categorizing) return h('span');
  const btn = h('button', { class: 'secondary', disabled: !!categorizing, title: T('Busca los géneros de cada título en su plataforma y lo mete en sus categorías') },
    '🏷 ' + (categorizing ? T('Categorizando…') : T('Categorizar mis títulos ({0})', pending.length)));
  btn.onclick = async () => {
    categorizing = { text: '' }; btn.disabled = true;
    let ok = 0, i = 0;
    for (const t of pending) {
      i++;
      categorizing.text = msg.textContent = T('{0} de {1}…', i, pending.length);
      try {
        const d = await SBP.get(t.platform).fetchMeta(t.pid);
        if (d && state.titles[t.key]) {
          SB.upsertTitle(state, Object.assign({ platform: t.platform, pid: t.pid }, d));
          if (d.genres && d.genres.length) ok++;
        }
      } catch (e) { console.warn('[StreamBox]', t.key, e); }
      if (i % 5 === 0) await persist(['titles']);
      await new Promise(r => setTimeout(r, 400));
    }
    categorizing = null;
    await persist(['titles']);
    render();
    toastM(T('Categorizados {0} de {1} títulos', ok, pending.length));
  };
  return h('div', { class: 'row', style: 'gap:10px' }, btn, msg);
}

// ---------- Editar un título ----------
function openEditor(t) {
  const p = SBP.get(t.platform) || { name: t.platform };
  const box = $('#editor .modal-box');
  const f = {
    title: h('input', { type: 'text', value: t.title || '' }),
    type: h('select', { class: 'tv-select' }, h('option', { value: '' }, '—'), h('option', { value: 'movie' }, T('Película')), h('option', { value: 'series' }, T('Serie'))),
    year: h('input', { type: 'text', value: t.year || '', maxlength: '4', inputmode: 'numeric', style: 'width:100px' }),
    img: h('input', { type: 'url', value: t.img || '' }),
    url: h('input', { type: 'url', value: t.url || '' }),
    note: h('textarea', { rows: '3', maxlength: '1000', placeholder: T('Mis notas (quién me lo recomendó, por qué capítulo voy…)') }),
  };
  const catSet = new Set(t.cats || []);
  let catsEdited = !!t.catsEdited;
  const catBox = h('div', { class: 'edit-cats' });
  const drawCats = () => catBox.replaceChildren(...SB.CATS.map(c => {
    const b = h('button', { type: 'button', class: 'tcat' + (catSet.has(c.id) ? ' on' : '') }, c.icon + ' ' + T(c.label));
    b.onclick = () => { catSet.has(c.id) ? catSet.delete(c.id) : catSet.add(c.id); catsEdited = true; drawCats(); };
    return b;
  }));
  drawCats();
  const autoBtn = h('button', { type: 'button', class: 'secondary small', onclick: () => {
    catSet.clear(); SB.catsFromGenres(t.genres).forEach(c => catSet.add(c)); catsEdited = false; drawCats();
  } }, T('↺ Automáticas'));
  f.note.value = t.note || '';
  f.type.value = t.type || '';
  const prev = h('div', { class: 'edit-prev' });
  const drawPrev = () => prev.replaceChildren(f.img.value ? h('img', { src: f.img.value, referrerpolicy: 'no-referrer', alt: '' }) : h('div', { class: 'tph' }, h('span', {}, f.title.value || t.pid)));
  f.img.oninput = drawPrev; drawPrev();
  const msg = h('div', { class: 'msg' });
  const refetch = h('button', { class: 'secondary', onclick: async () => {
    if (!p.fetchMeta) return;
    refetch.disabled = true; msg.className = 'msg'; msg.textContent = T('Buscando en {0}…', p.name);
    try {
      const d = await p.fetchMeta(t.pid);
      if (d.title) f.title.value = d.title;
      if (d.type) f.type.value = d.type;
      if (d.year) f.year.value = d.year;
      if (d.img) f.img.value = d.img;
      if (d.genres && d.genres.length) { t._newGenres = d.genres; if (!catsEdited) { catSet.clear(); SB.catsFromGenres(d.genres).forEach(c => catSet.add(c)); drawCats(); } }
      drawPrev();
      msg.textContent = d.title ? T('✔ Datos recuperados. Revisa y pulsa Guardar.') : T('No se encontraron datos.');
    } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
    refetch.disabled = false;
  } }, T('↻ Recuperar datos de {0}', p.name));
  const row = (label, el) => h('label', { class: 'edit-row' }, h('span', {}, label), el);
  const close = () => $('#editor').classList.add('hidden');
  box.replaceChildren(
    h('div', { class: 'picker-head' }, SB.platformBadge(t.platform), h('b', { style: 'flex:1' }, T('Editar título')), h('button', { class: 'icon-btn', onclick: close, title: T('Cerrar') }, '✕')),
    h('div', { class: 'edit-body' }, prev, h('div', { class: 'edit-fields' },
      row(T('Título'), f.title),
      h('div', { class: 'row' }, row(T('Tipo'), f.type), row(T('Año'), f.year)),
      row(T('Carátula (URL de imagen)'), f.img),
      row(T('Enlace'), f.url),
      row(T('Notas'), f.note),
      h('div', { class: 'edit-row' }, h('span', { class: 'row', style: 'justify-content:space-between' }, T('Categorías'), autoBtn), catBox,
        t.genres && t.genres.length ? h('small', { class: 'muted' }, T('Géneros en {0}: {1}', p.name, t.genres.join(', '))) : h('small', { class: 'muted' }, T('Sin géneros todavía: pulsa «Recuperar datos» para buscarlos.'))),
      h('small', { class: 'muted' }, T('Plataforma: {0} · id {1}', p.name, t.pid)),
      h('div', { class: 'row' }, refetch), msg)),
    h('div', { class: 'picker-foot' }, h('span'), h('div', { class: 'row' },
      h('button', { class: 'secondary', onclick: close }, T('Cancelar')),
      h('button', { class: 'primary', onclick: async () => {
        const x = state.titles[t.key]; if (!x) return close();
        x.title = f.title.value.trim(); x.type = f.type.value; x.year = f.year.value.trim();
        x.img = f.img.value.trim(); x.note = f.note.value.trim();
        if (t._newGenres) x.genres = t._newGenres;
        x.cats = [...catSet]; x.catsEdited = catsEdited || undefined; if (!x.catsEdited) delete x.catsEdited;
        x.url = f.url.value.trim() || (p.titleUrl ? p.titleUrl(x.pid) : '');
        await persist(['titles']); close(); render();
      } }, T('Guardar')))));
  $('#editor').classList.remove('hidden');
  setTimeout(() => f.title.focus(), 0);
}

// ---------- Ajustes ----------
function renderSettings(main) {
  main.append(h('h1', {}, T('Ajustes')));
  const st = state.settings;
  let saveT;
  const saveLater = () => { clearTimeout(saveT); saveT = setTimeout(() => persist(['settings']), 300); };
  // ---- Apariencia
  const themeSeg = h('div', { class: 'theme-seg' });
  const drawTheme = () => themeSeg.replaceChildren(...[['light', T('☀️ Claro')], ['dark', T('🌙 Oscuro')], ['auto', T('🌓 Automático')]].map(([v, t]) =>
    h('button', { class: (st.theme || 'auto') === v ? 'on' : '', onclick: () => { st.theme = v; drawTheme(); applyTheme(); saveLater(); } }, t)));
  drawTheme();
  const picker = (key, idx) => {
    const inp = h('input', { type: 'color', value: st[key] || SB.DEFAULT_COLORS[idx] });
    const code = h('code', {}, inp.value);
    inp.oninput = () => { st[key] = inp.value; code.textContent = inp.value; applyTheme(); saveLater(); };
    return { el: h('div', { class: 'color-pick' }, inp, code), inp, code };
  };
  const p1 = picker('color1', 0), p2 = picker('color2', 1);
  const cards = [];
  cards.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, T('🎨 Apariencia')),
    h('p', {}, T('Elige el tema y los dos colores de la app. Se usan en degradado (el primero domina la mitad) en botones, etiquetas y títulos, aquí y dentro de las plataformas. «Automático» sigue el tema de tu sistema en el gestor; en las plataformas, que son oscuras, usa el oscuro.')),
    h('div', { class: 'set-row' }, h('label', { class: 'lbl' }, T('Tema')), themeSeg),
    h('div', { class: 'set-row' }, h('label', { class: 'lbl' }, T('Color 1')), p1.el, h('label', { class: 'lbl', style: 'min-width:auto;margin-left:14px' }, T('Color 2')), p2.el,
      h('button', { class: 'secondary', onclick: () => {
        st.color1 = SB.DEFAULT_COLORS[0]; st.color2 = SB.DEFAULT_COLORS[1];
        p1.inp.value = st.color1; p1.code.textContent = st.color1; p2.inp.value = st.color2; p2.code.textContent = st.color2;
        applyTheme(); saveLater();
      } }, T('Restablecer'))),
    h('div', { class: 'grad-preview' }, 'StreamBox')));
  // ---- Idioma
  const langSel = h('select', { class: 'tv-select', 'aria-label': T('Idioma') }, ...SB_LANGS.map(([v, n]) => h('option', { value: v }, n)));
  langSel.value = T.lang();
  langSel.onchange = async () => { st.lang = langSel.value; T.setLang(langSel.value); await persist(['settings']); translateStatic(); render(); };
  cards.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, T('🌐 Idioma')),
    h('div', { class: 'row' }, h('span', {}, T('Idioma de StreamBox (en el gestor y dentro de las plataformas):')), langSel)));
  // ---- En las plataformas
  const check = (get, set, title, desc) => {
    const cb = h('input', { type: 'checkbox' }); cb.checked = get();
    cb.onchange = () => { set(cb.checked); persist(['settings']); };
    return h('label', { class: 'set-check' }, cb, h('span', {}, h('b', {}, title), desc ? h('small', {}, desc) : null));
  };
  st.platforms = st.platforms || {};
  cards.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, T('📺 En las plataformas')),
    check(() => st.thumbButtons !== false, v => st.thumbButtons = v, T('Botón en las miniaturas'),
      T('Un botón pequeño en la esquina de cada carátula para añadir el título a tus listas. Si ya está en alguna, se ven sus iconos siempre; si no, el botón aparece al pasar el ratón. El botón de la ficha y de la vista previa sale siempre.')),
    h('div', { class: 'cat-title' }, T('Plataformas activas')),
    ...SBP.list().map(p => check(() => st.platforms[p.id] !== false, v => st.platforms[p.id] = v, h('span', { class: 'row', style: 'gap:8px' }, SB.platformBadge(p.id, true), p.name), null)),
    h('p', { class: 'muted', style: 'margin-bottom:0' }, T('Próximamente: Max.'))));
  // ---- Reproductor
  st.player = st.player || {};
  const pl = st.player;
  cards.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, T('▶️ Reproductor')),
    h('p', {}, T('Mientras ves algo, StreamBox puede pulsar por ti los botones de la plataforma. Se aplica al momento, sin recargar.')),
    check(() => !!pl.skipIntro, v => pl.skipIntro = v, T('Omitir la introducción'), T('Pulsa «Omitir introducción» en cuanto aparece.')),
    check(() => !!pl.skipRecap, v => pl.skipRecap = v, T('Omitir los resúmenes'), T('Pulsa «Omitir resumen» («Anteriormente en…») en cuanto aparece.')),
    check(() => !!pl.autoNext, v => pl.autoNext = v, T('Pasar automáticamente al siguiente episodio'), T('Al llegar a los créditos, pulsa «Siguiente episodio» sin esperar a la cuenta atrás.'))));
  if (typeof devicesCard === 'function') cards.push(devicesCard());
  cards.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, T('🔔 Avisos')),
    check(() => st.notify !== false, v => st.notify = v, T('Avisos del sistema'), T('Un aviso en el escritorio cuando una serie que sigues tiene episodios nuevos o cuando algo de tus listas está a punto de irse de su plataforma (7 días antes).'))));
  // ---- Cola
  const epsSel = h('select', { class: 'tv-select' }, ...EPS.map(n => h('option', { value: String(n) }, n ? TN(n, '{0} episodio', '{0} episodios') : T('Toda la serie'))));
  epsSel.value = String(st.queueEps != null ? st.queueEps : 1);
  epsSel.onchange = () => { st.queueEps = +epsSel.value; persist(['settings']); };
  cards.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, T('⏭ Cola de reproducción')),
    h('p', {}, T('Cuando añades una serie a la cola, cuántos episodios ver antes de pasar al siguiente título (luego puedes cambiarlo en cada serie).')),
    h('div', { class: 'row' }, h('span', {}, T('Episodios por serie:')), epsSel)));
  // ---- Sincronización
  const syncCb = h('input', { type: 'checkbox' }); syncCb.checked = !!st.sync;
  const syncMsg = h('div', { class: 'msg' });
  const showSync = async () => {
    const { syncStatus } = await chrome.storage.local.get('syncStatus');
    if (!syncStatus) { syncMsg.textContent = ''; return; }
    syncMsg.className = 'msg' + (syncStatus.error ? ' err' : '');
    syncMsg.textContent = (T(syncStatus.error) || ('✔ ' + T(syncStatus.ok))) + ' · ' + new Date(syncStatus.at).toLocaleString(T.locale());
  };
  syncCb.onchange = async () => { st.sync = syncCb.checked; await persist(['settings']); setTimeout(showSync, 1500); };
  showSync();
  cards.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, T('🔄 Sincronizar entre navegadores')),
    h('p', {}, T('Guarda tus listas y títulos en tu cuenta del navegador (Chrome o Edge con la sincronización activada, o Firefox con su cuenta) para tenerlos iguales en todos tus ordenadores. Si hay muchos títulos, las carátulas no se sincronizan: cada navegador las recupera al ver el título.')),
    h('div', { class: 'row' }, h('label', { class: 'row', style: 'gap:8px' }, syncCb, T('Activar sincronización')),
      h('button', { class: 'secondary', onclick: async () => {
        syncMsg.className = 'msg'; syncMsg.textContent = T('Sincronizando…');
        const r = await chrome.runtime.sendMessage({ type: 'syncNow' });
        if (r && r.skipped) { syncMsg.textContent = T('Activa primero la sincronización'); return; }
        setTimeout(showSync, 300);
      } }, T('⟳ Sincronizar ahora'))), syncMsg));
  // ---- Copia de seguridad
  const file = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden' });
  const msg = h('div', { class: 'msg' });
  file.onchange = async () => {
    try {
      const data = JSON.parse(await file.files[0].text());
      file.value = '';
      if (!Array.isArray(data.lists) || typeof data.titles !== 'object') throw new Error(T('Archivo no válido'));
      const merge = confirm(T('Aceptar = COMBINAR con lo que ya tienes.\nCancelar = REEMPLAZAR todo.'));
      if (merge) {
        for (const [k, t] of Object.entries(data.titles)) SB.upsertTitle(state, Object.assign({}, t, { key: k }));
        for (const l of data.lists) {
          const ex = state.lists.find(x => x.id === l.id);
          if (ex) { const have = new Set(ex.items.map(i => i.k)); ex.items.push(...l.items.filter(i => !have.has(i.k))); }
          else state.lists.push(l);
        }
        if (data.settings) { const { sync, ...rest } = data.settings; Object.assign(st, rest); }
      } else {
        state.lists = data.lists; state.titles = data.titles;
        if (data.settings) state.settings = Object.assign({}, st, data.settings, { sync: st.sync });
      }
      // El resto: el diario se suma día a día; lo demás se combina (o se reemplaza)
      const extra = {};
      const cur = await chrome.storage.local.get(EXTRA_KEYS);
      for (const k of EXTRA_KEYS) {
        if (data[k] == null) continue;
        if (k === 'history' && merge && cur.history) {
          const hst = cur.history;
          for (const [d, day] of Object.entries(data.history.days || {})) {
            const mine = hst.days[d] || (hst.days[d] = {});
            for (const [tk, v] of Object.entries(day)) { const m = mine[tk] || (mine[tk] = { m: 0, eps: [] }); m.m = Math.max(m.m, v.m || 0); m.eps = [...new Set([...(m.eps || []), ...(v.eps || [])])]; }
          }
          Object.assign(hst.titles, data.history.titles || {});
          extra.history = hst;
        } else if (merge && cur[k] && !Array.isArray(cur[k]) && typeof cur[k] === 'object' && k !== 'queue') extra[k] = Object.assign({}, data[k], cur[k]);
        else if (!merge || cur[k] == null) extra[k] = data[k];
      }
      if (extra.queue) state.queue = extra.queue;
      if (extra.follow) state.follow = extra.follow;
      if (Object.keys(extra).length) await chrome.storage.local.set(extra);
      SB.dropOrphans(state);
      await persist(); T.setLang(state.settings.lang); applyTheme(); translateStatic(); render();
      toastM(T('✔ Importado'));
    } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
  };
  cards.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, T('💾 Copia de seguridad')),
    h('p', {}, T('Guarda en un archivo JSON toda tu configuración: listas, iconos, títulos, idioma, tema, colores y opciones. Al importarlo se restaura todo (también en otro navegador).')),
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: async () => {
        // También el diario, el seguimiento, la cola, los marcadores, los maratones y las listas compartidas
        const extra = await chrome.storage.local.get(EXTRA_KEYS);
        const blob = new Blob([JSON.stringify(Object.assign({ app: 'StreamBox', version: 1, exportedAt: new Date().toISOString(), lists: state.lists, titles: state.titles, settings: Object.assign({}, st, { sync: undefined }) }, extra), null, 2)], { type: 'application/json' });
        h('a', { href: URL.createObjectURL(blob), download: `streambox-${new Date().toISOString().slice(0, 10)}.json` }).click();
      } }, T('⬇ Exportar JSON')),
      h('button', { class: 'secondary', onclick: () => file.click() }, T('⬆ Importar JSON')), file), msg));
  cards.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, T('Borrar todo')),
    h('p', {}, T('Elimina todas las listas y títulos guardados.')),
    h('button', { class: 'danger', onclick: async () => {
      if (!confirm(T('¿Seguro? Se borrarán todas las listas y títulos.'))) return;
      state.lists = []; state.titles = {}; await persist(['lists', 'titles']); render();
    } }, T('Borrar todo'))));
  main.append(h('div', { class: 'set-layout' },
    h('div', { class: 'set-col' }, ...cards),
    h('aside', { class: 'set-aside' },
      h('div', { class: 'card' }, h('div', { class: 'kofi-ico', 'aria-hidden': 'true' }, '☕'), h('h3', { style: 'margin-top:0' }, T('Apoya StreamBox')),
        h('p', {}, T('StreamBox es gratis y sin anuncios. Si te resulta útil y quieres invitarme a un café para que siga mejorándolo, puedes hacerlo en Ko-fi. ¡Muchas gracias!')),
        h('a', { class: 'primary kofi-btn', href: 'https://ko-fi.com/dani9del9', target: '_blank', rel: 'noopener noreferrer' }, T('☕ Invítame a un café en Ko-fi'))))));
}

const EXTRA_KEYS = ['history', 'follow', 'queue', 'bookmarks', 'marathons', 'shared', 'devices'];

// ---------- Ayuda ----------
function richText(t) {
  const out = []; const re = /\*\*(.+?)\*\*/g; let last = 0, m;
  while ((m = re.exec(t))) { if (m.index > last) out.push(t.slice(last, m.index)); out.push(h('b', {}, m[1])); last = re.lastIndex; }
  if (last < t.length) out.push(t.slice(last));
  return out;
}
function renderHelp(main) {
  const q = h('input', { type: 'search', placeholder: T('Buscar en la ayuda…'), class: 'help-search' });
  const toc = h('nav', { class: 'help-toc', 'aria-label': T('Índice de la ayuda') });
  const body = h('div', { class: 'help-body' });
  const blockEl = b => {
    if (typeof b === 'string') return h('p', {}, ...richText(b));
    if (b[0] === 'ul') return h('ul', {}, ...b.slice(1).map(li => h('li', {}, ...richText(li))));
    if (b[0] === 'tip') return h('div', { class: 'help-tip' }, h('span', { class: 'help-tip-ico' }, '💡'), h('p', {}, ...richText(b[1])));
    return null;
  };
  const textOf = s => (s.title + ' ' + JSON.stringify(s.blocks)).toLowerCase().replace(/\*\*/g, '');
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    const help = SB_HELP.map(s => ({ ...s, title: T(s.title), blocks: s.blocks.map(b => typeof b === 'string' ? T(b) : [b[0], ...b.slice(1).map(x => T(x))]) }));
    const list = help.filter(s => !t || textOf(s).includes(t));
    toc.replaceChildren(...list.map(s => h('a', { href: '#help=' + s.id, onclick: e => { e.preventDefault(); $('#help-' + s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
      h('span', { class: 'mode-ico small plain' }, SB.svgEl(s.icon, 16, 'currentColor')), s.title)));
    body.replaceChildren(...(list.length ? list.map(s => h('section', { class: 'card help-sec', id: 'help-' + s.id },
      h('h2', {}, h('span', { class: 'mode-ico' }, SB.svgEl(s.icon, 22, '#ffffff')), s.title), ...s.blocks.map(blockEl).filter(Boolean)))
      : [h('div', { class: 'card muted' }, T('No hay nada en la ayuda que coincida con tu búsqueda.'))]));
  };
  q.oninput = draw;
  draw();
  main.append(
    h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico' }, SB.svgEl('ayuda', 24, '#ffffff')), T('Ayuda')),
    h('p', { class: 'muted', style: 'max-width:760px;margin:-12px 0 24px' }, T('Cómo funciona StreamBox y todas sus opciones.')),
    h('div', { class: 'help-layout' }, h('div', { class: 'help-side' }, q, toc), body));
  if (view.section) setTimeout(() => $('#help-' + view.section)?.scrollIntoView({ block: 'start' }), 0);
}

// ---------- Selector de iconos ----------
const picker = { list: null, draft: null, color: null, tab: 'emoji', cat: 'all', q: '' };

function openPicker(l) {
  picker.list = l;
  picker.draft = Object.assign({ type: 'emoji', value: '🎬' }, JSON.parse(JSON.stringify(l.icon || {})));
  picker.color = l.color || PALETTE[0];
  picker.tab = picker.draft.type === 'image' && picker.draft.fromTitle ? 'poster' : (['emoji', 'svg', 'text', 'image'].includes(picker.draft.type) ? picker.draft.type : 'emoji');
  $('#picker').classList.remove('hidden');
  $('#pickColor').value = picker.color;
  $('#pickBg').checked = !!picker.draft.bg;
  $('#pickRound').checked = !!picker.draft.round;
  renderSwatches(); renderRecent(); renderPickerTab(); updatePreview();
}
function closePicker() { $('#picker').classList.add('hidden'); }
function updatePreview() {
  $('#pickPreview').replaceChildren(SB.iconEl({ icon: picker.draft, color: picker.color }, 48));
  $$('#pickTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === picker.tab));
}
function setDraft(icon) {
  picker.draft = Object.assign({}, icon, { bg: $('#pickBg').checked, round: $('#pickRound').checked });
  updatePreview();
  $$('#pickBody .igrid button').forEach(b => b.classList.toggle('on', b.dataset.v === icon.value && b.dataset.t === icon.type));
}
function renderSwatches() {
  $('#swatches').replaceChildren(...PALETTE.map(c => {
    const b = h('button', { style: 'background:' + c, class: c === picker.color ? 'on' : '' });
    b.onclick = () => { picker.color = c; $('#pickColor').value = c; renderSwatches(); updatePreview(); if (picker.tab === 'svg') renderPickerTab(); };
    return b;
  }));
}
function renderRecent() {
  const rec = state.settings.recentIcons || [];
  const box = $('#recent');
  box.replaceChildren();
  if (!rec.length) return;
  box.append(h('span', { class: 'l' }, T('Recientes')));
  rec.forEach(r => {
    const b = h('button', { class: 'icon-btn', style: 'width:38px;height:38px;display:flex;align-items:center;justify-content:center' }, SB.iconEl({ icon: r.icon, color: r.color }, 26));
    b.onclick = () => { picker.color = r.color; $('#pickColor').value = r.color; $('#pickBg').checked = !!r.icon.bg; $('#pickRound').checked = !!r.icon.round; renderSwatches(); setDraft(r.icon); };
    box.append(b);
  });
}
function renderPickerTab() {
  const body = $('#pickBody');
  body.replaceChildren();
  const count = $('#pickCount');
  count.textContent = '';
  if (picker.tab === 'emoji') {
    const total = EMOJI_DATA.reduce((n, c) => n + c.items.length, 0);
    count.textContent = T('{0} emojis disponibles', total);
    const q = h('input', { type: 'search', placeholder: T('Buscar emoji en inglés (popcorn, tree, ghost…)'), style: 'width:100%', value: picker.q });
    const cats = h('div', { class: 'cat-tabs' },
      h('button', { class: picker.cat === 'all' ? 'on' : '', onclick: () => { picker.cat = 'all'; renderPickerTab(); } }, T('Todos')),
      ...EMOJI_DATA.map(c => h('button', { class: picker.cat === c.key ? 'on' : '', onclick: () => { picker.cat = c.key; renderPickerTab(); } }, c.items[0][0] + ' ' + T(c.label))));
    const area = h('div');
    const fill = () => {
      const s = picker.q.toLowerCase().trim();
      area.replaceChildren();
      for (const c of EMOJI_DATA) {
        if (picker.cat !== 'all' && c.key !== picker.cat && !s) continue;
        const items = s ? c.items.filter(i => i[1].includes(s) || i[0] === s) : c.items;
        if (!items.length) continue;
        area.append(h('div', { class: 'cat-title' }, `${T(c.label)} (${items.length})`));
        const grid = h('div', { class: 'igrid' });
        for (const [e, n] of items) {
          const b = h('button', { title: n, 'data-v': e, 'data-t': 'emoji', class: picker.draft.type === 'emoji' && picker.draft.value === e ? 'on' : '' }, e);
          b.onclick = () => setDraft({ type: 'emoji', value: e });
          b.ondblclick = applyPicker;
          grid.append(b);
        }
        area.append(grid);
      }
      if (!area.children.length) area.append(h('div', { class: 'empty' }, T('Sin resultados. Prueba con otra palabra en inglés.')));
    };
    q.oninput = () => { picker.q = q.value; fill(); };
    body.append(q, cats, area); fill();
    setTimeout(() => q.focus(), 0);
  } else if (picker.tab === 'svg') {
    const names = Object.keys(SVG_ICONS);
    count.textContent = T('{0} iconos de línea (se pintan con el color elegido)', names.length);
    const q = h('input', { type: 'search', placeholder: T('Buscar icono (peli, palomitas, corazon…)'), style: 'width:100%;margin-bottom:12px' });
    const grid = h('div', { class: 'igrid svg' });
    const fill = () => {
      const s = q.value.toLowerCase();
      grid.replaceChildren(...names.filter(n => n.includes(s)).map(n => {
        const b = h('button', { title: n, 'data-v': n, 'data-t': 'svg', class: picker.draft.type === 'svg' && picker.draft.value === n ? 'on' : '' },
          SB.iconEl({ icon: { type: 'svg', value: n }, color: picker.color }, 30), n);
        b.onclick = () => setDraft({ type: 'svg', value: n });
        b.ondblclick = applyPicker;
        return b;
      }));
    };
    q.oninput = fill; body.append(q, grid); fill();
  } else if (picker.tab === 'text') {
    const t = h('input', { type: 'text', maxlength: '3', placeholder: 'AB', value: picker.draft.type === 'text' ? picker.draft.value : picker.list.name.slice(0, 2).toUpperCase(), style: 'font-size:28px;width:140px;text-align:center' });
    t.oninput = () => setDraft({ type: 'text', value: t.value });
    body.append(h('p', { class: 'muted' }, T('Escribe hasta 3 letras, números o símbolos. Activa «Fondo de color» para que parezca una insignia.')), t);
    setDraft({ type: 'text', value: t.value });
    setTimeout(() => t.focus(), 0);
  } else if (picker.tab === 'image') {
    const file = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
    const drop = h('div', { class: 'drop' }, T('Arrastra aquí una imagen (PNG, JPG, GIF, SVG, WebP)'), h('br'), h('br'), h('button', { class: 'secondary', onclick: () => file.click() }, T('Elegir archivo…')));
    const handle = async f => { if (f && f.type.startsWith('image/')) setDraft({ type: 'image', value: await shrinkImage(f) }); };
    file.onchange = () => handle(file.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); handle(e.dataTransfer.files[0]); };
    const url = h('input', { type: 'url', placeholder: T('https://… o pega una imagen con Ctrl+V'), style: 'flex:1' });
    url.onchange = () => url.value && setDraft({ type: 'image', value: url.value });
    url.onpaste = async e => { const it = [...e.clipboardData.items].find(i => i.type.startsWith('image/')); if (it) { e.preventDefault(); handle(it.getAsFile()); } };
    body.append(drop, file, h('div', { class: 'row' }, h('span', {}, T('O desde una URL:')), url));
  } else if (picker.tab === 'poster') {
    const all = Object.values(state.titles).filter(t => t.img);
    const mine = all.filter(t => picker.list.items.some(i => i.k === t.key));
    const rest = all.filter(t => !picker.list.items.some(i => i.k === t.key));
    count.textContent = T('{0} carátulas de tus títulos', all.length);
    const mk = list => h('div', { class: 'igrid posters' }, list.map(t => {
      const b = h('button', { title: t.title, 'data-v': t.img, 'data-t': 'image', class: picker.draft.value === t.img ? 'on' : '' },
        h('img', { src: t.img, referrerpolicy: 'no-referrer', alt: '' }));
      b.onclick = () => setDraft({ type: 'image', value: t.img, fromTitle: true });
      b.ondblclick = applyPicker;
      return b;
    }));
    if (!all.length) body.append(h('div', { class: 'empty' }, T('Guarda títulos para usar sus carátulas como icono.')));
    if (mine.length) body.append(h('div', { class: 'cat-title' }, T('Títulos de esta lista')), mk(mine));
    if (rest.length) body.append(h('div', { class: 'cat-title' }, T('Otros títulos')), mk(rest));
  }
  updatePreview();
}
function shrinkImage(file, size = 96) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      res(c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', .9));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
async function applyPicker() {
  const l = picker.list;
  l.icon = Object.assign({}, picker.draft, { bg: $('#pickBg').checked, round: $('#pickRound').checked });
  l.color = picker.color;
  const rec = (state.settings.recentIcons || []).filter(r => JSON.stringify(r.icon) !== JSON.stringify(l.icon) || r.color !== l.color);
  rec.unshift({ icon: l.icon, color: l.color });
  state.settings.recentIcons = rec.slice(0, 18);
  await persist(['lists', 'settings']);
  closePicker(); render();
}

// ---------- Eventos globales ----------
$('#newList').onclick = createList;
$('#importShared').onclick = () => importShared();
$$('.side-nav button').forEach(b => b.onclick = () => go({ name: b.dataset.view }));
$$('.side-nav .nav-ico').forEach(s => s.replaceWith(h('span', { class: 'mode-ico small plain' }, SB.svgEl(s.dataset.ico, 16, 'currentColor'))));
$('#pickClose').onclick = closePicker;
$('#picker').onclick = e => { if (e.target.id === 'picker') closePicker(); };
$('#editor').onclick = e => { if (e.target.id === 'editor') $('#editor').classList.add('hidden'); };
$('#pickOk').onclick = applyPicker;
$('#pickTabs').onclick = e => { const b = e.target.closest('button'); if (b) { picker.tab = b.dataset.tab; renderPickerTab(); } };
$('#pickColor').oninput = e => { picker.color = e.target.value; renderSwatches(); updatePreview(); if (picker.tab === 'svg') renderPickerTab(); };
$('#pickBg').onchange = () => setDraft(picker.draft);
$('#pickRound').onchange = () => setDraft(picker.draft);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePicker(); $('#editor').classList.add('hidden'); } });

// Textos fijos de manager.html (data-i18n = texto en español; data-i18n-title para el title)
function translateStatic() {
  document.title = T('StreamBox — Gestor');
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const txt = [...el.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim());
    const val = T(el.dataset.i18n);
    if (txt) txt.textContent = (txt.textContent.match(/^\s*/)[0]) + val; else el.append(val);
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = T(el.dataset.i18nTitle);
  // La barra de abajo va en iconos: el nombre sale al pasar el ratón
  for (const el of document.querySelectorAll('.side-nav button')) { el.setAttribute('aria-label', T(el.dataset.i18n)); el.title = T(el.dataset.i18n); }
}
// Títulos guardados con un nombre que no lo es (p. ej. «6+», el sello de edad de Disney+): se buscan de nuevo
async function repairTitles() {
  // Nombres con texto pegado de la miniatura («… Calificación: 6+ Lanzamiento: 1997»): se limpian
  let cleaned = 0;
  for (const t of Object.values(state.titles)) { const c = SB.stripNoise(t.title); if (c && c !== t.title) { t.title = c; cleaned++; } }
  if (cleaned) { await persist(['titles']); render(); }
  const bad = Object.values(state.titles).filter(t => SB.badTitle(t.title) && SBP.get(t.platform));
  for (const t of bad) {
    try {
      const d = await SBP.get(t.platform).fetchMeta(t.pid);
      if (d && d.title && !SB.badTitle(d.title) && state.titles[t.key]) {
        const x = state.titles[t.key];
        x.title = d.title; if (d.img) x.img = d.img;
        SB.upsertTitle(state, Object.assign({ platform: x.platform, pid: x.pid }, d));
      }
    } catch (e) { console.warn('[StreamBox]', t.key, e); }
  }
  if (bad.length) { await persist(['titles']); render(); }
}
SB.load().then(s => { state = s; applyTheme(); translateStatic(); route(); repairTitles(); });
