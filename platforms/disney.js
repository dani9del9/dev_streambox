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

  // La imagen buena de la tarjeta: la más grande que no sea el sello de edad («6+», «12+»…)
  function bestImg(card) {
    const imgs = $$('img', card).filter(i => !SB.badTitle(i.alt));
    if (!imgs.length) return null;
    const area = i => { const r = i.getBoundingClientRect(); return (r.width * r.height) || (i.naturalWidth * i.naturalHeight) || 0; };
    const big = imgs.filter(i => { const r = i.getBoundingClientRect(); return r.width >= 80 || i.naturalWidth >= 120; });
    return (big.length ? big : imgs).sort((a, b) => area(b) - area(a))[0];
  }

  function cards(root = document) {
    if (isPlayer()) return [];
    const out = [], seen = new Set();
    for (const a of $$('a[href*="/browse/entity-"], a[href*="/movies/"], a[href*="/series/"]', root)) {
      if (a.closest('.sb-ui')) continue;
      const href = a.getAttribute('href');
      const pid = parseUrl(href);
      if (!pid || pid === currentPagePid()) continue;
      const card = a.closest('[data-testid="set-item"], [data-item-id], li, article') || a;
      const img = bestImg(card);
      if (!img || seen.has(card)) continue;
      seen.add(card);
      // La etiqueta accesible suele ser «Título. Película. …»: nos quedamos con la primera parte
      const aria = (a.getAttribute('aria-label') || '').split(/\.\s|,\s/)[0];
      const title = [img.alt, aria, a.getAttribute('title')].map(x => SB.stripNoise(x)).find(x => x && !SB.badTitle(x)) || '';
      out.push({ el: card, pid, title, img: goodImg(img), url: cleanUrl(href), type: legacyType(href), year: '' });
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
    // Géneros: los trozos de la línea de datos («2021 • 2 temporadas • Ciencia ficción, Aventura») que sean géneros
    const genres = metaText.split(/[•·|,]/).map(x => x.trim()).filter(x => x && SB.catsFromGenres([x]).length);
    return {
      pid, title: [logo && logo.alt, h1 && h1.textContent.trim(), SB.cleanTitle(document.title)].find(x => x && !SB.badTitle(x)) || '',
      type, year: (metaText.match(/\b(19|20)\d{2}\b/) || [''])[0], img: og || goodImg(bg), url: cleanUrl(location.href),
      genres: SB.cleanGenres(genres),
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
      return ref ? [{ root: document.body, kind: 'player', info, slot: { near: ref, size: Math.round(ref.getBoundingClientRect().height) || 40 } }] : [];
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
    title: () => { const s = SB.deepAll('.subtitle-field, [class*="subtitle-field"]').find(e => e.textContent.trim()); return [playerTitle(), s && s.textContent.trim()].filter(Boolean).join(' · '); },
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

  // Seguimiento: en la ficha de la serie, la temporada elegida y cuántos episodios tiene
  async function followObserve(pid) {
    if (isPlayer() || currentPagePid() !== pid) return null;
    const n = $$('[data-testid="standard-regular-list-item-title"]').filter(e => /^\s*\d+\./.test(e.textContent)).length;
    if (!n) return null;
    const lab = $$('button, [role="button"], [aria-haspopup]').map(b => b.textContent.trim()).find(x => /^(temporada|season|tempada|staffel|saison|stagione)\s*\d+/i.test(x));
    const opts = $$('[role="option"], [role="menuitem"], li').map(x => x.textContent.trim()).filter(x => /^(temporada|season|tempada|staffel|saison|stagione)\s*\d+$/i.test(x));
    return { seasons: opts.length || 0, season: lab ? lab.replace(/\s+/g, ' ') : 'T1', episodes: n, lastSeason: lab || '' };
  }

  async function enrich(pid) {
    try { return await fetchMeta(pid); } catch (e) { console.warn('[StreamBox] Disney+', pid, e); return {}; }
  }

  SBP.register({
    id: 'disney', name: 'Disney+', short: 'D+', color: '#0e47a1', hosts: ['disneyplus.com'],
    parseUrl, titleUrl, fetchMeta, parseMeta, cards, spots, enrich, player, autoPlay, followObserve,
    dark: () => true,
  });
})();
