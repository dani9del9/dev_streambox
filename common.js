// StreamBox — utilidades compartidas (gestor y scripts de contenido): almacenamiento, listas, títulos, iconos y tema.
//
// Datos en chrome.storage.local:
//   lists:  [{ id, name, icon:{type,value,bg,round}, color, items:[{ k, at }] }]
//           k = clave del título («netflix:80057281»), at = cuándo se añadió a la lista
//   titles: { "<k>": { key, platform, pid, title, type:'movie'|'series'|'', year, img, url, added, rating:0-5, note,
//                       genres:[géneros tal como los da la plataforma], cats:[ids de SB.CATS], catsEdited } }
//           un título se guarda una sola vez aunque esté en varias listas; si sale de todas, se borra
//   settings: { theme, color1, color2, lang, sync, recentIcons, thumbButtons, platforms:{ netflix:true… },
//               player:{ skipIntro, skipRecap, autoNext }, queueEps }
//   queue:  { items:[{ k, at, eps, done }], playing, epIds:[], hold }
//           cola de reproducción (solo en este navegador): se ve en orden; lo terminado se queda marcado (done)
//           en su sitio y la cola sigue por el primero sin ver;
//           eps = episodios a ver de una serie antes de pasar al siguiente (0 = hasta que se acabe la serie)
//   follow: { "<k>": { added, seasons, eps:{ "<temporada>": nº }, latest, next, checkedAt, isNew, newSince, newWhat, detectedAt } }
//           series en seguimiento: lo último que se sabe de sus temporadas y episodios

// ---------- Plataformas ----------
// Cada archivo de platforms/ se registra aquí con: id, name, short, color, hosts, parseUrl(href) → pid,
// titleUrl(pid), fetchMeta(pid) y, solo en su web, cards(root) y detail().
const SBP = (() => {
  const all = {};
  return {
    all,
    register(p) { all[p.id] = p; },
    get: id => all[id],
    list: () => Object.values(all),
    forHost: host => Object.values(all).find(p => p.hosts.some(hh => host === hh || host.endsWith('.' + hh))),
    // De un enlace cualquiera saca { platform, pid } (para «Añadir por enlace» del gestor)
    parse(href) {
      let u; try { u = new URL(String(href).trim()); } catch { return null; }
      const p = Object.values(all).find(p => p.hosts.some(hh => u.hostname === hh || u.hostname.endsWith('.' + hh)));
      const pid = p && p.parseUrl(u.href);
      return pid ? { platform: p.id, pid } : null;
    },
  };
})();

// Datos básicos de todas las plataformas (en cada web solo se carga su propio adaptador, pero la cola
// y las insignias necesitan conocer también las demás)
const SB_PLATFORMS = {
  netflix: { name: 'Netflix', short: 'N', color: '#e50914', watch: pid => 'https://www.netflix.com/watch/' + pid },
  prime: { name: 'Prime Video', short: 'prime', color: '#00a8e1', watch: (pid, t) => ((t && t.url) || 'https://www.primevideo.com/detail/' + pid).split('?')[0].replace(/\/ref=.*$/, '') + '?autoplay=1' },
  disney: { name: 'Disney+', short: 'D+', color: '#0e47a1', watch: null },
  movistar: { name: 'Movistar Plus+', short: 'M+', color: '#74b72e', watch: (pid, t) => 'https://ver.movistarplus.es/ficha/' + (((t && t.url) || '').match(/\/ficha\/([^?#]+)/) || [, 'x'])[1] + '?id=' + pid },
};

const SB = (() => {
  const DEFAULT_SETTINGS = { thumbButtons: true, recentIcons: [], platforms: {}, player: {} };

  async function load() {
    const data = await chrome.storage.local.get(['lists', 'titles', 'settings', 'queue', 'follow']);
    const settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    if (typeof T === 'function') T.setLang(settings.lang);
    const queue = Object.assign({ items: [], playing: false, epIds: [], hold: '' }, data.queue || {});
    return { lists: data.lists || [], titles: data.titles || {}, settings, queue, follow: data.follow || {} };
  }
  async function save(partial) { await chrome.storage.local.set(partial); }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- Títulos y listas ----------
  const keyOf = (platform, pid) => platform + ':' + pid;

  // ---------- Categorías ----------
  // Categorías comunes a todas las plataformas. Cada género que da una plataforma («Series dramáticas»,
  // «Dramas», «av_genre_drama»…) se traduce a ellas con estas expresiones (en minúsculas y sin tildes).
  const CATS = [
    { id: 'accion', label: 'Acción', icon: '💥', re: /\b(accion|action|acao|actions?)\b/ },
    { id: 'aventura', label: 'Aventura', icon: '🧭', re: /aventura|adventure|abenteuer/ },
    { id: 'animacion', label: 'Animación', icon: '🎨', re: /animaci|animation|animad|animated|animacao|dibujos|cartoon/ },
    { id: 'anime', label: 'Anime', icon: '🍥', re: /\banimes?\b/ },
    { id: 'cifi', label: 'Ciencia ficción', icon: '🚀', re: /ciencia.?ficcion|sci.?fi|science.?fiction|ficcao cientifica|ciencia ficcion/ },
    { id: 'comedia', label: 'Comedia', icon: '😂', re: /comedi|comedy|humor|sitcom|stand.?up|parodia/ },
    { id: 'crimen', label: 'Crimen', icon: '🕵️', re: /crimen|crime|crimin|policia|policiac|gangster|mafia|detective|noir|true crime/ },
    { id: 'deportes', label: 'Deportes', icon: '🏆', re: /deport|sport|futbol|football|soccer|baloncesto|basket|formula 1|olimpi/ },
    { id: 'documental', label: 'Documental', icon: '🎥', re: /documental|documentar|docuserie|docuseries|documentario|\bdocs?\b/ },
    { id: 'drama', label: 'Drama', icon: '🎭', re: /drama/ },
    { id: 'fantasia', label: 'Fantasía', icon: '🧙', re: /fantasi|fantasy|fantastic/ },
    { id: 'infantil', label: 'Infantil y familiar', icon: '🧸', re: /infantil|\bkids?\b|ninos|children|famil|nenos|preescolar|preschool/ },
    { id: 'juvenil', label: 'Juvenil', icon: '🎒', re: /juvenil|\bteens?\b|adolescen|young adult/ },
    { id: 'musical', label: 'Música y musicales', icon: '🎵', re: /musica|musical|\bmusic\b|concierto|concert/ },
    { id: 'romance', label: 'Romance', icon: '💕', re: /romanc|romant|\bamor\b|\blove\b/ },
    { id: 'terror', label: 'Terror', icon: '👻', re: /terror|horror|miedo|zombi/ },
    { id: 'thriller', label: 'Suspense y misterio', icon: '🔎', re: /thriller|suspens|misterio|mystery|intriga/ },
    { id: 'historica', label: 'Histórica', icon: '🏛️', re: /histori|history|de epoca|period drama|biograf|biopic/ },
    { id: 'belica', label: 'Bélica', icon: '🎖️', re: /belic|\bguerra\b|\bwar\b|militar|military/ },
    { id: 'western', label: 'Western', icon: '🤠', re: /western|del oeste/ },
    { id: 'reality', label: 'Realities y concursos', icon: '📺', re: /reality|realities|telerrealidad|concurso|game show|talk show|programas de tv/ },
  ];
  const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ');
  function catsFromGenres(genres) {
    const txt = (genres || []).map(plain);
    return CATS.filter(c => txt.some(g => c.re.test(g))).map(c => c.id);
  }
  const catOf = id => CATS.find(c => c.id === id);
  // Limpia una lista de géneros: sin repetidos, sin vacíos ni comas sueltas
  function cleanGenres(list) {
    const out = [];
    for (let g of list || []) {
      g = decodeEntities(String(g || '')).replace(/^[\s,·•:]+|[\s,·•:]+$/g, '').trim();
      if (g && g.length < 60 && !out.some(x => x.toLowerCase() === g.toLowerCase())) out.push(g);
    }
    return out;
  }

  // «6+», «12+», «TP», «PG-13»…: es la calificación por edades, no el nombre (y su imagen es la del sello)
  // Lo que algunas plataformas pegan al nombre en el texto de la miniatura (Disney+:
  // «Anastasia Calificación: 6+ Lanzamiento: 1997…», «Solo en casa Selecciona para reproducir…»)
  const NOISE = /\s*[,.;·|-]?\s+(?:(?:Calificaci[oó]n|Cualificaci[oó]n|Clasificaci[oó]n|Rating|Rated|Lanzamiento|Lanzamento|Estreno|Released?|Release date|Duraci[oó]n|Duration|G[eé]neros?|Genres?|Temporadas?|Tempadas?|Seasons?|Episodios?|Episodes?)\s*:|(?:Selecciona|Seleccione|Select|Pulsa|Preme|Press|Haz clic|Click)\s+(?:para|to|for|e|aquí|here)\b)[\s\S]*$/i;
  const stripNoise = s => String(s || '').replace(NOISE, '').trim();
  const badTitle = s => /^\s*(\d{1,2}\s*\+|\+\s*\d{1,2}|TP|NR|ALL|PG(-13)?|NC-17|TV-?(Y7?|G|PG|14|MA))\s*$/i.test(String(s || ''));

  // Guarda o completa un título con lo que se sepa de él (no pisa datos buenos con vacíos)
  function upsertTitle(state, info) {
    const k = info.key || keyOf(info.platform, info.pid);
    const t = state.titles[k] || { key: k, platform: info.platform, pid: info.pid, title: '', type: '', year: '', img: '', url: '', added: Date.now() };
    const wasBad = !t.title || badTitle(t.title);
    if (info.title && !badTitle(info.title) && (wasBad || info.force)) t.title = stripNoise(info.title) || String(info.title).trim();
    if (info.img && (!t.img || info.force || (wasBad && t.title && !badTitle(t.title)))) t.img = String(info.img);
    for (const f of ['type', 'year', 'url']) if (info[f] && (!t[f] || info.force)) t[f] = String(info[f]);
    // Géneros y categorías automáticas (si no las has editado tú)
    const g = cleanGenres(info.genres);
    if (g.length && (!t.genres || !t.genres.length || info.force)) t.genres = g;
    if (!t.catsEdited) {
      const c = catsFromGenres(t.genres);
      if (c.length || !t.cats) t.cats = c;
    }
    if (!t.url) { const p = SBP.get(t.platform); if (p) t.url = p.titleUrl(t.pid); }
    state.titles[k] = t;
    return t;
  }
  const listsOf = (state, k) => state.lists.filter(l => l.items.some(i => i.k === k));
  function addToList(state, list, info) {
    const t = upsertTitle(state, info);
    if (!list.items.some(i => i.k === t.key)) list.items.unshift({ k: t.key, at: Date.now() });
    return t;
  }
  function removeFromList(state, list, k) {
    list.items = list.items.filter(i => i.k !== k);
    dropOrphans(state);
  }
  // Borra los títulos que ya no están en ninguna lista (ni en la cola)
  function dropOrphans(state) {
    const used = new Set(state.lists.flatMap(l => l.items.map(i => i.k)));
    for (const i of (state.queue && state.queue.items) || []) used.add(i.k);
    for (const k of Object.keys(state.follow || {})) used.add(k);
    for (const k of Object.keys(state.titles)) if (!used.has(k)) delete state.titles[k];
  }
  // ---------- Cola de reproducción ----------
  const inQueue = (state, k) => state.queue.items.findIndex(i => i.k === k);
  const queuePending = state => state.queue.items.filter(i => !i.done);
  const queueFirst = state => state.queue.items.find(i => !i.done) || null;
  function queueAdd(state, info, eps) {
    const t = upsertTitle(state, info);
    const ex = state.queue.items.find(i => i.k === t.key);
    if (ex) { if (ex.done) { delete ex.done; delete ex.doneAt; } return t; }
    state.queue.items.push({ k: t.key, at: Date.now(), eps: eps != null ? eps : (state.settings.queueEps != null ? state.settings.queueEps : 1) });
    return t;
  }
  function queueRemove(state, k) {
    const f = queueFirst(state);
    const wasFirst = !!(f && f.k === k);
    state.queue.items = state.queue.items.filter(i => i.k !== k);
    if (wasFirst) { state.queue.epIds = []; state.queue.hold = ''; }
    dropOrphans(state);
  }
  // Enlace para empezar a ver el título (no la ficha); si la plataforma no lo sabe, la ficha
  function playUrl(t) {
    const p = SBP.get(t.platform), info = SB_PLATFORMS[t.platform];
    return (p && p.watchUrl && p.watchUrl(t.pid, t)) || (info && info.watch && info.watch(t.pid, t)) || t.url || (p ? p.titleUrl(t.pid) : '');
  }

  // ---------- Seguimiento de series ----------
  const isFollowing = (state, k) => !!(state.follow && state.follow[k]);
  function follow(state, info) {
    const t = upsertTitle(state, info);
    state.follow = state.follow || {};
    if (!state.follow[t.key]) state.follow[t.key] = { added: Date.now(), seasons: 0, eps: {}, isNew: false };
    return t;
  }
  function unfollow(state, k) { if (state.follow) delete state.follow[k]; dropOrphans(state); }
  // Aplica lo que se acaba de ver de una serie: { seasons, season, episodes, latest, next }.
  // La primera vez solo se apunta; después, una temporada o un episodio más la marca como «nueva».
  function applyObs(rec, obs) {
    if (!rec || !obs) return false;
    const first = !rec.checkedAt;
    let what = '';
    if (obs.seasons && rec.seasons && obs.seasons > rec.seasons) what = 'season';
    if (obs.season && obs.episodes != null) {
      const prev = rec.eps[obs.season];
      if (prev != null && obs.episodes > prev) what = what || 'episode';
      else if (prev == null && Object.keys(rec.eps).length && !first) what = what || 'season';
      rec.eps[obs.season] = Math.max(prev || 0, obs.episodes);
    }
    if (obs.seasons) rec.seasons = Math.max(rec.seasons || 0, obs.seasons);
    if (obs.latest && (!rec.latest || obs.latest > rec.latest)) { if (rec.latest && !first) what = what || 'episode'; rec.latest = obs.latest; }
    if ('next' in obs) rec.next = obs.next || 0;
    if (obs.lastSeason) rec.lastSeason = obs.lastSeason;
    rec.checkedAt = Date.now();
    if (what && !first) {
      rec.isNew = true; rec.newSince = rec.newSince || Date.now(); rec.newWhat = what; rec.detectedAt = Date.now();
      return true;
    }
    if (first) rec.detectedAt = rec.detectedAt || Date.now();
    return false;
  }
  // «16 nov 2026», «16 de noviembre de 2026», «Nov 16, 2026», «16. Nov. 2026» → milisegundos
  const MONTHS = { ene: 0, jan: 0, xan: 0, janv: 0, feb: 1, fev: 1, fevr: 1, mar: 2, abr: 3, apr: 3, avr: 3, may: 4, mai: 4, mag: 4, mayo: 4, jun: 5, xuñ: 5, juin: 5, giu: 5, jul: 6, xul: 6, juil: 6, lug: 6, ago: 7, aug: 7, aout: 7, sep: 8, set: 8, oct: 9, out: 9, okt: 9, ott: 9, nov: 10, dic: 11, dec: 11, dez: 11, dek: 11 };
  function parseDate(txt) {
    const iso = String(txt || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
    const s0 = plain(txt).replace(/[.,]/g, ' ');
    let d, m, y;
    let r = s0.match(/(\d{1,2})\s+(?:de\s+)?([a-zñ]{3,})\s+(?:de\s+)?(\d{4})/);
    if (r) { d = +r[1]; m = r[2]; y = +r[3]; }
    else if ((r = s0.match(/([a-zñ]{3,})\s+(\d{1,2})\s+(\d{4})/))) { m = r[1]; d = +r[2]; y = +r[3]; }
    else if ((r = s0.match(/(\d{4})-(\d{2})-(\d{2})/))) return Date.UTC(+r[1], +r[2] - 1, +r[3]);
    else if ((r = s0.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return Date.UTC(+r[3], +r[2] - 1, +r[1]);
    else return 0;
    const key = Object.keys(MONTHS).filter(k => m.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    return key == null ? 0 : Date.UTC(y, MONTHS[key], d);
  }

  // «Se va pronto»: la fecha en que un título deja el catálogo, a partir del texto que enseña la plataforma
  // («Último día para verla en Netflix: 1 de diciembre», «Disponible hasta el 30/11/2026», «Available until Dec 3»)
  const LEAVE_RE = /(?:[úu]ltimo d[ií]a(?: para ver(?:l[oa])?)?(?: en [\w+ ]{2,20})?|disponible hasta(?: el)?|dispo[ñn]ible ata(?: o)?|deja(?:r[áa])? de estar disponible(?: el)?|se va(?: de [\w+ ]{2,20})? el|available until|last day to watch(?: on [\w+ ]{2,20})?|leaving(?: on)?|expira(?: el)?|caduca(?: el)?)\s*:?\s*([^\n<|•·]{3,40})/i;
  function leavingFromText(txt) {
    const m = String(txt || '').match(LEAVE_RE);
    if (!m) return 0;
    let d = parseDate(m[1]);
    if (!d) {
      // Sin año: la próxima vez que llegue esa fecha
      const s0 = plain(m[1]).replace(/[.,]/g, ' ');
      let r = s0.match(/(\d{1,2})\s+(?:de\s+)?([a-zñ]{3,})/), day, mon;
      if (r) { day = +r[1]; mon = r[2]; } else if ((r = s0.match(/([a-zñ]{3,})\s+(\d{1,2})\b/))) { mon = r[1]; day = +r[2]; }
      else if ((r = s0.match(/(\d{1,2})\/(\d{1,2})\b/))) { mon = null; day = +r[1]; const mm = +r[2] - 1; const y = new Date().getFullYear(); d = Date.UTC(y, mm, day); if (d < Date.now() - 864e5) d = Date.UTC(y + 1, mm, day); return d; }
      else return 0;
      const key = Object.keys(MONTHS).filter(k => mon.startsWith(k)).sort((a, b) => b.length - a.length)[0];
      if (key == null) return 0;
      const y = new Date().getFullYear();
      d = Date.UTC(y, MONTHS[key], day);
      if (d < Date.now() - 864e5) d = Date.UTC(y + 1, MONTHS[key], day);
    }
    // Fechas absurdas (pasadas o a años vista) no cuentan
    return d > Date.now() - 864e5 && d < Date.now() + 400 * 864e5 ? d : 0;
  }
  const daysLeft = ms => Math.ceil((ms - Date.now()) / 864e5);

  // Códigos para pasar datos entre dos StreamBox (listas compartidas, «Ver juntos»): JSON comprimido en base64url
  async function packCode(obj, prefix) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let out = bytes;
    if (typeof CompressionStream === 'function') out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let bin = ''; for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return prefix + (out === bytes ? 'r' : 'z') + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function unpackCode(code, prefix) {
    const m = String(code || '').match(new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[zr][A-Za-z0-9_-]+'));
    if (!m) throw new Error('bad-code');
    code = m[0].slice(prefix.length);
    const kind = code[0], b64 = code.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    let bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    if (kind === 'z') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const LIST_ICONS = ['🎬', '❤️', '🎄', '🏆', '🍿', '📺', '😂', '👻', '🚀', '🧸', '🕵️', '⭐'];
  const PALETTE = ['#ff4d6d', '#5b5bd6', '#3ea6ff', '#ff8a00', '#ffcc00', '#2ecc71', '#00bfa5', '#00b8d9', '#9b59ff', '#ff4fa3', '#a1887f', '#8d99ae', '#e50914', '#2b2523'];
  function newList(state, name) {
    const n = state.lists.length;
    // Icono de serie para las listas nuevas: una tele sobre fondo de color (luego se cambia con el selector)
    const l = { id: uid(), name: name || T('Nueva lista'), icon: { type: 'svg', value: 'tv', bg: true }, color: PALETTE[n % 10], items: [] };
    state.lists.push(l);
    return l;
  }

  const typeLabel = t => t === 'movie' ? T('Película') : t === 'series' ? T('Serie') : '';

  // Tipo a partir de un texto de duración: «2 temporadas» → serie, «1 h 50 min» → peli
  function typeFromText(s) {
    s = String(s || '').toLowerCase();
    if (/temporada|season|tempada|episod|cap[ií]tulo|miniserie|limited series|serie|series|parte\s+\d|part\s+\d|volum/.test(s)) return 'series';
    if (/\b\d+\s*h\b|\d+\s*min|\b\d+\s*h\s*\d+/.test(s)) return 'movie';
    return '';
  }

  // Fila de 5 estrellas para puntuar (pulsar la misma estrella otra vez quita la puntuación)
  function starsEl(value, onSet, size = 18) {
    const box = document.createElement('span');
    box.className = 'sb-stars';
    box.setAttribute('role', 'radiogroup');
    box.setAttribute('aria-label', T('Mi puntuación'));
    const draw = (v, hover) => [...box.children].forEach((b, i) => { b.classList.toggle('on', i < v); b.classList.toggle('hov', !!hover); });
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = '★'; b.style.fontSize = size + 'px';
      b.title = TN(i, '{0} estrella', '{0} estrellas');
      b.setAttribute('aria-label', b.title);
      b.addEventListener('mouseenter', () => draw(i, true));
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); value = value === i ? 0 : i; draw(value); onSet(value); });
      box.append(b);
    }
    box.addEventListener('mouseleave', () => draw(value));
    draw(value || 0);
    return box;
  }

  // ---------- Iconos ----------
  // Construye el SVG con createElementNS (algunas webs exigen Trusted Types y prohíben asignar HTML como texto)
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(name, px, stroke) {
    const svg = document.createElementNS(SVGNS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: px, height: px, fill: 'none', stroke, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
    svg.style.color = stroke;
    const markup = (typeof SVG_ICONS !== 'undefined' && SVG_ICONS[name]) || '';
    for (const m of markup.matchAll(/<(\w+)([^>]*?)\/?>/g)) {
      const node = document.createElementNS(SVGNS, m[1]);
      for (const at of m[2].matchAll(/([\w:-]+)="([^"]*)"/g)) node.setAttribute(at[1], at[2]);
      svg.appendChild(node);
    }
    return svg;
  }

  // Logo de StreamBox (un marcapáginas entre corchetes, hermano del de YTBox) con los dos colores de la app
  let logoSeq = 0;
  function logoEl(size = 24, c1 = DEFAULT_COLORS[0], c2 = DEFAULT_COLORS[1]) {
    const id = 'sb-logo-g' + (++logoSeq);
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64'); svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true'); svg.classList.add('sb-logo');
    svg.style.flex = '0 0 auto';
    const mk = (tag, attrs, parent) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); (parent || svg).appendChild(n); return n; };
    const grad = mk('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 }, mk('defs', {}));
    mk('stop', { offset: 0, 'stop-color': c1 }, grad); mk('stop', { offset: 0.5, 'stop-color': c1 }, grad); mk('stop', { offset: 1, 'stop-color': c2 }, grad);
    mk('path', { d: 'M20 9H10v46h10 M44 9h10v46H44', fill: 'none', stroke: `url(#${id})`, 'stroke-width': size <= 18 ? 8 : 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    mk('path', { d: 'M24 18h16v27l-8-6.5-8 6.5z', fill: `url(#${id})`, stroke: `url(#${id})`, 'stroke-width': size <= 18 ? 2.5 : 1.5, 'stroke-linejoin': 'round' });
    return svg;
  }

  // Crea el elemento visual del icono de una lista
  function iconEl(list, size = 24) {
    const icon = list.icon || { type: 'emoji', value: '🎬' };
    const color = list.color || DEFAULT_COLORS[0];
    const el = document.createElement('span');
    el.className = 'sb-icon';
    el.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;flex:0 0 ${size}px;border-radius:${icon.round ? '50%' : Math.round(size / 4) + 'px'};overflow:hidden;line-height:1;`;
    if (icon.bg) el.style.background = color;
    switch (icon.type) {
      case 'svg':
        el.append(svgEl(icon.value, Math.round(size * (icon.bg ? .7 : .9)), icon.bg ? '#fff' : color));
        break;
      case 'image': {
        const img = document.createElement('img'); img.src = icon.value; img.style.cssText = 'width:100%;height:100%;object-fit:cover'; img.referrerPolicy = 'no-referrer'; el.appendChild(img);
        break;
      }
      case 'text':
        el.textContent = icon.value || '?';
        el.style.fontWeight = '700';
        el.style.fontFamily = 'Roboto, Arial, sans-serif';
        el.style.fontSize = Math.round(size * (String(icon.value).length > 2 ? .38 : .5)) + 'px';
        el.style.color = icon.bg ? '#fff' : color;
        break;
      default:
        el.textContent = icon.value || '🎬';
        el.style.fontSize = Math.round(size * (icon.bg ? .62 : .82)) + 'px';
    }
    return el;
  }

  // Insignia de la plataforma (N, prime, D+, max…) con su color
  function platformBadge(platformId, small) {
    const p = SBP.get(platformId) || SB_PLATFORMS[platformId] || { short: platformId, color: '#666', name: platformId };
    const el = document.createElement('span');
    el.className = 'sb-pbadge' + (small ? ' small' : '');
    el.textContent = p.short;
    el.title = p.name;
    el.style.background = p.color;
    return el;
  }

  // ---------- Tema (claro / oscuro) y colores de la app ----------
  const DEFAULT_COLORS = ['#ff4d6d', '#5b5bd6'];
  const PALETTES = {
    light: { bg: '#f5f3f0', panel: '#fcfbf9', panel2: '#ece8e3', line: '#ddd6cd', txt: '#26211f', mut: '#7a706a' },
    dark: { bg: '#18171a', panel: '#222024', panel2: '#2f2c31', line: '#403b42', txt: '#f2eef0', mut: '#a59ca3' },
  };
  function isDark(settings, contextDark) {
    const t = (settings && settings.theme) || 'auto';
    return t === 'dark' || (t === 'auto' && !!contextDark);
  }
  function themeVars(settings, dark) {
    const p = PALETTES[dark ? 'dark' : 'light'];
    const c1 = (settings && settings.color1) || DEFAULT_COLORS[0];
    const c2 = (settings && settings.color2) || DEFAULT_COLORS[1];
    return Object.assign({}, p, {
      acc: c1, acc2: c2,
      grad: `linear-gradient(135deg,${c1} 50%,${c2} 100%)`,
      accSoft: `color-mix(in srgb,${c1} ${dark ? 22 : 16}%,${p.bg})`,
      shadow: `color-mix(in srgb,${c2} 32%,transparent)`,
    });
  }

  // «Ve Stranger Things | Sitio oficial de Netflix», «Prime Video: The Boys», «Ver Avatar | Disney+» → el título
  function cleanTitle(s) {
    s = decodeEntities(s).replace(/^\s*(?:prime video|amazon\.\w+(?:\.\w+)?)\s*:\s*/i, '');
    s = s.split(/\s+[|–—-]\s+(?=[^|]*(?:netflix|prime|amazon|disney|max|hbo|movistar))/i)[0].trim();
    return s.replace(/^(?:ver|ve|mira|watch|mirar|vexa|ve a|assistir|assista|regarder|guarda|schau(?:e)?)\s+/i, '').trim();
  }
  // Datos de un título a partir del HTML de su página: JSON-LD (Movie / TVSeries) y etiquetas og:
  function parseHtmlMeta(html) {
    const out = { title: '', type: '', year: '', img: '', genres: [] };
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      let d; try { d = JSON.parse(m[1]); } catch { continue; }
      for (const o of [].concat(d['@graph'] || d)) {
        const t = String((o && o['@type']) || '');
        if (!/Movie|TVSeries|TVSeason|TVEpisode|CreativeWork/.test(t)) continue;
        out.title = out.title || o.name || '';
        out.type = out.type || (/TVSeries|TVSeason|TVEpisode/.test(t) ? 'series' : /Movie/.test(t) ? 'movie' : '');
        const date = o.dateCreated || o.datePublished || o.startDate || (o.releasedEvent && o.releasedEvent.startDate) || '';
        out.year = out.year || (String(date).match(/\d{4}/) || [''])[0];
        const img = Array.isArray(o.image) ? o.image[0] : o.image;
        out.img = out.img || (img && (img.url || img)) || '';
        if (o.genre) out.genres.push(...[].concat(o.genre).map(String));
      }
    }
    const meta = prop => decodeEntities((html.match(new RegExp('<meta[^>]+(?:property|name)="' + prop + '"[^>]+content="([^"]*)"')) || html.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="' + prop + '"')) || [])[1] || '');
    if (!out.title) out.title = cleanTitle(meta('og:title') || meta('twitter:title'));
    else out.title = decodeEntities(out.title);
    if (!out.img) out.img = meta('og:image') || meta('twitter:image');
    if (!out.type) { const ogt = meta('og:type'); out.type = /tv_show|episode/.test(ogt) ? 'series' : /video\.movie/.test(ogt) ? 'movie' : ''; }
    if (!out.type) out.type = /"@type"\s*:\s*"TVSeries"/.test(html) ? 'series' : /"@type"\s*:\s*"Movie"/.test(html) ? 'movie' : '';
    if (!out.year) out.year = (html.match(/"releaseYear"\s*:\s*"?(\d{4})/) || [])[1] || '';
    out.genres = cleanGenres(out.genres);
    return out;
  }
  // querySelectorAll que entra también en los shadow DOM abiertos (algunos reproductores los usan)
  function deepAll(sel, root = document) {
    const out = [...root.querySelectorAll(sel)];
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...deepAll(sel, el.shadowRoot));
    return out;
  }

  // Sitio para un botón nuestro en una fila de botones de la web: delante de «ref», subiendo por sus
  // envoltorios hasta llegar a la fila (el padre que ya contiene varios botones)
  function rowSlot(ref, minButtons = 3) {
    if (!ref) return null;
    let wrap = ref;
    while (wrap.parentElement && wrap.parentElement !== document.body && wrap.parentElement.querySelectorAll('button, a[role="button"]').length < minButtons) wrap = wrap.parentElement;
    return wrap.parentElement ? { parent: wrap.parentElement, before: wrap } : null;
  }

  function decodeEntities(s) {
    return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  return { load, save, uid, keyOf, upsertTitle, listsOf, addToList, removeFromList, dropOrphans, isFollowing, follow, unfollow, applyObs, parseDate, CATS, catOf, catsFromGenres, cleanGenres, inQueue, queuePending, queueFirst, queueAdd, queueRemove, playUrl, newList, typeLabel, typeFromText, starsEl, svgEl, logoEl, iconEl, platformBadge, isDark, themeVars, decodeEntities, rowSlot, badTitle, stripNoise, leavingFromText, daysLeft, packCode, unpackCode, cleanTitle, parseHtmlMeta, deepAll, DEFAULT_COLORS, PALETTE };
})();
