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
    return out;
  }
  async function fetchMeta(pid, fetchFn = fetch) {
    const res = await fetchFn(titleUrl(pid), { credentials: 'include' });
    if (!res.ok) throw new Error('Prime Video ' + res.status);
    return parseMeta(await res.text());
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
  // El botón va en la caja de la imagen (no en la tarjeta, que crece al pasar el ratón)
  function imgBox(img, stop) {
    let el = img.parentElement;
    if (el && el.tagName === 'PICTURE') el = el.parentElement;
    if (el && getComputedStyle(el).display === 'inline' && el.parentElement) el = el.parentElement;
    return el && stop.contains(el) ? el : stop;
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
      out.push({ el: imgBox(img, card), pid, title: title.trim(), img: goodImg(img), url: cleanUrl(a.getAttribute('href')), type: typeOf(et), year: '' });
    }
    return out;
  }

  const currentPagePid = () => /\/detail\//.test(location.pathname) ? parseUrl(location.href) : null;

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
    return {
      pid, title: (tImg && tImg.alt) || (h1 && h1.textContent.trim()) || SB.cleanTitle(document.title),
      type, year: ((yearEl ? yearEl.textContent : '').match(/\d{4}/) || [''])[0], img: og || goodImg(bg), url: cleanUrl(location.href),
    };
  }

  // Fila de botones redondos de la ficha (tráiler, lista, me gusta, compartir…): al menos 3 botones
  // cuadrados del mismo tamaño en la parte de arriba a la izquierda
  function roundRow() {
    const round = $$('button, a[role="button"]').filter(b => {
      if (b.closest('.sb-ui')) return false;
      const r = b.getBoundingClientRect();
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
        out.push({ root: box, kind: 'player', info, slot: Object.assign(slot, { cls: 'sb-prime-player' }) });
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
    parseUrl, titleUrl, watchUrl, fetchMeta, parseMeta, cards, spots, enrich, player,
    dark: () => true,
  });
})();
