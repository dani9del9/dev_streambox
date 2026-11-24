// StreamBox — adaptador de Disney+ (www.disneyplus.com).
// La clave de cada título es el id de su ficha: /browse/entity-<uuid> (y los antiguos /movies/…/ID y /series/…/ID).
// El reproductor de Disney+ usa shadow DOM: sus botones se buscan también dentro (player.deep).
(() => {
  function parseUrl(href) {
    const s = String(href || '');
    const m = s.match(/\/browse\/(entity-[0-9a-f-]{36})/i) || s.match(/\/(?:movies|series)\/[^/?#]+\/([A-Za-z0-9]{8,})/);
    return m ? m[1] : null;
  }
  const titleUrl = pid => /^entity-/.test(pid) ? 'https://www.disneyplus.com/browse/' + pid : 'https://www.disneyplus.com/search?q=' + pid;

  function parseMeta(html) { return SB.parseHtmlMeta(html); }
  async function fetchMeta(pid, fetchFn = fetch) {
    const res = await fetchFn(titleUrl(pid), { credentials: 'omit' });
    if (!res.ok) throw new Error('Disney+ ' + res.status);
    return parseMeta(await res.text());
  }

  // ---------- Solo dentro de Disney+ ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const goodImg = img => img && (img.currentSrc || img.src) && !(img.currentSrc || img.src).startsWith('data:') ? (img.currentSrc || img.src) : '';
  const cleanUrl = href => { try { const u = new URL(href, location.href); return u.origin + u.pathname; } catch { return ''; } };
  const legacyType = href => /\/series\//.test(href) ? 'series' : /\/movies\//.test(href) ? 'movie' : '';
  const isPlayer = () => /\/(video|play)\//.test(location.pathname);
  const currentPagePid = () => isPlayer() ? null : parseUrl(location.pathname);

  function cards(root = document) {
    if (isPlayer()) return [];
    const out = [], seen = new Set();
    for (const a of $$('a[href*="/browse/entity-"], a[href*="/movies/"], a[href*="/series/"]', root)) {
      if (a.closest('.sb-ui')) continue;
      const href = a.getAttribute('href');
      const pid = parseUrl(href);
      if (!pid || pid === currentPagePid()) continue;
      const card = a.closest('[data-testid="set-item"], [data-item-id], li, article') || a;
      const img = $('img', card);
      if (!img || seen.has(card)) continue;
      seen.add(card);
      // La etiqueta accesible suele ser «Título. Película. …»: nos quedamos con la primera parte
      const aria = (a.getAttribute('aria-label') || '').split(/\.\s|,\s/)[0];
      out.push({ el: card, pid, title: (img.alt || aria || '').trim(), img: goodImg(img), url: cleanUrl(href), type: legacyType(href), year: '' });
    }
    return out;
  }

  function pageInfo(pid) {
    const logo = $('[data-testid="details-title-treatment"] img, [data-testid*="title-treatment"] img, img[data-testid*="title-treatment"]');
    const h1 = $('h1');
    const meta = $('[data-testid="metadata-display"], [data-testid*="metadata"], [data-testid="details-metadata"]');
    const metaText = meta ? meta.textContent : '';
    let type = legacyType(location.pathname) || SB.typeFromText(metaText);
    if (!type && $$('[role="tab"], button').some(b => /^(episodios|episodes|episodes|épisodes)$/i.test(b.textContent.trim()))) type = 'series';
    const og = (document.querySelector('meta[property="og:image"]') || {}).content || '';
    const bg = $('[data-testid="background-image"] img, [data-testid*="hero"] img, picture img');
    return {
      pid, title: (logo && logo.alt) || (h1 && h1.textContent.trim()) || SB.cleanTitle(document.title),
      type, year: (metaText.match(/\b(19|20)\d{2}\b/) || [''])[0], img: og || goodImg(bg), url: cleanUrl(location.href),
    };
  }

  // El reproductor no dice qué título es: se recuerda la última ficha abierta en esta pestaña
  // y se comprueba con el nombre que sale arriba en el reproductor (o con tus títulos guardados)
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  function remember(info) { try { sessionStorage.setItem('sb-disney-last', JSON.stringify(info)); } catch {} }
  function lastPage() { try { return JSON.parse(sessionStorage.getItem('sb-disney-last') || 'null'); } catch { return null; } }
  function playerTitle() {
    const el = SB.deepAll('.title-field, [class*="title-field"], [data-testid*="title-field"]').find(e => e.textContent.trim());
    return el ? el.textContent.trim() : SB.cleanTitle(document.title).replace(/\s*\|\s*Disney\+.*$/i, '');
  }
  function playerInfo(titles) {
    const name = norm(playerTitle());
    const last = lastPage();
    if (last && (!name || norm(last.title) === name || name.startsWith(norm(last.title)))) return last;
    const saved = Object.values(titles || {}).find(t => t.platform === 'disney' && name && norm(t.title) === name);
    return saved ? { pid: saved.pid, title: saved.title, type: saved.type, year: saved.year, img: saved.img, url: saved.url } : null;
  }
  // Botones de arriba a la derecha del reproductor (audio y subtítulos, enviar…): el nuestro va a su izquierda
  function topRightButton() {
    const bs = SB.deepAll('button').filter(b => {
      if (b.closest('.sb-ui')) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.top < 140 && r.left > innerWidth * 0.55;
    });
    return bs.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
  }

  function spots(ctx = {}) {
    if (isPlayer()) {
      const info = playerInfo(ctx.titles);
      const ref = info && topRightButton();
      return ref ? [{ root: document.body, kind: 'player', info, slot: { near: ref } }] : [];
    }
    const pid = currentPagePid();
    if (!pid) return [];
    const play = $('[data-testid="browser-action-button"], [data-testid="playback-action-button"], [data-testid*="play-button"]');
    const box = $('[data-testid="details-featured-actions"], [data-testid*="featured-actions"]') || (play && play.parentElement);
    const info = pageInfo(pid);
    remember(info);
    return [{ root: document.body, kind: 'detail', info, slot: box ? { parent: box } : null }];
  }

  // Los botones del reproductor están dentro de shadow DOM anidados
  const shadow = (...path) => { let r = document; for (const sel of path) { const el = r && r.querySelector(sel); if (!el) return null; r = el.shadowRoot || el; } return r === document ? null : r; };
  const skipButton = re => () => {
    const b = shadow('skip-overlay', 'skip-button', 'button') || SB.deepAll('[data-testid*="skip"] button, button[class*="skip"]')[0];
    return b && re.test(b.textContent + ' ' + (b.getAttribute('aria-label') || '')) ? b : null;
  };
  const player = {
    active: isPlayer,
    skipIntro: { find: skipButton(/intro|introducci|apertura|opening|vorspann/i) },
    skipRecap: { find: skipButton(/resumen|recap|resumo|previously|anteriormente|rückblick/i) },
    autoNext: { find: () => shadow('up-next-lite-v1', 'button') || $('[data-gv2elementkey="playNext"], [data-testid="up-next-play-button"]') },
    // Cada episodio tiene su propio id en /play/ID (o /video/ID)
    currentId: () => (location.pathname.match(/\/(?:video|play)\/([^/?#]+)/) || [])[1] || null,
    video: () => $$('video').find(v => v.duration > 0 && v.getClientRects().length) || null,
    credits: { find: () => $('up-next-lite-v1, [data-testid*="up-next"]') },
  };

  // Botón «Reproducir» / «Continuar» de la ficha (para la cola)
  function autoPlay() {
    if (isPlayer()) return null;
    const b = $('[data-testid="browser-action-button"], [data-testid="playback-action-button"], [data-testid*="play-button"]')
      || $$('button, a[role="button"]').find(x => /^\s*(reproducir|continuar|ver|play|resume|watch|reproduzir|lecture)\b/i.test(x.textContent) && x.getClientRects().length);
    return b && b.getClientRects().length ? b : null;
  }

  async function enrich(pid) {
    try { return await fetchMeta(pid); } catch (e) { console.warn('[StreamBox] Disney+', pid, e); return {}; }
  }

  SBP.register({
    id: 'disney', name: 'Disney+', short: 'D+', color: '#0e47a1', hosts: ['disneyplus.com'],
    parseUrl, titleUrl, fetchMeta, parseMeta, cards, spots, enrich, player, autoPlay,
    dark: () => true,
  });
})();
