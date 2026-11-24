// StreamBox — gestor de listas
let state = { lists: [], titles: {}, settings: {} };
let view = { name: 'list', id: null };
// Filtros de la vista actual (se conservan al cambiar de lista)
const ui = { q: '', platform: '', type: '', stars: '', listFilter: '', allSort: 'added' };

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
async function persist(keys = ['lists', 'titles', 'settings', 'queue']) {
  saving = true;
  const o = {}; keys.forEach(k => o[k] = state[k]);
  await SB.save(o);
  setTimeout(() => saving = false, 50);
}
chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area !== 'local' || saving || !(ch.lists || ch.titles || ch.settings || ch.queue)) return;
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
  else if (hash === 'settings') view = { name: 'settings' };
  else if (hash === 'help' || hash.startsWith('help=')) view = { name: 'help', section: hash.split('=')[1] || '' };
  else view = { name: 'list', id: null };
  render();
}
window.addEventListener('hashchange', route);
function go(v) {
  view = v;
  const hash = v.name === 'list' ? (v.id ? 'list=' + v.id : '') : v.name;
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
  $$('.side-nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view.name));
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
  if (view.name === 'queue') return renderQueue(main);
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
      h('li', {}, T('Entra en Netflix, Prime Video o Disney+: en cada miniatura, en la ficha y en el reproductor verás el botón de StreamBox para añadirlo a tus listas.')),
      h('li', {}, T('Vuelve aquí para ver, ordenar y editar tus listas. Al pulsar un título se abre en su plataforma.'))),
    h('button', { class: 'primary', onclick: createList }, T('+ Crear mi primera lista'))));
}

// ---------- Filtros comunes (buscador, plataforma, tipo) ----------
function filterBar(titles, onChange, extra = []) {
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
  return h('div', { class: 'toolbar filters' }, q, plats.length > 1 ? chips : null, seg, stars, ...extra);
}
function applyFilters(list) {
  const s = ui.q.trim().toLowerCase();
  return list.filter(t => {
    if (ui.platform && t.platform !== ui.platform) return false;
    if (ui.type && t.type !== ui.type) return false;
    if (ui.stars === 'none' && t.rating) return false;
    if (ui.stars && ui.stars !== 'none' && (t.rating || 0) < +ui.stars) return false;
    if (s && !(`${t.title} ${t.year} ${t.note || ''}`.toLowerCase().includes(s))) return false;
    return true;
  });
}
const filtersOn = () => !!(ui.q.trim() || ui.platform || ui.type || ui.stars);

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
};
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
  const badges = () => h('div', { class: 'tbadges' }, SB.platformBadge(t.platform));
  if (t.img) {
    const img = h('img', { src: t.img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', draggable: 'false' });
    img.onerror = fallback;
    poster.append(img, badges());
  } else fallback();
  poster.append(h('span', { class: 'tplay' }, '▶'));
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
  const actions = h('div', { class: 'tactions' },
    qBtn,
    h('button', { class: 'icon-btn', title: T('Editar datos'), onclick: () => openEditor(t) }, SB.svgEl('lapiz', 16, 'currentColor')),
    ctx.list
      ? h('button', { class: 'icon-btn', title: T('Quitar de esta lista'), onclick: removeFromCurrent }, '✕')
      : h('button', { class: 'icon-btn', title: T('Quitar de todas las listas'), onclick: async () => {
        if (!confirm(T('¿Quitar «{0}» de todas tus listas?', t.title || t.pid))) return;
        state.lists.forEach(l => l.items = l.items.filter(i => i.k !== t.key)); SB.dropOrphans(state);
        await persist(['lists', 'titles']); render();
      } }, '🗑'));
  const card = h('div', { class: 'tcard', draggable: 'true', 'data-k': t.key },
    poster,
    h('div', { class: 'tinfo' },
      h('a', { class: 'tname', href: url, target: '_blank', rel: 'noopener', draggable: 'false' }, t.title || t.pid),
      h('small', {}, meta || h('span', { class: 'tmissing', onclick: () => openEditor(t) }, T('Sin tipo ni año · completar'))),
      t.note ? h('div', { class: 'tnote', title: t.note, onclick: () => openEditor(t) }, '📝 ' + t.note) : null,
      SB.starsEl(t.rating || 0, async v => {
        const x = state.titles[t.key]; if (!x) return;
        x.rating = v; await persist(['titles']);
        if (ui.stars) render();
      }, 17)),
    h('div', { class: 'tfoot' }, lists, actions));
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
function renderList(main, l) {
  const name = h('input', { type: 'text', class: 'name-input', value: l.name, maxlength: '60' });
  name.oninput = () => { l.name = name.value; renderSide(); };
  name.onchange = () => persist(['lists']);
  const iconBtn = h('button', { class: 'big-icon', title: T('Cambiar icono') }, SB.iconEl(l, 64));
  iconBtn.onclick = () => openPicker(l);
  main.append(h('div', { class: 'editor-top' }, iconBtn, name,
    h('button', { class: 'danger', onclick: async () => {
      if (!confirm(T('¿Borrar la lista «{0}»? Los títulos que solo estén en esta lista se olvidarán.', l.name))) return;
      state.lists = state.lists.filter(x => x.id !== l.id); SB.dropOrphans(state); view.id = null;
      await persist(['lists', 'titles']); go({ name: 'list', id: null });
    } }, T('Borrar lista'))));

  const all = titlesOf(l);
  const sort = l.sort && SORTS[l.sort] ? l.sort : 'manual';
  const grid = h('div', { class: 'tgrid' });
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
    if (!all.length) grid.append(h('div', { class: 'empty' }, T('Esta lista está vacía. Añade títulos desde Netflix, Prime Video o Disney+ con el botón de StreamBox o pega aquí abajo el enlace de un título.')));
    else if (!list.length) grid.append(h('div', { class: 'empty' }, T('Ningún título coincide con los filtros.')));
  };
  const queueAll = h('button', { class: 'secondary', title: T('Añade a la cola los títulos que se ven, en este orden') }, '＋ ' + T('Todo a la cola'));
  queueAll.onclick = async () => {
    const before = state.queue.items.length;
    shown.forEach(t => SB.queueAdd(state, t));
    await persist(['queue', 'titles']); renderSide();
    toastM(T('{0} títulos añadidos a la cola', state.queue.items.length - before));
  };
  main.append(h('div', { class: 'section-head' }, h('h3', {}, T('Títulos')), h('div', { class: 'row', style: 'gap:14px' }, count, all.length ? queueAll : null)),
    filterBar(all, fill, [sortSelect(sort, Object.keys(SORTS), async v => { l.sort = v; await persist(['lists']); render(); })]));
  if (sort === 'manual' && all.length > 1) main.append(h('p', { class: 'muted hint' }, T('Arrastra las carátulas para cambiar el orden. También puedes soltarlas sobre otra lista del menú lateral para añadirlas allí.')));
  main.append(grid);
  fill();
  main.append(addByLink(l));
}

// Añadir un título pegando su enlace
function addByLink(l) {
  const url = h('input', { type: 'url', placeholder: T('Pega el enlace de un título de Netflix, Prime Video o Disney+'), style: 'flex:1;min-width:320px' });
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
    const link = r.platform === 'netflix' ? '' : url.value.trim().split(/[?#]/)[0].replace(/\/ref=.*$/, '');
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
function renderAll(main) {
  const all = titlesOf(null);
  main.append(h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico' }, SB.svgEl('cuadricula', 24, '#fff')), T('Todos los títulos')));
  const listSel = h('select', { class: 'tv-select', title: T('Lista') },
    h('option', { value: '' }, T('Todas las listas')), ...state.lists.map(l => h('option', { value: l.id }, l.name)));
  if (ui.listFilter && !state.lists.some(l => l.id === ui.listFilter)) ui.listFilter = '';
  listSel.value = ui.listFilter;
  const grid = h('div', { class: 'tgrid' });
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
  main.append(h('p', { class: 'muted', style: 'margin:-12px 0 24px' }, T('Todo lo que has guardado, de todas las plataformas. Pulsa los iconos de cada título para meterlo o sacarlo de tus listas.')),
    h('div', { class: 'section-head', style: 'margin-top:0' }, h('span'), count),
    filterBar(all, fill, [listSel, sortSelect(ui.allSort, Object.keys(SORTS).filter(k => k !== 'manual'), v => { ui.allSort = v; fill(); })]),
    grid);
  fill();
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
      h('small', { class: 'muted' }, T('Plataforma: {0} · id {1}', p.name, t.pid)),
      h('div', { class: 'row' }, refetch), msg)),
    h('div', { class: 'picker-foot' }, h('span'), h('div', { class: 'row' },
      h('button', { class: 'secondary', onclick: close }, T('Cancelar')),
      h('button', { class: 'primary', onclick: async () => {
        const x = state.titles[t.key]; if (!x) return close();
        x.title = f.title.value.trim(); x.type = f.type.value; x.year = f.year.value.trim();
        x.img = f.img.value.trim(); x.note = f.note.value.trim(); x.url = f.url.value.trim() || (p.titleUrl ? p.titleUrl(x.pid) : '');
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
      SB.dropOrphans(state);
      await persist(); T.setLang(state.settings.lang); applyTheme(); translateStatic(); render();
      toastM(T('✔ Importado'));
    } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
  };
  cards.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, T('💾 Copia de seguridad')),
    h('p', {}, T('Guarda en un archivo JSON toda tu configuración: listas, iconos, títulos, idioma, tema, colores y opciones. Al importarlo se restaura todo (también en otro navegador).')),
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: () => {
        const blob = new Blob([JSON.stringify({ app: 'StreamBox', version: 1, exportedAt: new Date().toISOString(), lists: state.lists, titles: state.titles, settings: Object.assign({}, st, { sync: undefined }) }, null, 2)], { type: 'application/json' });
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
}
SB.load().then(s => { state = s; applyTheme(); translateStatic(); route(); });
