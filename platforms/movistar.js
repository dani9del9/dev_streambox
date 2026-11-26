// StreamBox — adaptador de Movistar Plus+ (ver.movistarplus.es).
// La clave de cada título es el número de su ficha: /ficha/<nombre>?id=NÚMERO (el nombre no importa).
// Los episodios y temporadas tienen su propio número: se guarda siempre el de la serie.
// Cada ficha trae sus datos en la página («datos_ficha»): título, tipo, año, género, temporadas y episodios con su fecha.
(() => {
  const ORIGIN = 'https://ver.movistarplus.es';
  function parseUrl(href) {
    let u;
    try { u = new URL(href, typeof location !== 'undefined' ? location.href : ORIGIN); } catch { return null; }
    if (!/(^|\.)movistarplus\.es$/.test(u.hostname) || !/^\/ficha\//.test(u.pathname)) return null;
    const id = u.searchParams.get('id');
    return id && /^\d{3,}$/.test(id) ? id : null;
  }
  const slugOf = url => { try { return (new URL(url, ORIGIN).pathname.match(/^\/ficha\/(.+)$/) || [])[1] || 'x'; } catch { return 'x'; } };
  const titleUrl = (pid, t) => ORIGIN + '/ficha/' + (t && t.url ? slugOf(t.url) : 'x') + '?id=' + pid;
  // Para la cola: la ficha; al llegar StreamBox pulsa «Ver ahora» / «Continuar»
  const watchUrl = (pid, t) => titleUrl(pid, t);

  // «const datos_ficha = {…}» dentro de un <script> de la página
  function fichaData(html) {
    const i = html.indexOf('datos_ficha = {');
    if (i < 0) return null;
    const k = html.indexOf('{', i);
    let depth = 0, inS = false;
    for (let x = k; x < html.length; x++) {
      const c = html[x];
      if (inS) { if (c === '\\') x++; else if (c === '"') inS = false; continue; }
      if (c === '"') inS = true;
      else if (c === '{') depth++;
      else if (c === '}' && !--depth) { try { return JSON.parse(html.slice(k, x + 1)); } catch { return null; } }
    }
    return null;
  }
  const isSeriesData = d => /^(serie|temporada|episodio)$/i.test(d.TipoContenido || '') || /^series\//.test(d.rutaNormalizada || '');
  // El número de la serie a la que pertenece una ficha (la propia si ya es la serie)
  const seriesIdOf = d => String((/^(temporada|episodio)$/i.test(d.TipoContenido || '') && (d.IdSerie || (d.Contenedor && d.Contenedor.Id))) || d.Id || '');
  const imgOf = d => {
    const im = d.imagenes || [];
    const pick = id => (im.find(x => x.id === id) || {}).uri;
    // La imagen horizontal del catálogo es pequeña (205×154): mejor la de fondo (1920×1080) o el cartel
    return pick('watch2tgr-end') || pick('default') || pick('vertical') || pick('horizontal') || d.imagen || '';
  };
  function metaFromData(d, html = '') {
    const series = isSeriesData(d);
    const og = (html.match(/property="og:image" content="([^"]+)"/) || [])[1] || '';
    const name = series ? (d.TituloSerie || (d.Contenedor && d.Contenedor.TituloSerie) || String(d.titulo || '').replace(/\s*\(T\d+\).*$/, '')) : d.titulo;
    return {
      pid: seriesIdOf(d),
      title: SB.decodeEntities(String(name || '').trim()),
      type: series ? 'series' : /^cine\//.test(d.rutaNormalizada || '') || /individual/i.test(d.TipoContenido || '') ? 'movie' : '',
      year: String(d.ano || '').match(/\d{4}/) ? String(d.ano).match(/\d{4}/)[0] : '',
      img: imgOf(d) || SB.decodeEntities(og),
      genres: SB.cleanGenres(String(d.genero || '').split(/\s*[,/]\s*/)),
      seasons: (d.Temporadas || []).map(t => ({ id: String(t.Id), label: t.Titulo, eps: +t.Episodios || 0 })),
      episodes: d.episodios || [],
    };
  }
  function parseMeta(html) {
    const d = fichaData(html);
    if (!d) return SB.parseHtmlMeta(html);
    const m = metaFromData(d, html);
    return { title: m.title, type: m.type, year: m.year, img: m.img, genres: m.genres };
  }
  async function getFicha(pid, fetchFn = fetch) {
    const res = await fetchFn(titleUrl(pid), { credentials: 'include' });
    if (!res.ok) throw new Error('Movistar Plus+ ' + res.status);
    const html = await res.text();
    const d = fichaData(html);
    return d ? metaFromData(d, html) : null;
  }
  async function fetchMeta(pid, fetchFn = fetch) {
    const m = await getFicha(pid, fetchFn);
    if (!m) throw new Error('Movistar Plus+: ficha sin datos');
    // Una ficha de episodio o temporada: los datos son los de la serie
    if (m.pid && m.pid !== String(pid)) { const s = await getFicha(m.pid, fetchFn).catch(() => null); if (s) return Object.assign({}, s, { pid: s.pid || m.pid }); }
    return m;
  }

  // ---------- Seguimiento (sirve también en segundo plano): temporadas y episodios con su fecha ----------
  async function followCheck(pid, t, fetchFn = fetch) {
    const m = await getFicha(pid, fetchFn);
    if (!m) return null;
    const last = m.seasons[m.seasons.length - 1];
    let eps = m.episodes;
    if (last && last.id !== String(pid)) { const s = await getFicha(last.id, fetchFn).catch(() => null); if (s && s.episodes.length) eps = s.episodes; }
    const dateOf = e => { const v = e && e.VodItems && e.VodItems[0] && e.VodItems[0].FechaInicioPublicacion; return +v || 0; };
    const now = Date.now() + 3600000;
    const out = eps.filter(e => !dateOf(e) || dateOf(e) <= now);
    const future = eps.map(dateOf).filter(x => x > now).sort((a, b) => a - b);
    const latest = Math.max(0, ...out.map(dateOf));
    const label = last ? last.label : 'T1';
    if (!eps.length && !m.seasons.length) return null;
    return { seasons: m.seasons.length || 1, season: label, lastSeason: label, episodes: eps.length ? out.length : (last ? last.eps : 0), latest, next: future[0] || 0 };
  }

  // «Se va pronto»: la fecha de fin de publicación (de la película, o del último episodio de la última temporada)
  async function leavingCheck(pid, t, fetchFn = fetch) {
    const res = await fetchFn(titleUrl(pid), { credentials: 'include' });
    if (!res.ok) return 0;
    const d = fichaData(await res.text());
    if (!d) return 0;
    const fin = x => +(x && x.VodItems && x.VodItems[0] && x.VodItems[0].FechaFinPublicacion) || 0;
    let ends = [fin(d)];
    if (isSeriesData(d)) {
      const last = (d.Temporadas || [])[(d.Temporadas || []).length - 1];
      let eps = d.episodios || [];
      if (last) { const r2 = await fetchFn(titleUrl(last.Id), { credentials: 'include' }).catch(() => null); const d2 = r2 && r2.ok ? fichaData(await r2.text()) : null; if (d2 && d2.episodios) eps = d2.episodios; }
      ends = eps.map(fin);
    }
    const max = Math.max(0, ...ends.filter(Boolean));
    return max > Date.now() - 864e5 && max < Date.now() + 400 * 864e5 ? max : 0;
  }

  // ---------- Solo dentro de Movistar Plus+ ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const cleanUrl = href => { try { const u = new URL(href, location.href); const id = u.searchParams.get('id'); return u.origin + u.pathname + (id ? '?id=' + id : ''); } catch { return ''; } };
  const goodImg = img => img && (img.currentSrc || img.src) && !(img.currentSrc || img.src).startsWith('data:') ? (img.currentSrc || img.src) : '';

  // Episodios y temporadas → su serie (lo que ya se sabe, para que el botón de la miniatura marque bien)
  const SER = 'sb-mplus-series';
  const serCache = () => { try { return JSON.parse(sessionStorage.getItem(SER) || '{}'); } catch { return {}; } };
  const serSet = (id, sid) => { try { const c = serCache(); c[id] = sid; sessionStorage.setItem(SER, JSON.stringify(c)); } catch {} };

  // Los datos de la ficha abierta (se leen una vez por página)
  let pageCache = { href: '', data: null };
  function pageData() {
    if (pageCache.href === location.href) return pageCache.data;
    let d = null;
    for (const s of $$('script:not([src])')) { if (s.textContent.includes('datos_ficha')) { d = fichaData(s.textContent); if (d) break; } }
    pageCache = { href: location.href, data: d };
    return d;
  }
  const currentPagePid = () => {
    if (!/^\/ficha\//.test(location.pathname)) return null;
    const d = pageData();
    if (d) { const sid = seriesIdOf(d); const own = String(d.Id || ''); if (sid && own && sid !== own) serSet(own, sid); return sid || own || null; }
    return parseUrl(location.href);
  };

  function cards(root = document) {
    if (playerActive()) return [];
    const out = [], seen = new Set();
    const here = currentPagePid(), cache = serCache();
    for (const a of $$('a[href*="/ficha/"]', root)) {
      if (a.closest('.sb-ui')) continue;
      const card = a.closest('.miniFicha, li, article') || a;
      if (seen.has(card)) continue;
      const img = $('img', card);
      if (!img) continue;
      let pid = parseUrl(a.getAttribute('href')) || (card.dataset && card.dataset.elemento);
      if (!pid) continue;
      // Enlace de episodio (/ficha/serie-t2/episodio-6): si ya sabemos de qué serie es, se usa la serie
      const path = (() => { try { return new URL(a.href).pathname; } catch { return ''; } })();
      const isEp = /^\/ficha\/[^/]+\/[^/]+/.test(path) || /-t\d+$/.test(path);
      const known = !!cache[pid];
      if (known) pid = cache[pid];
      if (String(pid) === here) continue;
      seen.add(card);
      const title = (img.getAttribute('alt') || img.getAttribute('title') || a.getAttribute('title') || '').trim();
      // El texto de la miniatura de un episodio es el del episodio: el de la serie se busca al abrir el menú
      out.push({
        el: card, imgEl: img, pid: String(pid), title: isEp ? '' : title, img: isEp ? '' : goodImg(img), url: isEp ? '' : cleanUrl(a.href),
        type: isEp ? 'series' : '', year: '', resolve: isEp && !known,
      });
    }
    return out;
  }

  // Antes de abrir el menú de una miniatura de episodio: averiguar su serie
  async function resolve(info) {
    const m = await fetchMeta(info.pid);
    if (!m || !m.pid) return null;
    if (m.pid !== String(info.pid)) serSet(String(info.pid), m.pid);
    return { pid: m.pid, title: m.title, type: m.type || 'series', year: m.year, img: m.img || info.img, genres: m.genres, url: '' };
  }

  function pageInfo() {
    const d = pageData();
    const pid = currentPagePid();
    if (!pid) return null;
    if (d) {
      const m = metaFromData(d, '');
      const og = ($('meta[property="og:image"]') || {}).content || '';
      // En una ficha de episodio o temporada, el enlace guardado es el de la serie
      const own = String(d.Id || '');
      return { pid, title: m.title || SB.cleanTitle(($('#titulo') || {}).textContent || ''), type: m.type, year: m.year, img: m.img || og,
        url: own === pid ? cleanUrl(location.href) : '', genres: m.genres };
    }
    return { pid, title: (($('h1#titulo, h1') || {}).textContent || '').trim(), type: '', year: '', img: ($('meta[property="og:image"]') || {}).content || '', url: cleanUrl(location.href), genres: [] };
  }

  // ---------- Reproductor (se abre encima de la ficha, sin cambiar de dirección) ----------
  const PLAYER = '#object-player-multidrm';
  function playerActive() {
    const box = $(PLAYER), v = box && $('video', box);
    return !!(box && v && box.getClientRects().length && v.getClientRects().length);
  }
  const playerTitle = () => { const s = $('.pyr-btn-video__txtChannel'); return s ? s.textContent.trim() : ''; };
  // La barra de abajo es una rejilla con huecos vacíos: el nuestro va en el hueco junto a «Audio/Subtítulos»
  function playerSlot() {
    const fs = $('#pyr-fullsize-button');
    const audio = $('#pyr-conf-audio-button');
    const cell = fs && fs.parentElement;
    if (!cell) return null;
    const ref = audio || cell;
    let gap = ref.previousElementSibling;
    if (gap && gap.classList.contains('sb-wrap')) return { parent: gap, prepend: true, size: Math.round(fs.getBoundingClientRect().height) || 50 };
    if (gap && !gap.id && ![...gap.children].some(c => c.getClientRects().length && c.getBoundingClientRect().width > 0)) {
      gap.classList.add('sb-wrap');
      // A la misma altura que «Pantalla completa» dentro de su celda
      const off = Math.max(0, Math.round(fs.getBoundingClientRect().top - cell.getBoundingClientRect().top));
      Object.assign(gap.style, { display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: off + 'px', boxSizing: 'border-box' });
      return { parent: gap, prepend: true, size: Math.round(fs.getBoundingClientRect().height) || 50 };
    }
    return { near: fs, size: Math.round(fs.getBoundingClientRect().height) || 50 };
  }

  function spots() {
    const out = [];
    const info = pageInfo();
    if (!info) return out;
    if (playerActive()) {
      const slot = playerSlot();
      if (slot) out.push({ root: $(PLAYER), kind: 'player', info, slot });
      return out;
    }
    // A la derecha de «Ver ahora» / «Comenzar a ver», en la misma fila y a su altura
    const play = $('.btnGrey[id^="play_"]');
    const box = play && (play.closest('.btnGreyContainer') || play.closest('.buttonBox'));
    if (box && box.style.display !== 'inline-flex') Object.assign(box.style, { display: 'inline-flex', alignItems: 'center', flexWrap: 'nowrap', width: 'auto', maxWidth: 'none' });
    // (sobresale a la derecha de su caja: así el «T1 E1» de encima sigue centrado sobre el botón verde)
    out.push({ root: document.body, kind: 'detail', info, slot: box ? { parent: box, cls: 'sb-mplus' } : null });
    return out;
  }

  // Botones del reproductor que se buscan por su texto
  const byText = re => () => $$('button, [role="button"], a, div[class*="skip"], div[class*="saltar"]', $(PLAYER) || document)
    .find(b => b.children.length < 4 && re.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')) && b.getClientRects().length) || null;
  const video = () => { const v = $(PLAYER + ' video'); return v && v.duration > 0 ? v : null; };
  const nearEnd = s => { const v = video(); return !!(v && v.duration > 300 && v.duration - v.currentTime <= s); };
  const player = {
    title: playerTitle,
    active: playerActive,
    skipIntro: { find: byText(/saltar (la )?intro|omitir (la )?intro|skip intro|saltar cabecera|saltar apertura/i) },
    skipRecap: { find: byText(/saltar (el )?resumen|omitir (el )?resumen|skip recap|anteriormente/i) },
    // «Siguiente episodio» está siempre arriba a la derecha: solo se pulsa al llegar a los créditos
    autoNext: { find: () => { const b = $('#pyr-nextchapter-button'); return b && nearEnd(25) && b.getClientRects().length ? b : null; } },
    // El reproductor no cambia la dirección: cada episodio se distingue por su título («Celeste (T1): Ep.1»)
    currentId: () => (currentPagePid() || '') + '|' + playerTitle(),
    video,
    credits: { find: () => (nearEnd(40) ? video() : null) },
  };

  // Para la cola: el botón «Ver ahora» / «Comenzar a ver» / «Continuar» de la ficha
  function autoPlay() {
    if (playerActive()) return null;
    const b = $('.btnGrey[id^="play_"]');
    return b && b.getClientRects().length ? b : null;
  }

  async function enrich(pid) {
    try { return await fetchMeta(pid); } catch (e) { console.warn('[StreamBox] Movistar Plus+', pid, e); return {}; }
  }

  SBP.register({
    id: 'movistar', name: 'Movistar Plus+', short: 'M+', color: SB_PLATFORMS.movistar.color, hosts: ['movistarplus.es'],
    parseUrl, titleUrl, watchUrl, fetchMeta, parseMeta, cards, spots, enrich, resolve, player, autoPlay, followCheck, leavingCheck,
    dark: () => true,
  });
})();
