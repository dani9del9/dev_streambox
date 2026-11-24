// StreamBox — script de contenido común a todas las plataformas.
// El adaptador de la plataforma (platforms/<id>.js) dice dónde están los títulos (cards) y dónde poner
// los botones en línea (spots); aquí se pintan los botones y el menú de listas.
(() => {
  const P = SBP.forHost(location.hostname);
  if (!P) return;
  let state = { lists: [], titles: {}, settings: {} };
  let lastHover = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(k));
    return el;
  };
  const enabled = () => (state.settings.platforms || {})[P.id] !== false;

  // ---------- Tema ----------
  function applyTheme() {
    const dark = SB.isDark(state.settings, P.dark ? P.dark() : true);
    const v = SB.themeVars(state.settings, dark);
    let st = document.getElementById('sb-theme-style');
    if (!st) { st = document.createElement('style'); st.id = 'sb-theme-style'; (document.head || document.documentElement).append(st); }
    st.textContent = `html:root{--sb-bg:${v.bg};--sb-panel:${v.panel};--sb-panel2:${v.panel2};--sb-line:${v.line};--sb-txt:${v.txt};--sb-mut:${v.mut};--sb-acc:${v.acc};--sb-acc2:${v.acc2};--sb-grad:${v.grad};--sb-acc-soft:${v.accSoft};--sb-shadow:${v.shadow};--sb-scheme:${dark ? 'dark' : 'light'}}`;
  }
  const appLogo = size => { const v = SB.themeVars(state.settings, false); return SB.logoEl(size, v.acc, v.acc2); };

  async function refresh() { state = await SB.load(); applyTheme(); scan(true); }
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.lists || ch.titles || ch.settings || ch.queue)) refresh(); });
  function openManager(hash = '') { chrome.runtime.sendMessage({ type: 'openManager', hash }); }

  // Donde colgar menús y avisos: dentro del elemento en pantalla completa si lo hay (si no, no se verían)
  function uiRoot() {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    return fs && fs !== document.documentElement && !/^(VIDEO|IFRAME)$/.test(fs.tagName) ? fs : document.body;
  }
  document.addEventListener('fullscreenchange', () => {
    for (const id of ['sb-menu', 'sb-toast', 'sb-qnext', 'sb-qbar']) { const el = document.getElementById(id); if (el) uiRoot().append(el); }
  });

  function toast(msg, isErr) {
    $('#sb-toast')?.remove();
    const t = h('div', { id: 'sb-toast', class: 'sb-ui' + (isErr ? ' err' : '') }, msg);
    uiRoot().append(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3000);
  }

  // Que los clics en nuestros botones no lleguen a la web (no abrir el título ni la vista previa)
  function shield(el) {
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
    return el;
  }

  // Contenido del botón: iconos de las listas en las que está o el logo con «+»
  function buttonKids(k, withText) {
    const ls = SB.listsOf(state, k);
    if (ls.length) return [h('span', { class: 'sb-btn-icons' }, ls.slice(0, 3).map(l => SB.iconEl(l, withText ? 20 : 18))),
      ls.length > 3 ? h('span', { class: 'sb-btn-more' }, '+' + (ls.length - 3)) : null,
      withText ? h('span', { class: 'sb-btn-txt' }, TN(ls.length, 'En {0} lista', 'En {0} listas')) : null];
    return [appLogo(withText ? 20 : 18), withText ? h('span', { class: 'sb-btn-txt' }, T('Añadir a lista')) : h('span', { class: 'sb-btn-plus' }, '+')];
  }
  function buttonTitle(k) {
    const ls = SB.listsOf(state, k);
    return ls.length ? T('En StreamBox: ') + ls.map(l => l.name).join(', ') : T('Añadir a una lista de StreamBox');
  }
  function sigOf(k) { return k + '|' + SB.listsOf(state, k).map(l => l.id + l.color + JSON.stringify(l.icon)).join(','); }

  // ---------- Botones sobre las miniaturas ----------
  const cardInfo = new WeakMap();
  function decorateCard(c) {
    const k = SB.keyOf(P.id, c.pid);
    cardInfo.set(c.el, c);
    if (!c.el.dataset.sbHover) {
      c.el.dataset.sbHover = '1';
      c.el.addEventListener('mouseenter', () => { const i = cardInfo.get(c.el); if (i) lastHover = i; });
    }
    let btn = [...c.el.children].find(x => x.classList && x.classList.contains('sb-cardbtn'));
    if (!btn) {
      if (getComputedStyle(c.el).position === 'static') c.el.style.position = 'relative';
      btn = shield(h('button', { class: 'sb-ui sb-cardbtn', type: 'button' }));
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openMenu(cardInfo.get(c.el), btn); });
      c.el.append(btn);
    }
    const sig = sigOf(k);
    if (btn.dataset.sig !== sig) {
      btn.dataset.sig = sig;
      btn.classList.toggle('on', SB.listsOf(state, k).length > 0);
      btn.title = buttonTitle(k); btn.setAttribute('aria-label', btn.title);
      btn.replaceChildren(...buttonKids(k, false).filter(Boolean));
    }
    // Si el título ya está guardado y le falta la carátula, se aprovecha la de la miniatura
    const t = state.titles[k];
    if (t && !t.img && c.img) { t.img = c.img; saveSoon(); }
  }

  // ---------- Botones en línea (ficha, vista previa, cartel) ----------
  function decorateSpot(s) {
    const k = SB.keyOf(P.id, s.info.pid);
    const slot = s.slot || null;
    const cls = 'sb-ui sb-inlinebtn sb-' + s.kind + (slot && slot.floating ? ' sb-floating' : '') + (slot && slot.cls ? ' ' + slot.cls : '');
    let btn;
    if (slot && slot.near) {
      // Botón flotante junto a un elemento al que no podemos entrar (p. ej. dentro de un shadow DOM)
      btn = $('#sb-near-' + s.kind);
      if (!btn) { btn = shield(h('button', { id: 'sb-near-' + s.kind, class: cls + ' sb-near', type: 'button' })); uiRoot().append(btn); }
      else if (btn.parentNode !== uiRoot()) uiRoot().append(btn);
      btn._near = slot.near;
      placeNear(btn);
    } else if (slot) {
      const parent = slot.parent;
      btn = [...parent.children].find(x => x.classList && x.classList.contains('sb-inlinebtn'));
      if (!btn) {
        btn = shield(h('button', { class: cls, type: 'button' }));
        if (slot.size) { btn.style.width = btn.style.height = btn.style.minWidth = slot.size + 'px'; }
        if (slot.before && slot.before.parentNode === parent) parent.insertBefore(btn, slot.before);
        else if (slot.prepend) parent.prepend(btn);
        else parent.append(btn);
      }
    } else {
      btn = $('#sb-fab');
      if (!btn) { btn = shield(h('button', { id: 'sb-fab', class: 'sb-ui sb-inlinebtn sb-fab', type: 'button' })); document.body.append(btn); }
    }
    btn._sbInfo = s.info;
    if (!btn.dataset.sbClick) {
      btn.dataset.sbClick = '1';
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openMenu(btn._sbInfo, btn); });
    }
    const compact = s.kind === 'mini' || s.kind === 'player' || !!(slot && slot.compact);
    const sig = sigOf(k) + (compact ? 'c' : '');
    if (btn.dataset.sig !== sig) {
      btn.dataset.sig = sig;
      btn.classList.toggle('on', SB.listsOf(state, k).length > 0);
      btn.title = buttonTitle(k); btn.setAttribute('aria-label', btn.title);
      btn.replaceChildren(...buttonKids(k, !compact).filter(Boolean));
    }
    return btn;
  }

  // Coloca un botón flotante a la izquierda de su elemento de referencia y lo oculta si este no se ve
  function placeNear(btn) {
    const ref = btn._near;
    const vis = ref && ref.isConnected && ref.getClientRects().length && (!ref.checkVisibility || ref.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
    if (!vis) { btn.style.visibility = 'hidden'; return; }
    const r = ref.getBoundingClientRect();
    btn.style.visibility = '';
    btn.style.top = Math.round(r.top + (r.height - btn.offsetHeight) / 2) + 'px';
    btn.style.left = Math.round(r.left - btn.offsetWidth - 12) + 'px';
  }
  setInterval(() => $$('.sb-near').forEach(placeNear), 250);

  // ---------- Recorrido de la página ----------
  let scanTimer = null;
  function scan(now) {
    clearTimeout(scanTimer);
    if (now) return doScan();
    scanTimer = setTimeout(doScan, 250);
  }
  function doScan() {
    try {
      if (!enabled()) { $$('.sb-cardbtn, .sb-inlinebtn').forEach(b => b.remove()); return; }
      if (state.settings.thumbButtons !== false) P.cards(document).forEach(c => { try { decorateCard(c); } catch (e) { console.warn('[StreamBox]', e); } });
      else $$('.sb-cardbtn').forEach(b => b.remove());
      const keep = new Set();
      for (const s of P.spots({ lastHover, rescan: () => scan(), titles: state.titles })) { try { keep.add(decorateSpot(s)); } catch (e) { console.warn('[StreamBox]', e); } }
      $$('.sb-inlinebtn').forEach(b => { if (!keep.has(b)) b.remove(); });
    } catch (e) { console.error('[StreamBox] recorrido', e); }
  }
  new MutationObserver(muts => {
    // Ignorar los cambios que hacemos nosotros
    if (muts.every(m => [...m.addedNodes, ...m.removedNodes].every(n => n.nodeType === 1 && n.classList.contains('sb-ui')) || (m.target.closest && m.target.closest('.sb-ui')))) return;
    scan();
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => scan(), 2000); // por si la web cambia de página sin tocar el DOM que vigilamos
  addEventListener('popstate', () => scan());

  // ---------- Reproductor: omitir introducción / resumen y pasar al siguiente episodio ----------
  const clicked = new WeakSet();
  const PLAYER_MSG = { skipIntro: 'Introducción omitida', skipRecap: 'Resumen omitido', autoNext: 'Siguiente episodio' };
  const pAll = sel => (P.player && P.player.deep) ? SB.deepAll(sel) : $$(sel);
  // Una regla es { sel } (selector), { generic, text } (botón genérico reconocido por su texto) o { find() }
  function findPlayerButton(rule) {
    if (!rule) return null;
    if (typeof rule === 'string') rule = { sel: rule };
    if (rule.find) { const b = rule.find(); return b && b.getClientRects().length ? b : null; }
    const direct = rule.sel && pAll(rule.sel).find(b => b.getClientRects().length);
    if (direct) return direct;
    if (!rule.generic || !rule.text) return null;
    return pAll(rule.generic).find(b => rule.text.test(b.textContent + ' ' + (b.getAttribute('aria-label') || ''))) || null;
  }
  function playerTick() {
    const pl = P.player, opts = state.settings.player || {};
    if (!pl || !enabled() || !pl.active() || !(opts.skipIntro || opts.skipRecap || opts.autoNext || queueHead())) return;
    for (const key of ['skipIntro', 'skipRecap', 'autoNext']) {
      if (!opts[key] || !pl[key]) continue;
      if (key === 'autoNext' && queueWantsNext()) continue;
      const b = findPlayerButton(pl[key]);
      if (!b || clicked.has(b) || !b.getClientRects().length) continue;
      clicked.add(b);
      // Un instante de margen: que el botón termine de aparecer antes de pulsarlo
      setTimeout(() => { if (b.isConnected) { b.click(); toast('StreamBox: ' + T(PLAYER_MSG[key])); } }, 300);
    }
    // «¿Sigues viendo?»: se contesta que sí si está activado pasar solo al siguiente episodio o hay una cola en marcha
    if ((opts.autoNext || queueHead()) && pl.stillWatching) {
      const b = findPlayerButton(pl.stillWatching);
      if (b && !clicked.has(b)) { clicked.add(b); setTimeout(() => b.isConnected && b.click(), 300); }
    }
  }
  setInterval(playerTick, 500);

  // ---------- Cola de reproducción ----------
  // Mientras la cola está en marcha, al terminar el título actual (o los episodios elegidos de una serie)
  // se abre el siguiente. Lo terminado se queda en la cola marcado como visto.
  const visible = rule => !!findPlayerButton(rule);
  const queueHead = () => { const q = state.queue; return q && q.playing ? SB.queueFirst(state) : null; };
  const queueNext = () => SB.queuePending(state)[1] || null;
  function queueWantsNext() {
    const cur = queueHead(); if (!cur) return false;
    const t = state.titles[cur.k];
    return !!(t && t.type === 'series' && cur.eps && state.queue.epIds.length >= cur.eps && !!queueNext());
  }
  async function saveQueue() { await SB.save({ queue: state.queue, titles: state.titles }); }
  let countdown = null;
  function stopCountdown() { if (countdown) { clearInterval(countdown.timer); countdown.el.remove(); countdown = null; } }
  async function advance(reason) {
    stopCountdown();
    state = await SB.load();
    const q = state.queue;
    const cur = SB.queueFirst(state);
    if (!q.playing || !cur) return;
    // Lo terminado se queda en su sitio, marcado como visto
    cur.done = true; cur.doneAt = Date.now();
    q.epIds = []; q.hold = '';
    const next = SB.queueFirst(state);
    if (!next) { q.playing = false; await saveQueue(); toast(T('🎉 Has terminado tu cola')); return; }
    q.startedAt = Date.now(); q.autoplay = { k: next.k, at: Date.now() };
    await saveQueue();
    const t = state.titles[next.k];
    toast(T('Siguiente en tu cola: {0}', (t && t.title) || ''));
    if (t) location.href = SB.playUrl(t);
  }
  function startCountdown(nextTitle) {
    if (countdown) return;
    let n = 8;
    const num = h('b', {}, String(n));
    const el = shield(h('div', { id: 'sb-qnext', class: 'sb-ui' },
      appLogo(22),
      h('div', { class: 'sb-qnext-txt' }, h('small', {}, T('Siguiente en tu cola')), h('div', { class: 'sb-qnext-name' }, nextTitle ? nextTitle.title : T('Fin de la cola'))),
      num,
      h('button', { class: 'sb-qbtn main', type: 'button', onclick: () => advance('now') }, nextTitle ? T('Ver ahora') : T('Terminar')),
      h('button', { class: 'sb-qbtn', type: 'button', onclick: async () => {
        stopCountdown();
        state = await SB.load(); state.queue.hold = P.player.currentId() || 'x'; await saveQueue();
        toast(T('Vale, sigues aquí. La cola continúa con el siguiente título que veas.'));
      } }, T('Cancelar'))));
    uiRoot().append(el);
    countdown = { el, timer: setInterval(() => { n--; num.textContent = String(n); if (n <= 0) advance('auto'); }, 1000) };
  }
  async function queueTick() {
    const pl = P.player, q = state.queue, cur = queueHead();
    if (!pl || !cur || !enabled()) { stopCountdown(); queueBar(); return; }
    if (!pl.active()) {
      // Si sales del reproductor, la cola se pone en pausa (para que otro vídeo que veas no la haga avanzar)
      stopCountdown(); queueBar();
      if (Date.now() - (q.startedAt || 0) > 15000 && !(q.autoplay && Date.now() - q.autoplay.at < 90000)) { q.playing = false; await saveQueue(); }
      return;
    }
    const watchId = pl.currentId();
    if (watchId && q.hold && q.hold !== watchId) q.hold = '';
    // Apuntar cada episodio nuevo que empieza (el id de /watch cambia en cada episodio)
    if (watchId && q.epIds[q.epIds.length - 1] !== watchId) { q.epIds.push(watchId); await saveQueue(); }
    queueBar();
    if (q.hold === watchId) return;
    const t = state.titles[cur.k];
    const series = t && t.type === 'series';
    const v = pl.video();
    const ending = !!(v && isFinite(v.duration) && v.duration > 60 && (v.ended || v.duration - v.currentTime < 3));
    const nextEp = visible(pl.autoNext);
    const credits = visible(pl.credits);
    let done = false;
    if (series) {
      if (cur.eps && q.epIds.length > cur.eps) return advance('over');      // la web ya pasó de episodio por su cuenta
      if (cur.eps && q.epIds.length >= cur.eps && (nextEp || credits || ending)) done = true;
      else if (!nextEp && ending) done = true;                               // último episodio de la serie
    } else done = credits || ending;
    if (done) { const n = queueNext(); startCountdown(n ? state.titles[n.k] : null); }
  }
  setInterval(() => queueTick().catch(e => console.warn('[StreamBox] cola', e)), 1000);

  // Plataformas sin enlace directo al reproductor (Disney+): al llegar a la ficha desde la cola,
  // se pulsa su botón «Reproducir» (que sigue la serie por donde ibas)
  let autoBusy = false;
  async function autoplayTick() {
    const q = state.queue, cur = queueHead();
    if (autoBusy || !cur || !q.autoplay || q.autoplay.k !== cur.k || !P.autoPlay || (P.player && P.player.active())) return;
    if (Date.now() - q.autoplay.at > 90000) return;
    const t = state.titles[cur.k];
    if (!t || t.platform !== P.id) return;
    const pagePid = P.parseUrl(location.href);
    if (pagePid && pagePid !== t.pid) return;
    const b = P.autoPlay();
    if (!b) return;
    autoBusy = true;
    state = await SB.load(); delete state.queue.autoplay; state.queue.startedAt = Date.now(); await saveQueue();
    toast(T('Reproduciendo «{0}» desde tu cola', t.title || ''));
    setTimeout(() => { b.click(); autoBusy = false; }, 800);
  }
  setInterval(() => autoplayTick().catch(() => {}), 1000);

  // Barra discreta en el reproductor: posición en la cola, siguiente, saltar y parar
  let barTimer = null;
  function queueBar() {
    const cur = queueHead();
    let bar = $('#sb-qbar');
    if (!cur || !P.player || !P.player.active()) { bar && bar.remove(); return; }
    const q = state.queue, t = state.titles[cur.k] || {}, nn = queueNext(), nx = nn && state.titles[nn.k];
    const sig = JSON.stringify([q.items.map(i => i.k + i.eps + !!i.done), q.epIds.length]);
    if (bar && bar.dataset.sig === sig) return;
    const epTxt = t.type === 'series' ? ' · ' + (cur.eps ? T('episodio {0} de {1}', Math.max(1, q.epIds.length), cur.eps) : T('hasta el final de la serie')) : '';
    const nb = shield(h('div', { id: 'sb-qbar', class: 'sb-ui show' },
      appLogo(18),
      h('span', {}, h('b', {}, T('Cola')), ' ' + T('{0} en cola', SB.queuePending(state).length) + epTxt),
      nx ? h('span', { class: 'sb-qbar-next' }, T('Después: {0}', nx.title)) : null,
      h('button', { class: 'sb-qbtn', type: 'button', title: T('Pasar al siguiente de la cola'), onclick: () => advance('skip') }, '⏭'),
      h('button', { class: 'sb-qbtn', type: 'button', title: T('Parar la cola'), onclick: async () => {
        state = await SB.load(); state.queue.playing = false; await saveQueue(); toast(T('Cola en pausa. La retomas desde el gestor o el menú de StreamBox.'));
      } }, '■')));
    nb.dataset.sig = sig;
    bar ? bar.replaceWith(nb) : uiRoot().append(nb);
    flashBar();
  }
  function flashBar() {
    const bar = $('#sb-qbar'); if (!bar) return;
    bar.classList.add('show'); clearTimeout(barTimer);
    barTimer = setTimeout(() => bar.classList.remove('show'), 4000);
  }
  document.addEventListener('mousemove', () => { if ($('#sb-qbar')) flashBar(); }, { passive: true });

  // Empezar (o seguir) la cola: abre el primer título
  async function playQueue() {
    state = await SB.load();
    const first = SB.queueFirst(state);
    if (!first) return toast(T('Tu cola está vacía'));
    state.queue.playing = true; state.queue.epIds = []; state.queue.hold = ''; state.queue.startedAt = Date.now();
    state.queue.autoplay = { k: first.k, at: Date.now() };
    await saveQueue();
    const t = state.titles[first.k];
    if (t) location.href = SB.playUrl(t);
  }

  let saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(() => SB.save({ titles: state.titles }), 1500); }

  // ---------- Menú de listas ----------
  function closeMenu() { $('#sb-menu')?.remove(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); }, true);

  // Guarda el cambio con los datos más recientes (puede haber otras pestañas) y completa tipo y año
  async function change(info, fn) {
    state = await SB.load();
    const r = fn();
    await SB.save({ lists: state.lists, titles: state.titles, queue: state.queue });
    const k = SB.keyOf(P.id, info.pid);
    const t = state.titles[k];
    if (t && (!t.type || !t.year || !t.title || !t.img) && P.enrich) {
      P.enrich(info.pid).then(async d => {
        if (!d || !Object.keys(d).length) return;
        state = await SB.load();
        if (!state.titles[k]) return;
        SB.upsertTitle(state, Object.assign({ platform: P.id, pid: info.pid }, d));
        await SB.save({ titles: state.titles });
      }).catch(() => {});
    }
    return r;
  }
  const fullInfo = info => Object.assign({ platform: P.id }, info);

  function openMenu(info, anchor) {
    const old = $('#sb-menu');
    if (old) { const same = old._anchor === anchor; old.remove(); if (same) return; }
    if (!info || !info.pid) return;
    const k = SB.keyOf(P.id, info.pid);
    const menu = shield(h('div', { id: 'sb-menu', class: 'sb-ui', role: 'dialog' }));
    menu._anchor = anchor;
    const saved = state.titles[k];
    const name = info.title || (saved && saved.title) || '';
    const head = h('div', { class: 'sb-menu-title', title: name }, name || T('Buscando el título…'));
    menu.append(h('div', { class: 'sb-menu-head' }, SB.platformBadge(P.id, true), head));
    // Si la web no da el nombre, se pide a la plataforma y se completa
    if (!name && P.enrich) P.enrich(info.pid).then(d => {
      if (!d) return;
      for (const f of ['title', 'type', 'year', 'img']) if (d[f] && !info[f]) info[f] = d[f];
      head.textContent = info.title || T('Este título'); head.title = info.title || '';
    }).catch(() => { head.textContent = T('Este título'); });
    // Puntuación y notas pendientes: si aún no está en ninguna lista, se guardan al añadirlo a una
    const pend = {};
    const applyPend = () => { const t = state.titles[k]; if (!t) return; if (pend.rating != null) t.rating = pend.rating; if (pend.note != null) t.note = pend.note; };
    const inNow = new Set(SB.listsOf(state, k).map(l => l.id));
    const box = h('div', { class: 'sb-menu-lists' });
    if (!state.lists.length) box.append(h('div', { class: 'sb-menu-empty' }, T('Aún no tienes listas. Crea una aquí abajo.')));
    for (const l of state.lists) {
      const cb = h('input', { type: 'checkbox' }); cb.checked = inNow.has(l.id);
      box.append(h('label', { class: 'sb-menu-item' }, cb, SB.iconEl(l, 22), h('span', { class: 'sb-menu-name' }, l.name), h('small', {}, String(l.items.length))));
      cb.addEventListener('change', async () => {
        cb.disabled = true;
        try {
          await change(info, () => {
            const list = state.lists.find(x => x.id === l.id);
            if (!list) return;
            if (cb.checked) { SB.addToList(state, list, fullInfo(info)); applyPend(); } else SB.removeFromList(state, list, k);
          });
          drawExtras();
          toast(cb.checked ? T('Añadido a «{0}»', l.name) : T('Quitado de «{0}»', l.name));
        } catch (e) { toast('StreamBox: ' + e.message, true); cb.checked = !cb.checked; }
        cb.disabled = false;
      });
    }
    menu.append(box);
    // Mi puntuación y mis notas
    const extras = h('div', { class: 'sb-menu-extras' });
    let noteTimer = null;
    function drawExtras() {
      const t = state.titles[k];
      const rating = t ? t.rating || 0 : pend.rating || 0;
      const note = h('textarea', { class: 'sb-menu-note', rows: '2', maxlength: '1000', placeholder: T('Mis notas (quién me lo recomendó, por qué capítulo voy…)') });
      note.value = t ? t.note || '' : pend.note || '';
      for (const ev of ['keydown', 'keyup', 'keypress']) note.addEventListener(ev, e => e.stopPropagation());
      note.addEventListener('input', () => {
        clearTimeout(noteTimer);
        noteTimer = setTimeout(async () => {
          state = await SB.load();
          const x = state.titles[k];
          if (!x) { pend.note = note.value; return; }
          x.note = note.value.trim(); await SB.save({ titles: state.titles });
        }, 500);
      });
      extras.replaceChildren(...[
        h('div', { class: 'sb-menu-rate' }, h('span', {}, T('Mi puntuación')),
          SB.starsEl(rating, async v => {
            state = await SB.load();
            const x = state.titles[k];
            if (!x) { pend.rating = v; toast(T('Se guardará al añadirlo a una lista')); return; }
            x.rating = v; await SB.save({ titles: state.titles });
            toast(v ? TN(v, 'Puntuado con {0} estrella', 'Puntuado con {0} estrellas') : T('Puntuación quitada'));
          }, 18)),
        note,
        t ? null : h('small', { class: 'sb-menu-hint' }, T('La puntuación y las notas se guardan al añadirlo a una lista.'))].filter(Boolean));
    }
    drawExtras();
    menu.append(extras);
    // Cola de reproducción
    const qi = SB.inQueue(state, k);
    menu.append(h('div', { class: 'sb-menu-queue' },
      h('button', { class: 'sb-qbtn' + (qi >= 0 ? ' on' : ''), type: 'button', onclick: async () => {
        await change(info, () => {
          const i = SB.inQueue(state, k);
          if (i >= 0 && !state.queue.items[i].done) SB.queueRemove(state, k); else SB.queueAdd(state, fullInfo(info));
        }, true);
        toast(SB.inQueue(state, k) >= 0 ? T('Añadido a la cola (n.º {0})', SB.inQueue(state, k) + 1) : T('Quitado de la cola'));
        closeMenu();
      } }, qi >= 0 ? (state.queue.items[qi].done ? T('✓ Visto en la cola (n.º {0}) · volver a ponerlo', qi + 1) : T('✓ En la cola (n.º {0}) · quitar', qi + 1)) : T('＋ Añadir a la cola')),
      SB.queuePending(state).length ? h('button', { class: 'sb-qbtn main', type: 'button', title: T('Reproducir la cola desde el primero sin ver'), onclick: () => { closeMenu(); playQueue(); } }, '▶ ' + T('Ver cola ({0})', SB.queuePending(state).length)) : null));
    const input = h('input', { type: 'text', placeholder: T('Nueva lista…'), class: 'sb-menu-new', maxlength: '60' });
    input.addEventListener('keydown', async e => {
      e.stopPropagation();
      if (e.key !== 'Enter' || !input.value.trim()) return;
      const nm = input.value.trim();
      await change(info, () => { const l = SB.newList(state, nm); SB.addToList(state, l, fullInfo(info)); applyPend(); });
      toast(T('Añadido a «{0}»', nm));
      closeMenu();
    });
    for (const ev of ['keyup', 'keypress', 'input']) input.addEventListener(ev, e => e.stopPropagation());
    menu.append(input,
      h('button', { class: 'sb-menu-foot', type: 'button', onclick: () => { closeMenu(); openManager(inNow.size ? 'list=' + [...inNow][0] : ''); } }, appLogo(16), T('Abrir mis listas')));
    uiRoot().append(menu);
    // Colocar junto al botón y que quepa en pantalla
    const r = anchor.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = Math.min(window.innerWidth - mw - 8, Math.max(8, r.left));
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = left + 'px'; menu.style.top = top + 'px';
    setTimeout(() => document.addEventListener('mousedown', function close(e) {
      if (!menu.isConnected) return document.removeEventListener('mousedown', close, true);
      if (!menu.contains(e.target) && !anchor.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close, true); }
    }, true), 0);
  }

  refresh();
})();
