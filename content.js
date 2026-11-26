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
  let lastPlayerInfo = null; // lo que se está viendo (lo da el botón del reproductor)
  let party = null;          // «Ver juntos» (conexión con otro navegador)

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
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.lists || ch.titles || ch.settings || ch.queue || ch.follow)) refresh(); });
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
  // Botón dentro del reproductor: como los de la plataforma (icono blanco, sin fondo, mismo tamaño);
  // si ya está en alguna lista, un puntito con el icono de la primera
  // Botón dentro del reproductor: nuestro logo de colores, centrado y del tamaño de los iconos de la web;
  // si ya está en alguna lista, una marca ✓ con los colores de la app en la esquina
  function playerKids(k, size) {
    const on = SB.listsOf(state, k).length > 0;
    const box = h('span', { class: 'sb-pl-ico' + (on ? ' on' : '') });
    box.style.width = box.style.height = Math.round(size * 0.84) + 'px';
    box.append(appLogo(Math.round(size * 0.84)));
    if (on) { const c = h('span', { class: 'sb-pl-check' }, '✓'); c.style.fontSize = Math.max(9, Math.round(size * 0.2)) + 'px'; box.append(c); }
    return [box];
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
      c.el.addEventListener('mouseenter', () => { const i = cardInfo.get(c.el); if (i) lastHover = i; c.el.querySelector(':scope > .sb-cardbtn')?.classList.add('sb-hov'); });
      c.el.addEventListener('mouseleave', () => c.el.querySelector(':scope > .sb-cardbtn')?.classList.remove('sb-hov'));
    }
    let btn = [...c.el.children].find(x => x.classList && x.classList.contains('sb-cardbtn'));
    if (!btn) {
      if (getComputedStyle(c.el).position === 'static') c.el.style.position = 'relative';
      btn = shield(h('button', { class: 'sb-ui sb-cardbtn', type: 'button' }));
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openMenu(cardInfo.get(c.el), btn); });
      c.el.append(btn);
      // Si la plataforma dice cuál es la imagen, el botón se pega a su esquina (aunque la tarjeta crezca)
      if (c.imgEl) {
        const follow = () => { let n = 0; const t = setInterval(() => { placeOnImg(c.el, btn); if (++n > 8) clearInterval(t); }, 60); };
        c.el.addEventListener('mouseenter', follow);
        c.el.addEventListener('mouseleave', follow);
      }
    }
    if (c.imgEl) { btn._img = c.imgEl; placeOnImg(c.el, btn); }
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
    // Arreglar títulos guardados con un nombre que no lo es (p. ej. «6+»)
    if (t && SB.badTitle(t.title) && c.title && !SB.badTitle(c.title)) { SB.upsertTitle(state, Object.assign({ platform: P.id }, c)); saveSoon(); }
  }

  function placeOnImg(card, btn) {
    const img = btn._img;
    if (!img || !img.isConnected) return;
    const ir = img.getBoundingClientRect(), cr = card.getBoundingClientRect();
    if (!ir.width) return;
    btn.style.top = Math.round(ir.top - cr.top + 6) + 'px';
    btn.style.right = Math.round(cr.right - ir.right + 6) + 'px';
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
      const mine = [...parent.children].find(x => x.classList && (x.classList.contains('sb-inlinebtn') || x.classList.contains('sb-wrap')));
      btn = mine && (mine.classList.contains('sb-wrap') ? mine.querySelector('.sb-inlinebtn') : mine);
      if (!btn) {
        btn = shield(h('button', { class: cls, type: 'button' }));
        if (slot.size) { btn.style.width = btn.style.height = btn.style.minWidth = slot.size + 'px'; }
        // En los reproductores, el botón va dentro de una copia del envoltorio de sus botones
        let node = btn, spacer = null;
        if (slot.mimic && slot.before) {
          node = h(slot.before.tagName.toLowerCase(), { class: (slot.before.getAttribute('class') || '') + ' sb-ui sb-wrap' });
          node.append(btn);
          // La web separa sus botones con huecos vacíos entre ellos: se copia uno para que el nuestro tenga el mismo
          const sp = slot.before.previousElementSibling;
          if (sp && !sp.children.length && !sp.textContent.trim()) { spacer = sp.cloneNode(false); spacer.classList.add('sb-ui', 'sb-spacer'); }
        }
        if (slot.before && slot.before.parentNode === parent) { parent.insertBefore(node, slot.before); if (spacer) parent.insertBefore(spacer, slot.before); }
        else if (slot.prepend) parent.prepend(node);
        else parent.append(node);
      }
    } else {
      btn = $('#sb-fab');
      if (!btn) { btn = shield(h('button', { id: 'sb-fab', class: 'sb-ui sb-inlinebtn sb-fab', type: 'button' })); document.body.append(btn); }
    }
    btn._sbInfo = s.info;
    if (s.kind === 'player') lastPlayerInfo = { info: s.info, at: Date.now() };
    // Completar con lo que se ve en la ficha (p. ej. los géneros) los títulos ya guardados a los que les falte
    const saved = state.titles[k];
    if (saved && s.info.genres && s.info.genres.length && !(saved.genres && saved.genres.length)) { SB.upsertTitle(state, Object.assign({ platform: P.id }, s.info)); saveSoon(); }
    if (!btn.dataset.sbClick) {
      btn.dataset.sbClick = '1';
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openMenu(btn._sbInfo, btn); });
    }
    const compact = s.kind === 'mini' || s.kind === 'player' || !!(slot && slot.compact);
    const psize = s.kind === 'player' ? Math.max(28, Math.min(72, (slot && slot.size) || 40)) : 0;
    if (psize) { btn.style.width = btn.style.height = psize + 'px'; btn.style.minWidth = psize + 'px'; }
    const sig = sigOf(k) + (compact ? 'c' : '') + psize;
    if (btn.dataset.sig !== sig) {
      btn.dataset.sig = sig;
      btn.classList.toggle('on', SB.listsOf(state, k).length > 0);
      btn.title = buttonTitle(k); btn.setAttribute('aria-label', btn.title);
      btn.replaceChildren(...(psize ? playerKids(k, psize) : buttonKids(k, !compact)).filter(Boolean));
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
  // Cada parte va por separado: si una falla (la web ha cambiado), las demás siguen funcionando
  let lastErr = '';
  function report(where, e) { const m = where + ': ' + (e && e.message); if (m !== lastErr) { lastErr = m; console.error('[StreamBox] ' + P.name + ' · ' + where, e); } }
  function doScan() {
    if (!enabled()) { $$('.sb-cardbtn, .sb-inlinebtn').forEach(b => b.remove()); return; }
    try {
      if (state.settings.thumbButtons !== false) P.cards(document).forEach(c => { try { decorateCard(c); } catch (e) { report('miniatura', e); } });
      else $$('.sb-cardbtn').forEach(b => b.remove());
    } catch (e) { report('miniaturas', e); }
    try {
      const keep = new Set();
      for (const s of P.spots({ lastHover, rescan: () => scan(), titles: state.titles })) { try { keep.add(decorateSpot(s)); if (s.kind !== 'player') leavingSpot(s); } catch (e) { report('botón', e); } }
      $$('.sb-inlinebtn').forEach(b => {
        if (keep.has(b)) return;
        const w = b.closest('.sb-wrap');
        if (w && w.nextElementSibling && w.nextElementSibling.classList.contains('sb-spacer')) w.nextElementSibling.remove();
        (w || b).remove();
      });
    } catch (e) { report('ficha', e); }
  }
  // «Se va pronto»: si la ficha abierta dice hasta cuándo está disponible un título guardado, se apunta
  const leaveSeen = {};
  function leavingSpot(s) {
    const k = SB.keyOf(P.id, s.info.pid);
    if (!state.titles[k] || (leaveSeen[k] && Date.now() - leaveSeen[k] < 20000)) return;
    leaveSeen[k] = Date.now();
    const root = s.root && s.root !== document.body ? s.root : (document.querySelector('main') || document.body);
    const at = SB.leavingFromText((root.innerText || '').slice(0, 30000));
    if (!at) return;
    chrome.storage.local.get('leaving').then(({ leaving = {} }) => {
      const cur = leaving[k] || {};
      if (cur.at === at) return;
      leaving[k] = Object.assign(cur, { at, checked: Date.now(), fromPage: true });
      delete leaving[k].notified;
      return chrome.storage.local.set({ leaving });
    }).catch(() => {});
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
  let qbarOpen = false, qbarHover = false;
  function queueBar(force) {
    const cur = queueHead();
    let bar = $('#sb-qbar');
    if (!cur || !P.player || !P.player.active()) { bar && bar.remove(); return; }
    const q = state.queue, t = state.titles[cur.k] || {}, nn = queueNext(), nx = nn && state.titles[nn.k];
    const sig = JSON.stringify([q.items.map(i => i.k + i.eps + !!i.done), q.epIds.length, qbarOpen]);
    if (bar && bar.dataset.sig === sig && !force) return;
    const epTxt = t.type === 'series' ? ' · ' + (cur.eps ? T('episodio {0} de {1}', Math.max(1, q.epIds.length), cur.eps) : T('hasta el final de la serie')) : '';
    const row = h('div', { class: 'sb-qbar-row' },
      appLogo(18),
      h('span', {}, h('b', {}, T('Cola')), ' ' + T('{0} en cola', SB.queuePending(state).length) + epTxt),
      nx && !qbarOpen ? h('span', { class: 'sb-qbar-next' }, T('Después: {0}', nx.title)) : null,
      h('button', { class: 'sb-qbtn sb-qbar-toggle' + (qbarOpen ? ' on' : ''), type: 'button', title: qbarOpen ? T('Ocultar la cola') : T('Ver la cola entera'), onclick: () => { qbarOpen = !qbarOpen; queueBar(true); } }, qbarOpen ? '▴' : '▾'),
      h('button', { class: 'sb-qbtn', type: 'button', title: T('Pasar al siguiente de la cola'), onclick: () => advance('skip') }, '⏭'),
      h('button', { class: 'sb-qbtn', type: 'button', title: T('Parar la cola'), onclick: async () => {
        state = await SB.load(); state.queue.playing = false; await saveQueue(); toast(T('Cola en pausa. La retomas desde el gestor o el menú de StreamBox.'));
      } }, '■'));
    // Lista compacta de toda la cola: lo visto en gris, lo que suena marcado
    let list = null;
    if (qbarOpen) {
      list = h('ol', { class: 'sb-qbar-list' }, q.items.map((it, idx) => {
        const x = state.titles[it.k] || { title: it.k };
        const now = it === cur;
        const meta = x.type === 'series' ? (it.eps ? TN(it.eps, '{0} ep.', '{0} ep.') : T('serie')) : '';
        return h('li', { class: (it.done ? 'done' : '') + (now ? ' now' : ''), title: x.title },
          h('span', { class: 'n' }, now ? '▶' : it.done ? '✓' : String(idx + 1)),
          x.img ? h('img', { src: x.img, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'ph' }),
          h('span', { class: 't' }, x.title || ''),
          meta ? h('small', {}, meta) : null,
          SB.platformBadge(x.platform, true));
      }));
    }
    const nb = shield(h('div', { id: 'sb-qbar', class: 'sb-ui show' + (qbarOpen ? ' open' : '') }, row, list));
    nb.addEventListener('mouseenter', () => { qbarHover = true; flashBar(); });
    nb.addEventListener('mouseleave', () => { qbarHover = false; flashBar(); });
    nb.dataset.sig = sig;
    bar ? bar.replaceWith(nb) : uiRoot().append(nb);
    flashBar();
  }
  function flashBar() {
    const bar = $('#sb-qbar'); if (!bar) return;
    bar.classList.add('show'); clearTimeout(barTimer);
    // Mientras tienes el ratón encima no se esconde
    barTimer = setTimeout(() => { if (!qbarHover) bar.classList.remove('show'); }, qbarOpen ? 7000 : 4000);
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

  // Algunas webs se llevan el foco por su cuenta (sin que pulses nada): si pasa, se le devuelve al campo
  let lastOutsidePointer = 0;
  document.addEventListener('pointerdown', e => { if (!(e.target.closest && e.target.closest('.sb-ui'))) lastOutsidePointer = Date.now(); }, true);
  function keepFocus(el) {
    el.addEventListener('blur', () => {
      const s0 = el.selectionStart, s1 = el.selectionEnd;
      setTimeout(() => {
        if (!el.isConnected || Date.now() - lastOutsidePointer < 400) return;
        const a = document.activeElement;
        if (a && a !== document.body && a.closest && a.closest('.sb-ui')) return;
        el.focus({ preventScroll: true });
        try { el.setSelectionRange(s0, s1); } catch {}
      }, 0);
    });
    return el;
  }

  // ---------- Menú de listas ----------
  function closeMenu() { $('#sb-menu')?.remove(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); }, true);

  // Guarda el cambio con los datos más recientes (puede haber otras pestañas) y completa tipo y año
  async function change(info, fn) {
    state = await SB.load();
    const r = fn();
    await SB.save({ lists: state.lists, titles: state.titles, queue: state.queue, follow: state.follow });
    const k = SB.keyOf(P.id, info.pid);
    const t = state.titles[k];
    if (t && (!t.type || !t.year || !t.title || !t.img || !(t.genres && t.genres.length)) && P.enrich) {
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

  // Colocar el menú junto al botón y que quepa en pantalla
  function placeMenu(menu, anchor) {
    const r = anchor.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    const left = Math.min(window.innerWidth - mw - 8, Math.max(8, r.left));
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = left + 'px'; menu.style.top = top + 'px';
  }
  function openMenu(info, anchor) {
    const old = $('#sb-menu');
    if (old) { const same = old._anchor === anchor; old.remove(); if (same) return; }
    if (!info || !info.pid) return;
    // Miniaturas que no dicen a qué título pertenecen (p. ej. un episodio en Movistar Plus+): se averigua antes
    if (info.resolve && P.resolve && !info._resolved) {
      info._resolved = true;
      const wait = shield(h('div', { id: 'sb-menu', class: 'sb-ui', role: 'dialog' }, h('div', { class: 'sb-menu-head' }, SB.platformBadge(P.id, true), h('div', { class: 'sb-menu-title' }, T('Buscando el título…')))));
      wait._anchor = anchor; uiRoot().append(wait); placeMenu(wait, anchor);
      P.resolve(info).then(r => { if (r) Object.assign(info, r); }).catch(e => console.warn('[StreamBox]', e)).finally(() => {
        if (!wait.isConnected) return; // se cerró mientras tanto
        wait.remove(); if (anchor) anchor._sbInfo = info; openMenu(info, anchor);
      });
      return;
    }
    const k = SB.keyOf(P.id, info.pid);
    const menu = shield(h('div', { id: 'sb-menu', class: 'sb-ui', role: 'dialog' }));
    menu._anchor = anchor;
    const saved = state.titles[k];
    const name = [info.title, saved && saved.title].find(x => x && !SB.badTitle(x)) || '';
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
    // Nueva lista, justo debajo de las existentes: «Crear» la crea y guarda en ella este título
    const input = keepFocus(h('input', { type: 'text', placeholder: T('Nueva lista…'), class: 'sb-menu-new', maxlength: '60' }));
    const create = h('button', { type: 'button', class: 'sb-qbtn main sb-menu-create', disabled: true }, T('Crear'));
    const doCreate = async () => {
      const nm = input.value.trim();
      if (!nm || create.disabled) return;
      create.disabled = true;
      // Lo escrito en notas todavía sin guardar también va
      const noteEl = menu.querySelector('.sb-menu-note');
      if (noteEl && !state.titles[k] && noteEl.value.trim()) pend.note = noteEl.value.trim();
      try {
        await change(info, () => { const l = SB.newList(state, nm); SB.addToList(state, l, fullInfo(info)); applyPend(); });
        toast(T('Lista «{0}» creada con este título', nm));
        // Volver a abrir el menú ya con la lista nueva marcada
        closeMenu(); openMenu(info, anchor);
      } catch (e) { toast('StreamBox: ' + e.message, true); create.disabled = false; }
    };
    input.addEventListener('input', e => { e.stopPropagation(); create.disabled = !input.value.trim(); });
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); doCreate(); } });
    for (const ev of ['keyup', 'keypress']) input.addEventListener(ev, e => e.stopPropagation());
    create.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); doCreate(); });
    menu.append(h('div', { class: 'sb-menu-newrow' }, input, create));
    // Mi puntuación y mis notas
    const extras = h('div', { class: 'sb-menu-extras' });
    let noteTimer = null;
    function drawExtras() {
      const t = state.titles[k];
      const rating = t ? t.rating || 0 : pend.rating || 0;
      const note = keepFocus(h('textarea', { class: 'sb-menu-note', rows: '2', maxlength: '1000', placeholder: T('Mis notas (quién me lo recomendó, por qué capítulo voy…)') }));
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
      saved && saved.type === 'movie' ? null : h('button', { class: 'sb-qbtn' + (SB.isFollowing(state, k) ? ' on' : ''), type: 'button', title: T('Te avisa cuando salgan episodios o temporadas nuevas'), onclick: async () => {
        const was = SB.isFollowing(state, k);
        await change(info, () => { if (SB.isFollowing(state, k)) SB.unfollow(state, k); else SB.follow(state, fullInfo(info)); });
        toast(was ? T('Ya no sigues esta serie') : T('Siguiendo: te avisaré de los episodios nuevos'));
        if (!was) { chrome.runtime.sendMessage({ type: 'followCheck', keys: [k] }); followTick(true); }
        closeMenu();
      } }, SB.isFollowing(state, k) ? T('🔔 Siguiendo') : T('🔔 Seguir')),
      SB.queuePending(state).length ? h('button', { class: 'sb-qbtn main', type: 'button', title: T('Reproducir la cola desde el primero sin ver'), onclick: () => { closeMenu(); playQueue(); } }, '▶ ' + T('Ver cola ({0})', SB.queuePending(state).length)) : null));
    // En el reproductor: marcar el momento (con una nota) y «Ver juntos»
    if (P.player && P.player.active()) {
      const v = P.player.video && P.player.video();
      const now = v ? v.currentTime : 0;
      // Mientras el menú está abierto, el vídeo se queda quieto en ese momento; si te mueves, la hora se actualiza
      const wasPlaying = !!(v && !v.paused);
      if (wasPlaying) ctl('pause').catch(() => {});
      let markBtn = null, lastShown = -1;
      const curT = () => { const vv = P.player.video && P.player.video(); return vv ? vv.currentTime : now; };
      const live = setInterval(() => {
        if (!menu.isConnected) {
          clearInterval(live);
          const vv = P.player.video && P.player.video();
          if (wasPlaying && vv && vv.paused && P.player.active()) ctl('play').catch(() => {});
          return;
        }
        const sec = Math.floor(curT());
        if (markBtn && sec !== lastShown) { lastShown = sec; markBtn.textContent = '🔖 ' + T('Marcar {0}', fmtTime(sec)); }
      }, 300);
      const bmNote = h('input', { type: 'text', class: 'sb-bm-note', maxlength: '140', placeholder: T('Nota para este momento (opcional)') });
      keepFocus(bmNote);
      const save = async () => {
        const t = curT();
        await addBookmark(info, t, bmNote.value.trim());
        toast(T('🔖 Momento guardado ({0})', fmtTime(t)));
        closeMenu();
      };
      bmNote.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      // Ajuste fino sin salir del menú (y se puede mover la barra del reproductor: el menú no se cierra al tocarla)
      menu.dataset.keep = '1';
      const nudge = d => h('button', { class: 'sb-qbtn sb-bm-nudge', type: 'button', title: T('Mover {0} s', (d > 0 ? '+' : '') + d), onclick: () => ctl('seek', Math.max(0, curT() + d)).catch(() => {}) }, (d > 0 ? '+' : '−') + Math.abs(d) + 's');
      menu.append(h('div', { class: 'sb-menu-bm' },
        h('div', { class: 'sb-bm-row sb-bm-nudges' }, nudge(-10), nudge(-1), nudge(1), nudge(10),
          h('button', { class: 'sb-qbtn sb-bm-resume', type: 'button', title: T('Cerrar el menú y seguir viendo'), onclick: () => closeMenu() }, '▶ ' + T('Seguir viendo'))),
        h('div', { class: 'sb-bm-row' }, bmNote, markBtn = h('button', { class: 'sb-qbtn main', type: 'button', onclick: save }, '🔖 ' + T('Marcar {0}', fmtTime(now)))),
        typeof openParty === 'function' ? h('button', { class: 'sb-qbtn', type: 'button', onclick: () => { closeMenu(); openParty(); } }, '👥 ' + (party && party.connected ? T('Ver juntos · conectado') : T('Ver juntos'))) : null));
    }
    menu.append(
      h('button', { class: 'sb-menu-foot', type: 'button', onclick: () => { closeMenu(); openManager(inNow.size ? 'list=' + [...inNow][0] : ''); } }, appLogo(16), T('Abrir mis listas')));
    uiRoot().append(menu);
    placeMenu(menu, anchor);
    setTimeout(() => document.addEventListener('mousedown', function close(e) {
      if (!menu.isConnected) return document.removeEventListener('mousedown', close, true);
      if (menu.dataset.keep && !(e.target.closest && e.target.closest('.sb-ui'))) return; // en el reproductor: se puede mover la barra sin perder el menú
      if (!menu.contains(e.target) && !anchor.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close, true); }
    }, true), 0);
  }

  // ---------- Seguimiento: lo que la propia web ya enseña (Netflix: su caché; Disney+: la ficha abierta) ----------
  let followLast = 0;
  async function followTick(force) {
    if (!P.followObserve || !enabled()) return;
    if (!force && Date.now() - followLast < 15000) return;
    followLast = Date.now();
    const mine = Object.keys(state.follow || {}).filter(k => k.startsWith(P.id + ':'));
    if (!mine.length) return;
    let changed = false;
    const fresh = await SB.load();
    for (const k of mine) {
      const t = fresh.titles[k], rec = fresh.follow[k];
      if (!t || !rec) continue;
      try {
        const obs = await P.followObserve(t.pid);
        if (!obs) continue;
        const sig = r => JSON.stringify(Object.assign({}, r, { checkedAt: 0, detectedAt: r.isNew ? r.detectedAt : 0 }));
        const before = sig(rec);
        SB.applyObs(rec, obs);
        if (sig(rec) !== before) changed = true;
      } catch (e) { report('seguimiento', e); }
    }
    if (changed) await SB.save({ follow: fresh.follow });
  }
  setInterval(() => followTick().catch(() => {}), 5000);

  // ---------- Control del reproductor (mover, reproducir, pausar) ----------
  // Netflix tiene su propio control (P.player.control); en las demás se toca el vídeo directamente
  async function ctl(op, t) {
    const pl = P.player;
    if (!pl) return null;
    if (pl.control) { const r = await pl.control(op, t); if (r) return r; }
    const v = pl.video && pl.video();
    if (!v) return null;
    if (op === 'seek') v.currentTime = Math.max(0, t);
    else if (op === 'play') await v.play().catch(() => {});
    else if (op === 'pause') v.pause();
    return { ok: 1, t: v.currentTime, paused: v.paused };
  }
  const fmtTime = sec => { sec = Math.max(0, Math.floor(sec || 0)); const hh = Math.floor(sec / 3600), mm = Math.floor(sec / 60) % 60, ss = sec % 60; return (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0'); };

  // ---------- Ver juntos: dos navegadores conectados directamente (WebRTC), sin servidor ----------
  // Para conectar os pasáis dos códigos (invitación y respuesta). Luego play, pausa y saltos van sincronizados.
  const PARTY_PREFIX = 'SBJ1.';
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  function gathered(pc) {
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, 4000);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }
  function whatImWatching() {
    const pk = playingKey();
    let epId = ''; try { epId = String(P.player.currentId() || ''); } catch {}
    return { key: pk ? pk.key : '', title: pk && pk.info ? pk.info.title || '' : '', url: location.href.split('#')[0], epId };
  }
  function partySend(msg) { try { if (party && party.dc && party.dc.readyState === 'open') party.dc.send(JSON.stringify(msg)); } catch {} }
  function partyStatus() {
    let pill = $('#sb-party-pill');
    if (!party || !party.connected) { if (pill) pill.remove(); return; }
    if (!pill) { pill = shield(h('button', { id: 'sb-party-pill', class: 'sb-ui', type: 'button', onclick: () => openParty() })); uiRoot().append(pill); }
    pill.replaceChildren('👥 ' + T('Juntos') + (party.peerName ? ' · ' + party.peerName : ''));
  }
  function partyReact(e) {
    const el = h('div', { class: 'sb-ui sb-react' }, e);
    el.style.left = (20 + Math.random() * 60) + '%';
    uiRoot().append(el); setTimeout(() => el.remove(), 2600);
  }
  // Mientras aplicamos lo que manda el otro, no reenviar nuestros propios eventos del vídeo
  let partyMute = 0;
  async function partyApply(m) {
    if (m.op === 'hello') { party.peerName = m.name || ''; party.peerWatching = m.watching; partyStatus(); const mine = whatImWatching(); if (m.watching && m.watching.key && mine.key !== m.watching.key) partyOffer(m.watching); return; }
    if (m.op === 'react') { partyReact(m.e); return; }
    if (m.op === 'goto') { partyOffer(m.watching); return; }
    if (m.op === 'bye') { toast(T('{0} ha salido de «Ver juntos»', party.peerName || T('La otra persona'))); partyClose(true); return; }
    const pl = P.player; if (!pl || !pl.active()) return;
    const v = pl.video && pl.video(); if (!v) return;
    // Compensar el retraso del mensaje
    const lag = Math.max(0, (Date.now() - (m.at || Date.now())) / 1000);
    partyMute = Date.now() + 900;
    if (m.op === 'seek' || m.op === 'sync' || m.op === 'play') {
      const target = m.t + (m.paused ? 0 : lag);
      if (Math.abs(v.currentTime - target) > (m.op === 'sync' ? 2.5 : 0.8)) await ctl('seek', target);
    }
    if ((m.op === 'play' || (m.op === 'sync' && !m.paused)) && v.paused) await ctl('play');
    if ((m.op === 'pause' || (m.op === 'sync' && m.paused)) && !v.paused) await ctl('pause');
    if (m.op === 'play') toast('▶ ' + (party.peerName || T('La otra persona')));
    if (m.op === 'pause') toast('⏸ ' + (party.peerName || T('La otra persona')));
  }
  // El otro está viendo otra cosa: ofrecer ir a lo mismo
  function partyOffer(w) {
    if (!w || !w.url) return;
    $('#sb-party-goto')?.remove();
    const box = shield(h('div', { id: 'sb-party-goto', class: 'sb-ui sb-toast sb-party-goto' },
      h('span', {}, T('{0} está viendo «{1}»', party.peerName || T('La otra persona'), w.title || '…')),
      h('button', { class: 'sb-qbtn main', type: 'button', onclick: () => { box.remove(); if (w.url !== location.href.split('#')[0]) location.href = w.url; } }, T('Ir a lo mismo')),
      h('button', { class: 'sb-qbtn', type: 'button', onclick: () => box.remove() }, '✕')));
    uiRoot().append(box);
    setTimeout(() => box.remove(), 20000);
  }
  // Escuchar el vídeo propio y avisar al otro
  let partyVideo = null, partyLastEp = '';
  function partyWatchVideo() {
    if (!party || !party.connected) return;
    const pl = P.player, v = pl && pl.active() && pl.video && pl.video();
    if (v && v !== partyVideo) {
      partyVideo = v;
      const send = op => () => { if (Date.now() < partyMute || !party || !party.connected) return; partySend({ op, t: v.currentTime, paused: v.paused, at: Date.now() }); };
      v.addEventListener('play', send('play')); v.addEventListener('pause', send('pause')); v.addEventListener('seeked', send('seek'));
    }
    // Cambio de episodio: decírselo al otro
    let ep = ''; try { ep = String(pl && pl.active() ? pl.currentId() || '' : ''); } catch {}
    if (ep && partyLastEp && ep !== partyLastEp) partySend({ op: 'goto', watching: whatImWatching() });
    if (ep) partyLastEp = ep;
    // Cada 5 s quien creó la sala manda dónde va, para corregir desfases
    if (party.host && v && Date.now() - (party.lastSync || 0) > 5000) { party.lastSync = Date.now(); partySend({ op: 'sync', t: v.currentTime, paused: v.paused, at: Date.now() }); }
  }
  setInterval(partyWatchVideo, 1000);
  function partySetup(pc, dc) {
    party.pc = pc;
    const wire = d => {
      party.dc = d;
      d.onopen = () => { party.connected = true; partyStatus(); partySend({ op: 'hello', name: state.settings.myName || '', watching: whatImWatching() }); toast('👥 ' + T('¡Conectados! Ahora play, pausa y saltos van sincronizados.')); $('#sb-party')?.remove(); };
      d.onmessage = e => { try { partyApply(JSON.parse(e.data)); } catch (er) { report('ver juntos', er); } };
      d.onclose = () => { if (party && party.connected) { toast(T('Se ha cortado «Ver juntos»')); partyClose(true); } };
    };
    if (dc) wire(dc); else pc.ondatachannel = e => wire(e.channel);
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { toast(T('No se ha podido conectar (puede que vuestra red lo bloquee).'), true); partyClose(true); } };
  }
  function partyClose(silent, keepPanel) {
    if (party) { if (!silent) partySend({ op: 'bye' }); try { party.dc && party.dc.close(); party.pc && party.pc.close(); } catch {} }
    party = null; partyVideo = null; partyStatus();
    if (!keepPanel) $('#sb-party')?.remove();
  }
  async function partyHost(box) {
    partyClose(true, true);
    party = { host: true };
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const dc = pc.createDataChannel('sb', { ordered: true });
    partySetup(pc, dc);
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    const code = await SB.packCode({ t: 'o', sdp: pc.localDescription.sdp, name: state.settings.myName || '', watching: whatImWatching() }, PARTY_PREFIX);
    const answer = h('textarea', { class: 'sb-party-code', rows: '3', placeholder: T('Pega aquí la respuesta que te mande…') });
    keepFocus(answer);
    const msg = h('div', { class: 'sb-party-msg' });
    box.replaceChildren(
      h('p', {}, h('b', {}, '1. '), T('Manda esta invitación a la otra persona (WhatsApp, correo…):')),
      h('textarea', { class: 'sb-party-code', rows: '3', readonly: '' }, code),
      h('button', { class: 'sb-qbtn main', type: 'button', onclick: async e => { await navigator.clipboard.writeText(code); e.target.textContent = '✓ ' + T('Copiada'); } }, '📋 ' + T('Copiar invitación')),
      h('p', {}, h('b', {}, '2. '), T('Pega aquí su respuesta:')), answer, msg,
      h('button', { class: 'sb-qbtn main', type: 'button', onclick: async () => {
        try {
          const d = await SB.unpackCode(answer.value, PARTY_PREFIX);
          if (d.t !== 'a') throw new Error('x');
          await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
          msg.textContent = T('Conectando…');
        } catch { msg.textContent = T('Esa respuesta no es válida.'); }
      } }, T('Conectar')));
  }
  async function partyJoin(box, codeTxt) {
    let d;
    try { d = await SB.unpackCode(codeTxt, PARTY_PREFIX); if (d.t !== 'o') throw new Error('x'); } catch { toast(T('Esa invitación no es válida.'), true); return; }
    partyClose(true, true);
    party = { host: false, peerName: d.name || '' };
    const pc = new RTCPeerConnection({ iceServers: ICE });
    partySetup(pc);
    await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    const code = await SB.packCode({ t: 'a', sdp: pc.localDescription.sdp }, PARTY_PREFIX);
    box.replaceChildren(
      h('p', {}, T('Devuélvele esta respuesta a {0}:', d.name || T('quien te invitó'))),
      h('textarea', { class: 'sb-party-code', rows: '3', readonly: '' }, code),
      h('button', { class: 'sb-qbtn main', type: 'button', onclick: async e => { await navigator.clipboard.writeText(code); e.target.textContent = '✓ ' + T('Copiada'); } }, '📋 ' + T('Copiar respuesta')),
      h('p', { class: 'sb-party-msg' }, T('En cuanto la pegue, quedaréis conectados.')),
      d.watching && d.watching.title ? h('p', { class: 'sb-party-msg' }, T('Está viendo «{0}».', d.watching.title), ' ', h('a', { href: d.watching.url, class: 'sb-party-link' }, T('Abrir lo mismo'))) : null);
  }
  function openParty() {
    $('#sb-party')?.remove();
    const body = h('div', { class: 'sb-party-body' });
    const panel = shield(h('div', { id: 'sb-party', class: 'sb-ui sb-party' },
      h('div', { class: 'sb-party-head' }, h('b', {}, '👥 ' + T('Ver juntos')), h('button', { class: 'sb-x', type: 'button', onclick: () => panel.remove() }, '✕')),
      body));
    if (party && party.connected) {
      body.append(h('p', {}, T('Conectado con {0}. Play, pausa y saltos van sincronizados.', party.peerName || T('la otra persona'))),
        h('div', { class: 'sb-party-reacts' }, ['😂', '😱', '❤️', '👏', '🍿', '😭'].map(e => h('button', { type: 'button', onclick: () => { partySend({ op: 'react', e }); partyReact(e); } }, e))),
        h('button', { class: 'sb-qbtn', type: 'button', onclick: () => partyClose() }, T('Desconectar')));
    } else {
      const join = h('textarea', { class: 'sb-party-code', rows: '3', placeholder: T('…o pega aquí la invitación que te han mandado') });
      keepFocus(join);
      body.append(
        h('p', {}, T('Veis lo mismo cada uno en su casa y, al dar a play, pausa o saltar, al otro le pasa lo mismo. Cada uno necesita su cuenta y StreamBox.')),
        h('button', { class: 'sb-qbtn main', type: 'button', onclick: () => { body.replaceChildren(h('p', {}, T('Preparando la invitación…'))); partyHost(body).catch(e => { report('ver juntos', e); body.replaceChildren(h('p', {}, T('No se pudo crear la invitación.'))); }); } }, '✨ ' + T('Crear invitación')),
        join,
        h('button', { class: 'sb-qbtn', type: 'button', onclick: () => partyJoin(body, join.value).catch(e => report('ver juntos', e)) }, T('Unirme')),
        h('small', { class: 'sb-party-note' }, T('La conexión es directa entre los dos navegadores (sin servidores de StreamBox). Si cambias de página en la plataforma puede cortarse: vuelve a conectar.')));
    }
    uiRoot().append(panel);
  }
  addEventListener('pagehide', () => { if (party) partySend({ op: 'bye' }); });

  // ---------- Marcadores: momentos guardados para volver a ellos ----------
  async function addBookmark(info, t, note) {
    const pl = P.player;
    let epId = '', label = '';
    try { epId = String(pl.currentId() || ''); } catch {}
    try { label = (pl.title && pl.title()) || ''; } catch {}
    const k = SB.keyOf(P.id, info.pid);
    if (!state.titles[k]) { SB.upsertTitle(state, Object.assign({ platform: P.id }, fullInfo(info))); await SB.save({ titles: state.titles }); }
    const { bookmarks = [] } = await chrome.storage.local.get('bookmarks');
    bookmarks.unshift({ id: SB.uid(), key: k, epId, label, t: Math.floor(t), note, url: location.href.split('#')[0], at: Date.now() });
    await chrome.storage.local.set({ bookmarks: bookmarks.slice(0, 500) });
  }
  // Volver a un momento: el gestor deja dicho qué título y en qué segundo; aquí, al arrancar el vídeo, se salta allí
  let seekDone = '', seekPlayClicked = '';
  async function pendingSeekTick() {
    const pl = P.player;
    if (!pl) return;
    const { pendingSeek } = await chrome.storage.local.get('pendingSeek');
    if (!pendingSeek || !pendingSeek.key.startsWith(P.id + ':') || Date.now() - pendingSeek.at > 10 * 60000 || seekDone === pendingSeek.id) return;
    // Si se abrió la ficha (Movistar Plus+, Disney+…), pulsar «Ver» una vez
    if (!pl.active()) {
      const pid = pendingSeek.key.split(':').slice(1).join(':'), pagePid = P.parseUrl(location.href);
      if (P.autoPlay && seekPlayClicked !== pendingSeek.id && Date.now() - pendingSeek.at < 90000 && (!pagePid || pagePid === pid)) {
        const b = P.autoPlay();
        if (b) { seekPlayClicked = pendingSeek.id; setTimeout(() => b.click(), 600); }
      }
      return;
    }
    const v = pl.video && pl.video();
    if (!v || !(v.readyState > 2) || !(v.duration > 0)) return;
    let cur = ''; try { cur = String(pl.currentId() || ''); } catch {}
    if (pendingSeek.epId && cur && cur !== pendingSeek.epId && !String(cur).startsWith(pendingSeek.epId.split('|')[0] + '|')) return;
    seekDone = pendingSeek.id;
    await ctl('seek', pendingSeek.t);
    await chrome.storage.local.remove('pendingSeek');
    toast(T('🔖 Volviendo a {0}', fmtTime(pendingSeek.t)) + (pendingSeek.note ? ' · ' + pendingSeek.note : ''));
  }
  setInterval(() => pendingSeekTick().catch(() => {}), 1500);

  // ---------- «Enviar a la tele con Chrome»: el gestor abre aquí el título y nosotros señalamos el «Enviar» de Chrome ----------
  (async () => {
    const { castHint } = await chrome.storage.local.get('castHint');
    if (!castHint || Date.now() - castHint.at > 120000 || !String(castHint.key || '').startsWith(P.id + ':')) return;
    await chrome.storage.local.remove('castHint');
    const close = () => box.remove();
    const box = shield(h('div', { id: 'sb-casthint', class: 'sb-ui', role: 'dialog' },
      h('div', { class: 'sb-ch-arrow', 'aria-hidden': 'true' }, '⬈'),
      h('b', {}, '📡 ' + T('Envíalo a tu tele')),
      h('ol', {},
        h('li', {}, T('Pulsa el icono de enviar de Chrome (arriba a la derecha) o ⋮ › Enviar, guardar y compartir › Enviar…')),
        h('li', {}, T('Elige tu Chromecast o Google TV.')),
        h('li', {}, T('Dale al play aquí: se verá en la tele.'))),
      h('small', {}, T('Consejo: en la ventana de enviar, clic derecho en su icono › «Mostrar siempre el icono» y lo tendrás a un clic.')),
      h('button', { class: 'sb-qbtn', type: 'button', onclick: close }, T('Entendido'))));
    uiRoot().append(box);
    setTimeout(() => box.isConnected && box.classList.add('out'), 45000);
    setTimeout(close, 45600);
  })().catch(() => {});

  // ---------- Diario de lo que ves: minutos por título y día, y los episodios ----------
  // Sirve para las estadísticas, el resumen del año, «¿Qué veo esta noche?» (lo ya visto no se propone),
  // el maratón (episodios de cada día) y la calculadora de suscripciones (cuánto usas cada plataforma).
  let histAcc = {}, histLastTick = 0, histFlushAt = Date.now();
  const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function playingKey() {
    const pl = P.player;
    if (!pl || !pl.active()) { lastPlayerInfo = null; return null; }
    if (lastPlayerInfo && lastPlayerInfo.info && lastPlayerInfo.info.pid) return { key: SB.keyOf(P.id, lastPlayerInfo.info.pid), info: lastPlayerInfo.info };
    const cur = state.queue && state.queue.playing && queueHead();
    if (cur && cur.k.startsWith(P.id + ':')) return { key: cur.k, info: state.titles[cur.k] || {} };
    return null;
  }
  function histTick() {
    const now = Date.now(), dt = Math.min(30, (now - (histLastTick || now)) / 1000);
    histLastTick = now;
    if (!enabled()) return;
    const pl = P.player, v = pl && pl.active() && pl.video();
    if (!v || v.paused || v.ended || !(v.readyState > 2)) return;
    const pk = playingKey();
    if (!pk) return;
    const a = histAcc[pk.key] || (histAcc[pk.key] = { s: 0, eps: new Set(), info: pk.info });
    a.s += dt;
    try { const id = pl.currentId && pl.currentId(); if (id) a.eps.add(String(id)); } catch {}
    if (now - histFlushAt > 60000) histFlush();
  }
  async function histFlush() {
    histFlushAt = Date.now();
    const acc = histAcc; histAcc = {};
    const keys = Object.keys(acc).filter(k => acc[k].s >= 1);
    if (!keys.length) return;
    try {
      const { history = { v: 1, days: {}, titles: {} } } = await chrome.storage.local.get('history');
      const day = history.days[dayKey()] || (history.days[dayKey()] = {});
      for (const k of keys) {
        const d = day[k] || (day[k] = { m: 0, eps: [] });
        d.m = Math.round((d.m + acc[k].s / 60) * 10) / 10;
        for (const e of acc[k].eps) if (!d.eps.includes(e)) d.eps.push(e);
        // Una copia de lo básico del título, para que las estadísticas no dependan de que siga guardado
        const t = state.titles[k] || acc[k].info || {};
        history.titles[k] = { title: t.title || (history.titles[k] || {}).title || '', platform: P.id, type: t.type || (history.titles[k] || {}).type || '', img: t.img || (history.titles[k] || {}).img || '', cats: t.cats || (history.titles[k] || {}).cats || [], year: t.year || '' };
      }
      await chrome.storage.local.set({ history });
    } catch (e) { report('diario', e); Object.assign(histAcc, acc); }
  }
  setInterval(histTick, 5000);
  addEventListener('pagehide', () => histFlush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) histFlush(); });

  // Diagnóstico: en la consola (filtro «StreamBox») se ve si está activo y qué encuentra
  try { console.info('[StreamBox] activo en ' + P.name + ' · v' + chrome.runtime.getManifest().version); } catch {}
  setTimeout(() => {
    try {
      const n = P.cards(document).length, s = P.spots({ titles: state.titles }).length;
      console.info('[StreamBox] ' + P.name + ': ' + n + ' miniaturas con botón, ' + s + ' botones en ficha o reproductor · ' + location.pathname);
    } catch (e) { report('diagnóstico', e); }
  }, 5000);

  refresh();
})();
