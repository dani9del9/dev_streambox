// StreamBox — adaptador de Netflix.
// La clave de cada título es su id numérico, que aparece en los enlaces /watch/ID, /title/ID y ?jbv=ID:
// así no dependemos de las clases CSS de Netflix (que cambian a menudo) para saber qué título es.
// Las clases solo se usan para encontrar dónde poner los botones y leer título, año y tipo; si fallan,
// los datos que falten se piden a la página pública del título (/title/ID) o a la caché de la propia web.
(() => {
  const ID_RE = /(?:\/watch\/|\/title\/|[?&]jbv=)(\d{5,})/;
  function parseUrl(href) {
    const m = String(href || '').match(ID_RE);
    return m ? m[1] : null;
  }
  const titleUrl = pid => 'https://www.netflix.com/title/' + pid;

  // Datos de la página pública del título (sin cookies: siempre da la versión pública, con JSON-LD)
  async function fetchMeta(pid, fetchFn = fetch) {
    const res = await fetchFn(titleUrl(pid), { credentials: 'omit' });
    if (!res.ok) throw new Error('Netflix ' + res.status);
    return parseMeta(await res.text());
  }
  function parseMeta(html) {
    const out = SB.parseHtmlMeta(html);
    if (!out.year) out.year = (html.match(/data-uia="item-year"[^>]*>\s*(\d{4})/) || [])[1] || '';
    return out;
  }

  // ---------- Solo dentro de netflix.com ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const MODAL_SEL = '.previewModal--container, [data-uia^="previewModal"], .detail-modal, .mini-modal';

  // id que Netflix guarda en el contexto de seguimiento (data-ui-tracking-context="%7B%22video_id%22:…")
  function trackingId(root) {
    const els = [root, ...$$('[data-ui-tracking-context]', root)].filter(e => e && e.getAttribute && e.getAttribute('data-ui-tracking-context'));
    for (const e of els) {
      const raw = e.getAttribute('data-ui-tracking-context');
      const m = (decodeURIComponent(raw).match(/"video_id"\s*:\s*"?(\d{5,})/) || []);
      if (m[1]) return m[1];
    }
    return null;
  }
  const goodImg = img => img && img.src && !img.src.startsWith('data:') ? img.src : '';

  // Miniaturas: las tarjetas de las filas, la búsqueda, «Mi lista», «Novedades»…
  function cards(root = document) {
    const out = [], seen = new Set();
    const push = (el, pid, title, img) => { if (!el || seen.has(el)) return; seen.add(el); out.push({ el, pid, title: (title || '').trim(), img, type: '', year: '' }); };
    for (const a of $$('a[href*="/watch/"], a[href*="/title/"], a[href*="jbv="]', root)) {
      if (a.closest('.sb-ui, ' + MODAL_SEL + ', .billboard, .billboard-row, [data-uia="billboard"]')) continue;
      const pid = parseUrl(a.getAttribute('href'));
      if (!pid) continue;
      const card = a.closest('.title-card, [class*="titleCard"], .slider-item, .gallery-item') || a;
      const img = $('img.boxart-image, img', card) || $('img', a);
      // Las tarjetas sin imagen (enlaces de texto, menús) no llevan botón
      if (!img) continue;
      const title = a.getAttribute('aria-label') || (img && img.alt) || ($('.fallback-text', card) || {}).textContent || '';
      push(card, pid, title, goodImg(img));
    }
    // Tarjetas sin enlace: el id va en el contexto de seguimiento
    for (const card of $$('.title-card', root)) {
      if (seen.has(card) || card.closest('.sb-ui, ' + MODAL_SEL)) continue;
      const pid = trackingId(card);
      const img = $('img', card);
      if (pid && img) push(card, pid, img.alt || ($('.fallback-text', card) || {}).textContent || '', goodImg(img));
    }
    return out;
  }

  function modalInfo(m, pid) {
    const logo = $('.previewModal--player-titleTreatment-logo, [data-uia*="titleTreatment"] img, img[class*="titleTreatment"]', m);
    const header = $('.previewModal--section-header strong, .about-header strong', m);
    const meta = $('.videoMetadata--container, .previewModal--detailsMetadata, [class*="videoMetadata"]', m);
    const metaText = meta ? meta.textContent : '';
    const durEl = $('.duration, [data-uia*="duration"]', m);
    let type = SB.typeFromText(durEl ? durEl.textContent : metaText);
    if (!type && $('.episodeSelector, [data-uia*="episode"], .episode-item', m)) type = 'series';
    const yearEl = $('.year, [data-uia*="year"]', m);
    const year = ((yearEl ? yearEl.textContent : metaText).match(/\b(19|20)\d{2}\b/) || [''])[0];
    const boxart = $('img.previewModal--boxart, .previewModal--player_container img, img.storyArt', m);
    return { pid, title: (logo && logo.alt) || (header && header.textContent) || '', type, year, img: goodImg(boxart) };
  }

  // Sitios donde va un botón «Añadir a lista» en línea: la ficha (modal grande), la vista previa al pasar
  // el ratón (modal pequeño), el cartel grande de la portada y la página pública /title/ID.
  // En el reproductor, /watch/ID es el id del episodio: se averigua la serie (o la peli) a la que pertenece
  const shows = new Map();
  function showOf(wid, rescan) {
    const c = shows.get(wid);
    if (c !== undefined) return c === 'pending' ? null : c;
    shows.set(wid, 'pending');
    // Se reintenta: el puente de la página puede cargarse un poco después que este script
    const tryAsk = async () => {
      let alive = false;
      for (let i = 0; i < 6 && !alive; i++) alive = !!(await ask('nf-ping', wid, 400));
      return alive ? ask('nf-show', wid, 6000) : null;
    };
    tryAsk().then(async d => {
      if (!d || !d.pid) d = await showFromPage(wid);
      shows.set(wid, d || false);
      if (d && rescan) rescan();
    });
    return null;
  }

  // Plan B: la página pública /title/<episodio> redirige a la de la serie; si no redirige, es una peli
  async function showFromPage(wid) {
    const vt = $('[data-uia="video-title"]');
    const name = vt ? (($('h4', vt) || vt).textContent || '').trim() : '';
    try {
      const res = await fetch(titleUrl(wid), { credentials: 'omit' });
      const pid = parseUrl(res.url) || wid;
      const meta = res.ok ? parseMeta(await res.text()) : {};
      if (pid !== wid || meta.title) return Object.assign({ title: name }, meta, { pid, type: meta.type || (pid !== wid ? 'series' : '') });
    } catch (e) { console.warn('[StreamBox] Netflix', e); }
    // Sin red: si el título del reproductor no tiene episodio, es una peli y su id vale
    const isEp = vt && vt.querySelectorAll('span').length > 0;
    return isEp ? null : { pid: wid, title: name, type: vt ? 'movie' : '' };
  }

  function spots(ctx = {}) {
    const out = [];
    // Reproductor: botón junto a los controles (al lado del de pantalla completa)
    if (player.active()) {
      const wid = parseUrl(location.pathname);
      const show = wid ? showOf(wid, ctx.rescan) : null;
      // Delante del botón de pantalla completa (o del de velocidad / subtítulos si no está)
      const ref = $('button[data-uia^="control-fullscreen"]') || $('[data-uia^="control-fullscreen"]') || $('button[data-uia="control-speed"]') || $('button[data-uia="control-audio-subtitle"]');
      const slot = ref && SB.rowSlot(ref, 3);
      if (show && slot) out.push({ root: slot.parent, kind: 'player', info: Object.assign({}, show), slot });
      return out;
    }
    for (const m of $$('.previewModal--container, .detail-modal, .mini-modal')) {
      if (out.some(s => s.root === m || s.root.contains(m) || m.contains(s.root))) continue;
      const isDetail = m.matches('.detail-modal, [class*="detail-modal"]') || !!m.closest('.detail-modal') || (!m.matches('.mini-modal') && !!$('.previewModal--detailsMetadata, .about-wrapper', m));
      const pid = (isDetail && parseUrl(location.href)) || trackingId(m) || (!isDetail && ctx.lastHover && ctx.lastHover.pid) || null;
      if (!pid) continue;
      const info = modalInfo(m, pid);
      if (!isDetail && ctx.lastHover && ctx.lastHover.pid === pid) {
        info.title = info.title || ctx.lastHover.title; info.img = ctx.lastHover.img || info.img;
      }
      const controls = $('.buttonControls--container, [data-uia*="mini-modal-controls"], [class*="buttonControls"]', m);
      out.push({ root: m, kind: isDetail ? 'detail' : 'mini', info, slot: controls ? { parent: controls } : { parent: m, floating: true } });
    }
    // Cartel grande de la portada (billboard)
    const bb = $('.billboard-row, .billboard, [data-uia="billboard"]');
    if (bb && !out.some(s => s.kind === 'detail')) {
      const a = $('a[href*="/watch/"], a[href*="/title/"]', bb);
      const pid = (a && parseUrl(a.getAttribute('href'))) || trackingId(bb);
      const links = $('.billboard-links, .billboard-buttons, [data-uia*="billboard-buttons"]', bb) || (a && a.parentElement);
      if (pid && links) {
        const logo = $('img.title-logo, .billboard-title img', bb);
        out.push({ root: bb, kind: 'billboard', info: { pid, title: logo ? logo.alt : '', type: '', year: '', img: goodImg($('img.hero, .hero-image-wrapper img', bb)) }, slot: { parent: links } });
      }
    }
    // Página pública del título (sin sesión o enlace directo)
    const pagePid = /\/title\/\d+/.test(location.pathname) && parseUrl(location.pathname);
    if (pagePid && !out.length) {
      const info = Object.assign(parseMeta(document.documentElement.outerHTML), { pid: pagePid });
      const slot = $('[data-uia="title-info-cta"], .title-info-cta, [data-uia*="hero-cta"], .btn-wrapper');
      out.push({ root: document.body, kind: 'page', info, slot: slot ? { parent: slot } : null });
    }
    return out;
  }

  // Datos de la caché de la web (falcorCache), leídos por netflix-bridge.js en el «mundo» de la página
  let seq = 0;
  const pageCache = pid => ask('nf-meta', pid, 800);
  function ask(kind, pid, ms) {
    return new Promise(res => {
      const id = 'sb' + (++seq);
      const on = e => {
        if (e.source !== window || !e.data || e.data.sbRes !== id) return;
        window.removeEventListener('message', on); res(e.data.data || null);
      };
      window.addEventListener('message', on);
      window.postMessage({ sbReq: kind, id, pid }, location.origin);
      setTimeout(() => { window.removeEventListener('message', on); res(null); }, ms);
    });
  }
  // Completa tipo, año, título y carátula: primero la caché de la web, si falta algo la página pública
  async function enrich(pid) {
    const out = {};
    const merge = d => { if (d) for (const k of ['title', 'type', 'year', 'img']) if (d[k] && !out[k]) out[k] = String(d[k]); };
    if (typeof window !== 'undefined' && location.hostname.endsWith('netflix.com')) merge(await pageCache(pid));
    if (!out.type || !out.year || !out.title) { try { merge(await fetchMeta(pid)); } catch (e) { console.warn('[StreamBox] Netflix', pid, e); } }
    return out;
  }

  // Reproductor: botones que StreamBox pulsa solo si lo activas en Ajustes
  // (Netflix los marca con data-uia; si cambia, se reconocen por el texto del botón de «saltar»)
  const SKIP_GENERIC = '.watch-video--skip-content-button, button[class*="skip-content"]';
  const player = {
    active: () => location.pathname.startsWith('/watch'),
    skipIntro: { sel: '[data-uia="player-skip-intro"]', generic: SKIP_GENERIC, text: /intro|apertura|opening|abertura/i },
    skipRecap: { sel: '[data-uia="player-skip-recap"], [data-uia="player-skip-preplay"]', generic: SKIP_GENERIC, text: /resumen|recap|resumo|previously|anteriormente/i },
    autoNext: { sel: '[data-uia="next-episode-seamless-button"], [data-uia="next-episode-seamless-button-draining"]' },
    // Para la cola: qué se está viendo y cuándo termina
    stillWatching: '[data-uia="interrupt-autoplay-continue"]',
    currentId: () => parseUrl(location.pathname),
    video: () => $$('video').find(v => v.duration > 0) || $('video'),
    credits: '[data-uia="watch-credits-seamless-button"], [data-uia*="postplay"], .PlayerControlsNeo__postplay, [class*="postplay"]',
  };
  const watchUrl = pid => 'https://www.netflix.com/watch/' + pid;

  SBP.register({
    id: 'netflix', name: 'Netflix', short: 'N', color: '#e50914', hosts: ['netflix.com'],
    parseUrl, titleUrl, watchUrl, fetchMeta, parseMeta, cards, spots, enrich, player,
    dark: () => true,
  });
})();
