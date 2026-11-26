// StreamBox — adaptador de Prime Video (www.primevideo.com y amazon.es/.com/… en /gp/video).
// La clave de cada título es el id de su ficha, que va en los enlaces /detail/ID (o /gp/video/detail/ID).
(() => {
  const HOSTS = ['primevideo.com', 'amazon.es', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it'];
  // El id son mayúsculas y números (10 o más); los trozos con minúsculas o guiones son el nombre del título
  function parseUrl(href) {
    let path;
    try { path = new URL(href, location.href).pathname; } catch { return null; }
    const m = path.match(/\/detail\/(.+)$/) || path.match(/\/dp\/(.+)$/);
    if (!m) return null;
    return m[1].split('/').find(seg => /^[A-Z0-9]{10,}$/.test(seg)) || null;
  }
  const titleUrl = pid => 'https://www.primevideo.com/detail/' + pid;
  // Para la cola: abrir la ficha con reproducción automática (en el dominio desde el que se guardó)
  const watchUrl = (pid, t) => ((t && t.url) || titleUrl(pid)).split('?')[0].replace(/\/ref=.*$/, '') + '?autoplay=1';

  function parseMeta(html) {
    const out = SB.parseHtmlMeta(html);
    if (!out.type) {
      const et = (html.match(/"entityType"\s*:\s*"([^"]+)"/) || [])[1] || '';
      out.type = /tv|season|series|episode/i.test(et) ? 'series' : /movie/i.test(et) ? 'movie' : '';
    }
    if (!out.type && /"seasonNumber"|data-automation-id="ep-/.test(html)) out.type = 'series';
    if (!out.year) out.year = (html.match(/data-automation-id="release-year-badge"[^>]*>\s*(\d{4})/) || [])[1] || '';
    // Géneros: en los datos de la página («genres»:[{ "id":"av_genre_comedy", "text":"Comedia" }…]) o en los enlaces de la ficha
    const g = [];
    const js = html.match(/"genres"\s*:\s*\[([^\]]*)\]/);
    if (js) for (const o of js[1].matchAll(/\{[^{}]*\}|"([^"]+)"/g)) {
      if (o[1]) { g.push(o[1]); continue; }
      const f = k => (o[0].match(new RegExp('"' + k + '"\\s*:\\s*"([^"]+)"')) || [])[1];
      const v = f('text') || f('displayName') || f('name') || f('id');
      if (v) g.push(v);
    }
    for (const m of html.matchAll(/data-testid="genresMetadata"[\s\S]{0,1200}?<\/div>/g)) g.push(...m[0].replace(/<[^>]+>/g, ',').split(','));
    out.genres = SB.cleanGenres(out.genres.concat(g).filter(x => !/^\s*(•|,)?\s*$/.test(x)));
    return out;
  }
  async function fetchMeta(pid, fetchFn = fetch) {
    const res = await fetchFn(titleUrl(pid), { credentials: 'include' });
    if (!res.ok) throw new Error('Prime Video ' + res.status);
    return parseMeta(await res.text());
  }

  // «Se va pronto»: si la página del título dice hasta cuándo está disponible
  async function leavingCheck(pid, t, fetchFn = fetch) {
    const res = await fetchFn(titleUrl(pid), { credentials: 'include' });
    if (!res.ok) return 0;
    const html = await res.text();
    return SB.leavingFromText(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, '\n'));
  }

  // ---------- Seguimiento: temporadas y episodios (sirve también en segundo plano: solo texto, sin DOM) ----------
  // En la ficha: el selector de temporadas (enlaces a la ficha de cada una) y la lista de episodios con su fecha
  function parseSeasons(html) {
    const out = [];
    const i = html.indexOf('data-testid="dp-season-selector"');
    if (i < 0) return out;
    const block = html.slice(i, i + 60000);
    for (const m of block.matchAll(/<a\b[^>]*href="([^"]*\/detail\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const label = SB.decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (label && !out.some(x => x.label === label)) out.push({ href: SB.decodeEntities(m[1]), label });
    }
    return out;
  }
  function parseEpisodes(html) {
    const eps = [];
    const parts = html.split('data-testid="episode-list-item"').slice(1);
    for (const p of parts) {
      const seg = p.slice(0, 40000);
      const num = (seg.replace(/<[^>]+>/g, ' ').match(/>?\s(\d{1,3})\.\s/) || [])[1];
      const date = (seg.match(/data-testid="episode-release-date"[^>]*>([^<]+)</) || [])[1];
      eps.push({ n: num ? +num : eps.length + 1, date: date ? SB.parseDate(date) : 0 });
    }
    return eps;
  }
  async function followCheck(pid, t, fetchFn = fetch) {
    const base = 'https://www.primevideo.com';
    const get = async url => { const r = await fetchFn(url, { credentials: 'include' }); if (!r.ok) throw new Error('Prime Video ' + r.status); return r.text(); };
    let html = await get(titleUrl(pid));
    const seasons = parseSeasons(html);
    // La última temporada (la del final del selector) tiene su propia ficha
    const last = seasons[seasons.length - 1];
    if (last) {
      const lp = parseUrl(new URL(last.href, base).href);
      if (lp && lp !== pid) html = await get(titleUrl(lp));
    }
    const eps = parseEpisodes(html);
    if (!eps.length && !seasons.length) return null;
    const now = Date.now() + 86400000; // un día de margen por la zona horaria
    const out = eps.filter(e => !e.date || e.date <= now);
    const future = eps.filter(e => e.date && e.date > now).map(e => e.date).sort((a, b) => a - b);
    const latest = Math.max(0, ...out.map(e => e.date || 0));
    const label = last ? last.label : 'T1';
    return { seasons: seasons.length || 1, season: label, lastSeason: label, episodes: out.length, latest: latest || 0, next: future[0] || 0 };
  }

  // ---------- Solo dentro de Prime Video ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const goodImg = img => img && (img.currentSrc || img.src) && !(img.currentSrc || img.src).startsWith('data:') ? (img.currentSrc || img.src) : '';
  const cleanUrl = href => { try { const u = new URL(href, location.href); return u.origin + u.pathname.replace(/\/ref=.*$/, ''); } catch { return ''; } };
  const typeOf = s => /tv|season|series|episode|serie/i.test(s || '') ? 'series' : /movie|pel[ií]cula|film/i.test(s || '') ? 'movie' : '';
  const PLAYER = '.dv-player-fullscreen, #dv-web-player';

  // Nombre a partir del enlace: /detail/Matilda/0ABC… → «Matilda»
  function slugTitle(href) {
    let path; try { path = new URL(href, location.href).pathname; } catch { return ''; }
    const m = path.match(/\/detail\/(.+)$/);
    const seg = m && m[1].split('/').find(x => x && !/^[A-Z0-9]{10,}$/.test(x) && !/^ref=/.test(x));
    return seg ? decodeURIComponent(seg).replace(/[-_]+/g, ' ').trim() : '';
  }
  function cards(root = document) {
    const out = [], seen = new Set();
    for (const a of $$('a[href*="/detail/"], a[href*="/gp/video/detail/"]', root)) {
      if (a.closest('.sb-ui, ' + PLAYER)) continue;
      const pid = parseUrl(a.getAttribute('href'));
      if (!pid || pid === currentPagePid()) continue;
      const card = a.closest('article, [data-testid*="card"], li') || a;
      const img = $('img', card);
      if (!img || seen.has(card)) continue;
      seen.add(card);
      const dc = card.closest('[data-card-title]') || $('[data-card-title]', card);
      const tEl = $('[data-testid*="title"], [data-automation-id*="title"], h2, h3', card);
      const title = (dc && dc.getAttribute('data-card-title')) || a.getAttribute('aria-label') || img.alt || slugTitle(a.getAttribute('href')) || (tEl ? tEl.textContent : '');
      const et = (dc && dc.getAttribute('data-card-entity-type')) || card.getAttribute('data-card-entity-type');
      out.push({ el: card, imgEl: img, pid, title: title.trim(), img: goodImg(img), url: cleanUrl(a.getAttribute('href')), type: typeOf(et), year: '' });
    }
    return out;
  }

  // Enlaces con «?gti=…» (los de JustWatch o StreamBox → Descubrir): la ficha de verdad está en el «canonical»
  const currentPagePid = () => {
    if (!/\/detail/.test(location.pathname)) return null;
    const pid = parseUrl(location.href);
    if (pid) return pid;
    const c = document.querySelector('link[rel="canonical"]');
    return c ? parseUrl(c.href) : null;
  };

  function pageInfo(pid) {
    const tImg = $('[data-testid="title-art"] img, [data-automation-id="title-art"] img');
    const h1 = $('h1[data-automation-id="title"], [data-testid="dv-node-dp-title"], h1');
    const yearEl = $('[data-automation-id="release-year-badge"], [data-testid="release-year-badge"]');
    const runtime = $('[data-automation-id="runtime-badge"], [data-testid="runtime-badge"]');
    const play = $('[data-testid="dp-atf-play-button"]');
    let type = SB.typeFromText(runtime ? runtime.textContent : '');
    if (!type && ($('[data-testid="dp-season-selector"], [data-automation-id*="season"], [data-testid*="episode"], #tab-content-episodes') || /\b(T|S)\d+\s*E\d+/.test(play ? play.textContent : ''))) type = 'series';
    const og = (document.querySelector('meta[property="og:image"]') || {}).content || '';
    const bg = $('[data-testid="base-image"] img, [data-automation-id="hero-background"] img, picture img');
    const genres = $$('[data-testid="genresMetadata"] a, [data-testid*="genre"] a, [data-automation-id*="genre"] a').map(a => a.textContent);
    return {
      pid, title: (tImg && tImg.alt) || (h1 && h1.textContent.trim()) || SB.cleanTitle(document.title),
      type, year: ((yearEl ? yearEl.textContent : '').match(/\d{4}/) || [''])[0], img: og || goodImg(bg), url: cleanUrl(location.href),
      genres: SB.cleanGenres(genres),
    };
  }

  // Fila de botones redondos de la ficha (tráiler, lista, me gusta, compartir…): al menos 3 botones
  // cuadrados del mismo tamaño en la parte de arriba a la izquierda
  function roundRow() {
    // Solo cerca del botón «Reproducir» y fuera de las filas de carátulas
    const play = $('[data-testid="dp-atf-play-button"], [data-automation-id="play-button"], [data-testid*="play-button"]');
    const pr = play && play.getBoundingClientRect();
    const round = $$('button, a[role="button"]').filter(b => {
      if (b.closest('.sb-ui, li, article, [data-testid*="carousel"], ' + PLAYER)) return false;
      const r = b.getBoundingClientRect();
      if (pr && pr.width && Math.abs(r.top - pr.top) > 260) return false;
      return r.width >= 32 && r.width <= 72 && Math.abs(r.width - r.height) <= 6 && r.top > 0 && r.top < innerHeight && r.left < innerWidth * 0.7;
    });
    for (const b of round) {
      let el = b;
      while (el.parentElement && el.parentElement !== document.body) {
        el = el.parentElement;
        const inside = round.filter(x => el.contains(x));
        if (inside.length >= 3) {
          // Comprobar que están en una misma fila
          const tops = inside.map(x => Math.round(x.getBoundingClientRect().top));
          if (Math.max(...tops) - Math.min(...tops) > 10) break;
          return { parent: el, size: Math.round(b.getBoundingClientRect().width) };
        }
        if (inside.length > 1) continue;
      }
    }
    return null;
  }

  function playerActive() {
    const box = $(PLAYER);
    const v = box && $$('video', box).find(x => x.getClientRects().length);
    return !!(box && v && box.getClientRects().length);
  }

  function spots() {
    const out = [];
    const pid = currentPagePid();
    if (playerActive()) {
      // Botón junto a los de arriba a la derecha del reproductor (subtítulos, ajustes, pantalla completa)
      const box = $(PLAYER);
      // Delante del botón de pantalla completa, dentro de la fila de botones de arriba
      const fs = $('button[class*="fullscreen-button"], button[aria-label*="ullscreen"], button[aria-label*="antalla completa"], button[aria-label*="Vollbild"]', box);
      const slot = fs && SB.rowSlot(fs, 3);
      if (pid && slot) {
        const info = Object.assign(pageInfo(pid), {});
        const name = $('[class*="atvwebplayersdk-title-text"]', box);
        if (name && name.textContent.trim()) info.title = name.textContent.trim();
        out.push({ root: box, kind: 'player', info, slot: Object.assign(slot, { mimic: slot.before !== fs, size: Math.round(fs.getBoundingClientRect().height) || 36 }) });
      }
      return out;
    }
    if (pid) {
      const row = roundRow();
      let slot = null;
      if (row) slot = { parent: row.parent, cls: 'sb-round', compact: true, size: row.size };
      else {
        const play = $('[data-testid="dp-atf-play-button"], [data-automation-id="play-button"], [data-testid*="play-button"]');
        const box = $('[data-testid="dp-action-box"], [data-automation-id="action-box"], [data-testid*="action-box"]') || (play && play.parentElement && play.parentElement.parentElement);
        if (box) slot = { parent: box };
      }
      out.push({ root: document.body, kind: 'detail', info: pageInfo(pid), slot });
    }
    return out;
  }

  // Reproductor: «Omitir introducción» y «Omitir resumen» son el mismo botón con distinto texto
  const player = {
    title: () => ['.atvwebplayersdk-title-text', '.atvwebplayersdk-subtitle-text'].map(s => { const e = document.querySelector(s); return e && e.textContent.trim(); }).filter(Boolean).join(' · '),
    active: playerActive,
    skipIntro: { generic: '[class*="skipelement"]', text: /intro|apertura|opening|abertura|vorspann/i },
    skipRecap: { generic: '[class*="skipelement"]', text: /resumen|recap|resumo|previously|anteriormente|rückblick/i },
    autoNext: { sel: '[class*="nextupcard-button"], #atvwebplayersdk-next-episode-button' },
    // El id de la URL es el de la serie; el episodio se distingue por el subtítulo del reproductor
    currentId: () => {
      const sub = $('[class*="atvwebplayersdk-subtitle-text"]');
      return (currentPagePid() || '') + (sub ? '|' + sub.textContent.trim() : '');
    },
    video: () => $$('.dv-player-fullscreen video, #dv-web-player video').find(v => v.duration > 0 && v.getClientRects().length) || null,
    credits: '[class*="nextupcard-wrapper"], [class*="nextupcard"]:not([class*="button"])',
  };

  async function enrich(pid) {
    try { return await fetchMeta(pid); } catch (e) { console.warn('[StreamBox] Prime Video', pid, e); return {}; }
  }

  SBP.register({
    id: 'prime', name: 'Prime Video', short: 'prime', color: '#00a8e1', hosts: HOSTS,
    parseUrl, titleUrl, watchUrl, fetchMeta, parseMeta, cards, spots, enrich, player, followCheck, leavingCheck,
    dark: () => true,
  });
})();
