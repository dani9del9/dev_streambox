// StreamBox — utilidades compartidas (gestor y scripts de contenido): almacenamiento, listas, títulos, iconos y tema.
//
// Datos en chrome.storage.local:
//   lists:  [{ id, name, icon:{type,value,bg,round}, color, items:[{ k, at }] }]
//           k = clave del título («netflix:80057281»), at = cuándo se añadió a la lista
//   titles: { "<k>": { key, platform, pid, title, type:'movie'|'series'|'', year, img, url, added, rating:0-5 } }
//           un título se guarda una sola vez aunque esté en varias listas; si sale de todas, se borra
//   settings: { theme, color1, color2, lang, sync, recentIcons, thumbButtons, platforms:{ netflix:true… },
//               player:{ skipIntro, skipRecap, autoNext }, queueEps }
//   queue:  { items:[{ k, at, eps, done }], playing, epIds:[], hold }
//           cola de reproducción (solo en este navegador): se ve en orden; lo terminado se queda marcado (done)
//           en su sitio y la cola sigue por el primero sin ver;
//           eps = episodios a ver de una serie antes de pasar al siguiente (0 = hasta que se acabe la serie)

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

const SB = (() => {
  const DEFAULT_SETTINGS = { thumbButtons: true, recentIcons: [], platforms: {}, player: {} };

  async function load() {
    const data = await chrome.storage.local.get(['lists', 'titles', 'settings', 'queue']);
    const settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    if (typeof T === 'function') T.setLang(settings.lang);
    const queue = Object.assign({ items: [], playing: false, epIds: [], hold: '' }, data.queue || {});
    return { lists: data.lists || [], titles: data.titles || {}, settings, queue };
  }
  async function save(partial) { await chrome.storage.local.set(partial); }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- Títulos y listas ----------
  const keyOf = (platform, pid) => platform + ':' + pid;

  // Guarda o completa un título con lo que se sepa de él (no pisa datos buenos con vacíos)
  function upsertTitle(state, info) {
    const k = info.key || keyOf(info.platform, info.pid);
    const t = state.titles[k] || { key: k, platform: info.platform, pid: info.pid, title: '', type: '', year: '', img: '', url: '', added: Date.now() };
    for (const f of ['title', 'type', 'year', 'img', 'url']) if (info[f] && (!t[f] || info.force)) t[f] = String(info[f]);
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
    const p = SBP.get(t.platform);
    return (p && p.watchUrl && p.watchUrl(t.pid, t)) || t.url || (p ? p.titleUrl(t.pid) : '');
  }

  const LIST_ICONS = ['🎬', '❤️', '🎄', '🏆', '🍿', '📺', '😂', '👻', '🚀', '🧸', '🕵️', '⭐'];
  const PALETTE = ['#ff4d6d', '#5b5bd6', '#3ea6ff', '#ff8a00', '#ffcc00', '#2ecc71', '#00bfa5', '#00b8d9', '#9b59ff', '#ff4fa3', '#a1887f', '#8d99ae', '#e50914', '#2b2523'];
  function newList(state, name) {
    const n = state.lists.length;
    const l = { id: uid(), name: name || T('Nueva lista'), icon: { type: 'emoji', value: LIST_ICONS[n % LIST_ICONS.length] }, color: PALETTE[n % 10], items: [] };
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
    const p = SBP.get(platformId) || { short: platformId, color: '#666', name: platformId };
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
    s = s.split(/\s+[|–—-]\s+(?=[^|]*(?:netflix|prime|amazon|disney|max|hbo))/i)[0].trim();
    return s.replace(/^(?:ver|ve|mira|watch|mirar|vexa|ve a|assistir|assista|regarder|guarda|schau(?:e)?)\s+/i, '').trim();
  }
  // Datos de un título a partir del HTML de su página: JSON-LD (Movie / TVSeries) y etiquetas og:
  function parseHtmlMeta(html) {
    const out = { title: '', type: '', year: '', img: '' };
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
      }
    }
    const meta = prop => decodeEntities((html.match(new RegExp('<meta[^>]+(?:property|name)="' + prop + '"[^>]+content="([^"]*)"')) || html.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="' + prop + '"')) || [])[1] || '');
    if (!out.title) out.title = cleanTitle(meta('og:title') || meta('twitter:title'));
    else out.title = decodeEntities(out.title);
    if (!out.img) out.img = meta('og:image') || meta('twitter:image');
    if (!out.type) { const ogt = meta('og:type'); out.type = /tv_show|episode/.test(ogt) ? 'series' : /video\.movie/.test(ogt) ? 'movie' : ''; }
    if (!out.type) out.type = /"@type"\s*:\s*"TVSeries"/.test(html) ? 'series' : /"@type"\s*:\s*"Movie"/.test(html) ? 'movie' : '';
    if (!out.year) out.year = (html.match(/"releaseYear"\s*:\s*"?(\d{4})/) || [])[1] || '';
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

  return { load, save, uid, keyOf, upsertTitle, listsOf, addToList, removeFromList, dropOrphans, inQueue, queuePending, queueFirst, queueAdd, queueRemove, playUrl, newList, typeLabel, typeFromText, starsEl, svgEl, logoEl, iconEl, platformBadge, isDark, themeVars, decodeEntities, rowSlot, cleanTitle, parseHtmlMeta, deepAll, DEFAULT_COLORS, PALETTE };
})();
