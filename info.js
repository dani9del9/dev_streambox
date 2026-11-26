// StreamBox — «Info» de un título: notas de FilmAffinity, IMDb y Rotten Tomatoes y datos básicos.
// Se usa en segundo plano (sin DOM): todo se lee con expresiones regulares de las páginas públicas.
//  1. FilmAffinity (en español): se busca por el título y se leen nota, título original, año, duración,
//     país, dirección, reparto, géneros y sinopsis.
//  2. Wikidata: con el número de FilmAffinity da el de IMDb y el de Rotten Tomatoes (exactos).
//  3. Rotten Tomatoes: Tomatómetro (crítica) y Popcornmeter (público). Si Wikidata no lo sabe, se busca.
//  4. IMDb: nota y votos (si IMDb deja leer la página; si no, queda el enlace).
const SBInfo = (() => {
  const UA_HEADERS = { 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' };
  const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  const text = s => dec(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/&/g, 'y').replace(/[^a-z0-9]+/g, ' ').trim();
  // «Celeste T2», «Celeste (Serie de TV)», «Confidencial (Black Bag)» → formas comparables
  const variants = s => {
    const out = new Set([norm(s)]);
    const noSeason = String(s || '').replace(/\s+T\d+\s*$/i, '').replace(/\s*\((?:serie de tv|miniserie de tv|tv series|tv)\)\s*$/i, '');
    out.add(norm(noSeason));
    const m = String(s || '').match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (m) { out.add(norm(m[1])); out.add(norm(m[2])); }
    return [...out].filter(Boolean);
  };

  async function get(url, fetchFn, opts = {}) {
    const res = await fetchFn(url, Object.assign({ credentials: 'omit', headers: UA_HEADERS }, opts));
    if (!res.ok) throw Object.assign(new Error(new URL(url).hostname + ' ' + res.status), { status: res.status });
    return res.text();
  }

  // ---------- FilmAffinity ----------
  const FA = 'https://www.filmaffinity.com/es/';
  function faSearch(html) {
    return html.split(/<div class="row movie-card movie-card-\d+"/).slice(1).map(s => {
      s = s.slice(0, 6000);
      const plain = text(s);
      return {
        id: (s.match(/film(\d+)\.html/) || [])[1],
        title: dec(((s.match(/mc-title[^>]*>\s*<a[^>]*>([^<]+)/) || [])[1] || '').trim()),
        year: +((s.match(/mc-year[^>]*>\s*(\d{4})/) || [])[1] || 0),
        rating: ((s.match(/class="avg[^"]*">\s*([\d,.]+)/) || [])[1] || '').replace(',', '.'),
        series: /\b(Serie|Miniserie)\b/.test(plain.slice(0, 400)),
      };
    }).filter(x => x.id);
  }
  // Si la búsqueda da un único resultado, FilmAffinity abre directamente la ficha
  const isFaFilm = html => /itemprop="ratingValue"|<dl class="movie-info">/.test(html);
  function faFilm(html, id) {
    const dl = (html.match(/<dl class="movie-info">([\s\S]*?)<\/dl>/) || [])[1] || '';
    const fields = {};
    for (const m of dl.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) fields[text(m[1]).toLowerCase()] = m[2];
    const f = k => text(fields[k] || '');
    const list = k => f(k).replace(/\bVer todos los créditos\b/i, '').split(/\s*[,.|]\s*|\s{2,}/).map(x => x.trim()).filter(x => x && x.length < 60);
    const cast = [...(fields['reparto'] || '').matchAll(/itemprop="actor"[\s\S]*?title="([^"]+)"/g)].map(m => dec(m[1]));
    const genres = f('género').split(/\s*[.|]\s*/).map(x => x.trim()).filter(Boolean);
    return {
      id: id || (html.match(/film(\d+)\.html/) || [])[1],
      rating: (html.match(/itemprop="ratingValue" content="([^"]+)"/) || [])[1] || '',
      votes: +((html.match(/itemprop="ratingCount" content="([^"]+)"/) || [])[1] || 0),
      original: f('título original').replace(/\s*\(.*\)\s*$/, '').replace(/\s+aka\b.*$/i, '').trim(),
      year: +((f('año').match(/\d{4}/) || [])[0] || 0),
      runtime: +((f('duración').match(/\d+/) || [])[0] || 0),
      countries: f('país').split(/\s*,\s*/).map(x => x.trim()).filter(Boolean),
      directors: f('dirección').split(/\s*,\s*/).map(x => x.replace(/\s*\(.*?\)\s*/g, '').trim()).filter(Boolean).slice(0, 3),
      cast: (cast.length ? cast : list('reparto')).filter(x => x && !/ver todos|créditos/i.test(x)).slice(0, 5),
      genres: genres.filter(g => !/^(serie de tv|miniserie de tv)$/i.test(g)).slice(0, 5),
      series: genres.some(g => /^(serie|miniserie) de tv$/i.test(g)),
      plot: f('sinopsis').replace(/\s*\(FILMAFFINITY\)\s*$/i, ''),
    };
  }
  // El mejor candidato: mismo título, mismo tipo y año cercano
  function pick(cands, t) {
    const want = variants(t.title), y = +t.year || 0, isSeries = t.type === 'series', isMovie = t.type === 'movie';
    let best = null, bestScore = -1;
    cands.forEach((c, i) => {
      const cv = variants(c.title);
      let s = 0;
      if (norm(c.title) && want.includes(norm(c.title))) s += 6;
      else if (cv.some(v => want.includes(v))) s += 4;
      else return;
      if (isSeries && c.series) s += 2; if (isMovie && c.series === false) s += 1; if (isMovie && c.series) s -= 3; if (isSeries && !c.series) s -= 2;
      if (/\sT\d+$/i.test(c.title)) s -= 4; // una temporada suelta: mejor la serie entera
      if (y && c.year) { const d = Math.abs(c.year - y); s += d === 0 ? 3 : d === 1 ? 2 : (isSeries && d < 15) ? 0 : -3; }
      s -= i * 0.1;
      if (s > bestScore) { bestScore = s; best = c; }
    });
    return bestScore >= 4 ? best : null;
  }
  async function filmaffinity(t, fetchFn) {
    const html = await get(FA + 'search.php?stext=' + encodeURIComponent(t.title), fetchFn);
    if (isFaFilm(html)) return faFilm(html);
    const c = pick(faSearch(html), t);
    if (!c) return null;
    return faFilm(await get(FA + 'film' + c.id + '.html', fetchFn), c.id);
  }

  // ---------- Wikidata: FilmAffinity → IMDb y Rotten Tomatoes ----------
  async function wikidata(faId, fetchFn) {
    const q = 'SELECT ?imdb ?rt WHERE { ?i wdt:P480 "' + String(faId).replace(/\D/g, '') + '" . OPTIONAL { ?i wdt:P345 ?imdb } OPTIONAL { ?i wdt:P1258 ?rt } } LIMIT 1';
    const res = await fetchFn('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { credentials: 'omit', headers: { Accept: 'application/sparql-results+json' } });
    if (!res.ok) return {};
    const b = ((await res.json()).results.bindings || [])[0] || {};
    return { imdb: b.imdb && b.imdb.value, rt: b.rt && b.rt.value };
  }

  // ---------- Rotten Tomatoes ----------
  const RT = 'https://www.rottentomatoes.com/';
  function rtSearch(html) {
    return [...html.matchAll(/<search-page-media-row([^>]*)>([\s\S]*?)<\/search-page-media-row>/g)].map(m => {
      const a = m[1], url = (m[2].match(/href="https:\/\/www\.rottentomatoes\.com\/((?:m|tv)\/[^"/?#]+)/) || [])[1] || '';
      const attr = k => (a.match(new RegExp('\\b' + k + '="([^"]*)"')) || [])[1] || '';
      return { id: url, title: text((m[2].match(/slot="title"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || ''), year: +(attr('release-year') || attr('start-year') || attr('startyear') || attr('releaseyear') || 0), series: /^tv\//.test(url) };
    }).filter(x => x.id);
  }
  function rtPage(html) {
    const m = html.match(/<script[^>]*id="media-scorecard-json"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    let j; try { j = JSON.parse(m[1]); } catch { return null; }
    const pct = o => o && o.scorePercent ? +String(o.scorePercent).replace('%', '') || null : null;
    const c = j.criticsScore || {}, a = j.audienceScore || {};
    return { critics: pct(c), criticsCount: +c.reviewCount || +c.ratingCount || 0, certified: !!c.certified, audience: pct(a), audienceLabel: a.bandedRatingCount || '' };
  }
  async function rotten(t, fa, rtId, fetchFn) {
    let id = rtId;
    if (!id) {
      const q = (fa && fa.original) || t.title;
      const html = await get(RT + 'search?search=' + encodeURIComponent(q), fetchFn);
      const c = pick(rtSearch(html), { title: q, year: (fa && fa.year) || t.year, type: t.type });
      if (!c) return null;
      id = c.id;
    }
    // Las series: la página general (no la de una temporada)
    id = id.replace(/^(tv\/[^/]+)\/.*$/, '$1');
    const r = rtPage(await get(RT + id, fetchFn));
    return r ? Object.assign(r, { url: RT + id }) : { url: RT + id };
  }

  // ---------- IMDb (la página solo se puede leer si el navegador ya tiene sus cookies) ----------
  async function imdb(id, fetchFn) {
    const url = 'https://www.imdb.com/title/' + id + '/';
    try {
      const res = await fetchFn(url, { credentials: 'include', headers: UA_HEADERS });
      if (res.status !== 200) return { url };
      const html = await res.text();
      const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      const j = ld ? JSON.parse(ld[1]) : {};
      const r = j.aggregateRating || {};
      const dur = String(j.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
      return { url, rating: r.ratingValue ? String(r.ratingValue) : '', votes: +r.ratingCount || 0, runtime: dur ? (+dur[1] || 0) * 60 + (+dur[2] || 0) : 0, original: dec(j.name || '') };
    } catch { return { url }; }
  }

  // ---------- JustWatch: en qué plataformas está (para «Dónde más está») ----------
  const JW = 'https://www.justwatch.com/es/';
  const slug = s => norm(s).replace(/\s+/g, '-');
  const PROVIDERS = [[/^netflix/i, 'netflix'], [/^amazon prime video|^prime video/i, 'prime'], [/^disney/i, 'disney'], [/^movistar/i, 'movistar'], [/^(hbo )?max\b|^hbo/i, 'max']];
  function jwOffers(html) {
    const out = [], seen = new Set();
    for (const m of html.matchAll(/eyJ[A-Za-z0-9_\-+/=]{60,}/g)) {
      let s; try { s = new TextDecoder().decode(Uint8Array.from(atob(m[0].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))); } catch { continue; }
      const pm = s.match(/"provider":"([^"]+)","providerId":(\d+),"monetizationType":"([A-Z_]+)"/);
      if (!pm || !/^(FLATRATE|ADS|FREE)$/.test(pm[3])) continue;
      const name = pm[1].replace(/\s+(?:Basic|Standard)?\s*with Ads$/i, '').replace(/\s+Amazon Channel$/i, '').trim();
      const platform = (PROVIDERS.find(([re]) => re.test(name)) || [])[1] || '';
      if (seen.has(platform || name)) continue;
      seen.add(platform || name);
      const link = (s.match(/"deeplinkFallback":"(https?:[^"]+)"/) || [])[1] || '';
      out.push({ name: platform ? name.replace(/\s+(?:Ficci[oó]n Total|Premium|Standard|Basic)$/i, '').trim() : name, platform, type: pm[3], link });
    }
    return out;
  }
  // «A las personas a las que les gustó X también les gustó…» (para el recomendador)
  function jwSimilar(html) {
    const i = [...html.matchAll(/similar-titles/g)].map(m => m.index).find(i => html.slice(i - 20, i).includes('class'));
    if (i == null) return [];
    const out = [], seen = new Set();
    for (const m of html.slice(i, i + 60000).matchAll(/<a[^>]*href="\/es\/((?:pelicula|serie)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const img = (m[2].match(/(?:src|srcset)="(https:\/\/images\.justwatch\.com\/poster\/[^" ,]+)/) || [])[1] || '';
      out.push({ path: m[1], title: dec((m[2].match(/alt="([^"]*)"/) || [])[1] || ''), img: img.replace(/\/s\d+\//, '/s332/') });
      if (out.length >= 20) break;
    }
    return out;
  }
  // Una página de JustWatch ya conocida (título, año, cartel, dónde está y parecidos)
  async function jwPage(path, fetchFn = fetch) {
    const res = await fetchFn(JW + path, { credentials: 'omit', headers: UA_HEADERS });
    if (!res.ok) throw new Error('JustWatch ' + res.status);
    const html = await res.text();
    const og = k => dec((html.match(new RegExp('<meta property="og:' + k + '" content="([^"]*)"')) || [])[1] || '');
    const desc = og('description');
    return {
      path, url: JW + path, title: dec(((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<[^>]+>/g, '').trim()) || og('title').replace(/\s*-\s*(?:ver|película|serie)[\s\S]*$/i, ''),
      year: +((html.match(/\((\d{4})\)/) || [])[1] || 0), type: path.startsWith('serie/') ? 'series' : 'movie',
      poster: og('image'), plot: desc, offers: jwOffers(html), similar: jwSimilar(html),
    };
  }
  async function justwatch(t, fa, fetchFn) {
    const kinds = t.type === 'movie' ? ['pelicula'] : t.type === 'series' ? ['serie'] : ['pelicula', 'serie'];
    const y = +((fa && fa.year) || t.year || 0);
    const names = [...new Set([t.title, fa && fa.original, String(t.title || '').replace(/\s*\(.*?\)\s*/g, ' ').trim(), (String(t.title || '').match(/\(([^)]+)\)/) || [])[1]].filter(Boolean).map(slug).filter(Boolean))];
    const tries = [];
    for (const k of kinds) for (const n of names) { tries.push(k + '/' + n); if (y) tries.push(k + '/' + n + '-' + y); }
    for (const path of tries.slice(0, 8)) {
      let res; try { res = await fetchFn(JW + path, { credentials: 'omit', headers: UA_HEADERS }); } catch { continue; }
      if (!res.ok) continue;
      const html = await res.text();
      const py = +((html.match(/\((\d{4})\)/) || [])[1] || 0);
      if (y && py && t.type !== 'series' && Math.abs(py - y) > 1) continue;
      return { url: JW + path, offers: jwOffers(html), similar: jwSimilar(html) };
    }
    return null;
  }

  async function lookup(t, fetchFn = fetch) {
    const out = { at: Date.now(), title: t.title, errors: [] };
    let fa = null;
    try { fa = await filmaffinity(t, fetchFn); } catch (e) { out.errors.push('FilmAffinity: ' + e.message); }
    if (fa) out.fa = { id: fa.id, rating: fa.rating, votes: fa.votes, url: FA + 'film' + fa.id + '.html' };
    Object.assign(out, fa ? { original: fa.original, year: fa.year, runtime: fa.runtime, countries: fa.countries, directors: fa.directors, cast: fa.cast, genres: fa.genres, plot: fa.plot } : {});
    let ids = {};
    if (fa) { try { ids = await wikidata(fa.id, fetchFn); } catch (e) { out.errors.push('Wikidata: ' + e.message); } }
    const [rt, im] = await Promise.all([
      rotten(t, fa, ids.rt, fetchFn).catch(e => { out.errors.push('Rotten Tomatoes: ' + e.message); return null; }),
      ids.imdb ? imdb(ids.imdb, fetchFn) : Promise.resolve(null),
    ]);
    if (rt) out.rt = rt;
    try { const jw = await justwatch(t, fa, fetchFn); if (jw) out.where = jw; } catch (e) { out.errors.push('JustWatch: ' + e.message); }
    out.imdb = im || { url: 'https://www.imdb.com/find/?q=' + encodeURIComponent(((fa && fa.original) || t.title) + (out.year || t.year ? ' ' + (out.year || t.year) : '')) , search: true };
    if (im && !out.runtime && im.runtime) out.runtime = im.runtime;
    if (!out.original && im && im.original) out.original = im.original;
    out.found = !!(fa || rt || (im && !im.search));
    return out;
  }

  return { lookup, justwatch, jwOffers, jwSimilar, jwPage, faSearch, faFilm, rtSearch, rtPage, pick, variants, filmaffinity, wikidata };
})();
if (typeof module !== 'undefined') module.exports = SBInfo;
