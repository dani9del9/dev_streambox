// StreamBox — Descubrir: títulos nuevos (que aún no tienes) a partir de los que elijas y de tus estrellas.
// Para cada título de partida se mira en JustWatch «a quien le gustó X también le gustó…»; cada parecido
// suma según tus estrellas (lo que puntuaste bajo resta) y salen primero los que se repiten entre varios.
const RECO_DAYS = 7;
async function recoCache() { return (await chrome.storage.local.get('reco')).reco || { pages: {}, dismissed: {} }; }
async function saveReco(r) {
  // Que no crezca sin fin: fuera las páginas viejas
  for (const [k, v] of Object.entries(r.pages)) if (Date.now() - v.at > RECO_DAYS * 864e5) delete r.pages[k];
  await chrome.storage.local.set({ reco: r });
}
const seedWeight = t => !t.rating ? 1 : ({ 5: 2.2, 4: 1.5, 3: 0.5, 2: -0.8, 1: -1.4 })[t.rating] || 1;
const normTitle = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function renderDiscover(main) {
  main.append(h('h1', { class: 'mode-title' }, h('span', { class: 'mode-ico' }, SB.svgEl('brujula', 24, '#fff')), T('Descubrir')));
  main.append(h('p', { class: 'muted', style: 'max-width:820px;margin:-12px 0 20px' },
    T('Te recomiendo títulos que aún no tienes, a partir de los que elijas y de tus estrellas: lo que puntuaste alto pesa más y lo que puntuaste bajo resta. Los parecidos salen de JustWatch («a quien le gustó esto también le gustó…»).')));
  await loadInfoCache();
  if (!main.isConnected) return;
  const d = ui.discover || (ui.discover = { mode: 'fav', picked: [], kind: '', mine: true });
  const all = Object.values(state.titles);
  const favs = all.filter(t => t.rating >= 4);
  const seeds = () => d.mode === 'fav' ? all.filter(t => t.rating) : d.picked.map(k => state.titles[k]).filter(Boolean);

  // ---- De qué partir
  const pickBox = h('div', { class: 'dc-pick' });
  const drawPick = () => {
    const q = h('input', { type: 'search', class: 'f-search', placeholder: T('Buscar entre tus títulos…') });
    const grid = h('div', { class: 'dc-seeds' });
    const fill = () => {
      const s = normTitle(q.value);
      const list = all.filter(t => !s || normTitle(t.title).includes(s)).sort((a, b) => (b.rating || 0) - (a.rating || 0) || cmpTitle(a, b)).slice(0, 60);
      grid.replaceChildren(...list.map(t => {
        const on = d.picked.includes(t.key);
        return h('button', { class: 'dc-seed' + (on ? ' on' : ''), title: t.title, onclick: () => { d.picked = on ? d.picked.filter(k => k !== t.key) : [...d.picked, t.key]; fill(); count.textContent = TN(d.picked.length, '{0} elegido', '{0} elegidos'); } },
          t.img ? h('img', { src: t.img, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'tph' }, t.title),
          h('span', { class: 'dc-seed-name' }, t.title), t.rating ? h('span', { class: 'dc-seed-stars' }, '★' + t.rating) : null, on ? h('span', { class: 'dc-check' }, '✓') : null);
      }));
    };
    const count = h('span', { class: 'muted small' }, TN(d.picked.length, '{0} elegido', '{0} elegidos'));
    q.oninput = fill; fill();
    pickBox.replaceChildren(h('div', { class: 'row', style: 'gap:12px;margin-bottom:10px' }, q, count, d.picked.length ? h('button', { class: 'linkish', onclick: () => { d.picked = []; drawPick(); } }, T('Quitar todos')) : null), grid);
  };
  const modes = h('div', { class: 'theme-seg' },
    h('button', { class: d.mode === 'fav' ? 'on' : '', onclick: () => { d.mode = 'fav'; render(); } }, '⭐ ' + T('Según mis estrellas')),
    h('button', { class: d.mode === 'pick' ? 'on' : '', onclick: () => { d.mode = 'pick'; render(); } }, '👆 ' + T('Elegir títulos')));
  const kind = h('div', { class: 'theme-seg' }, [['', 'Todo'], ['movie', 'Pelis'], ['series', 'Series']].map(([v, l]) => h('button', { class: d.kind === v ? 'on' : '', onclick: () => { d.kind = v; if (lastRun) showResults(lastRun); kind.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.textContent === T(l))); } }, T(l))));
  const mine = h('label', { class: 'dc-mine' }, (() => { const c = h('input', { type: 'checkbox' }); c.checked = d.mine; c.onchange = () => { d.mine = c.checked; if (lastRun) showResults(lastRun); }; return c; })(), T('Solo lo que puedo ver en mis plataformas'));
  const go = h('button', { class: 'primary big', onclick: () => run() }, '✨ ' + T('Recomiéndame'));
  main.append(h('div', { class: 'card tn-card' },
    h('div', { class: 'tn-group' }, h('span', { class: 'tn-lab' }, T('Basado en')), modes),
    d.mode === 'fav' ? h('p', { class: 'muted small', style: 'margin:0' }, favs.length
      ? T('Uso los {0} títulos que has puntuado: {1} con 4 o 5 estrellas tiran hacia lo parecido y los de 1 o 2 apartan lo que se les parece.', all.filter(t => t.rating).length, favs.length)
      : T('Aún no has puntuado nada con estrellas: puntúa algunos títulos o elige tú de cuáles partir.')) : pickBox,
    h('div', { class: 'tn-group' }, h('span', { class: 'tn-lab' }, T('Mostrar')), kind, mine),
    h('div', { class: 'tn-go' }, go)));
  if (d.mode === 'pick') drawPick();
  const res = h('div', { class: 'tn-res' });
  main.append(res);
  let lastRun = null;

  async function run() {
    const sd = seeds().filter(t => d.mode === 'pick' || t.rating);
    if (!sd.length) { res.replaceChildren(h('div', { class: 'empty' }, d.mode === 'pick' ? T('Elige al menos un título.') : T('Aún no has puntuado nada con estrellas.'))); return; }
    go.disabled = true;
    const msg = h('div', { class: 'tinfo-load' }, h('span', { class: 'spin' }), h('span', {}, T('Buscando parecidos…')));
    res.replaceChildren(msg);
    const reco = await recoCache();
    // 1) Parecidos de cada título de partida (los de más peso primero; como mucho 14)
    const used = sd.slice().sort((a, b) => Math.abs(seedWeight(b)) - Math.abs(seedWeight(a))).slice(0, 14);
    const cand = {};
    let i = 0;
    for (const t of used) {
      msg.lastChild.textContent = T('Buscando parecidos a «{0}»… ({1} de {2})', t.title, ++i, used.length);
      let r = infoCache[t.key];
      if (!r || !r.where || !r.where.similar) { try { r = await titleInfo(t.key, !!(r && r.where && !r.where.similar)); } catch { r = null; } }
      const sim = (r && r.where && r.where.similar) || [];
      const w = seedWeight(t);
      sim.forEach((s, idx) => {
        const c = cand[s.path] || (cand[s.path] = { path: s.path, title: s.title, img: s.img, score: 0, from: [], against: [] });
        c.score += w * (1 - idx * 0.04);
        (w > 0 ? c.from : c.against).push(t.title);
      });
    }
    // 2) Fuera lo que ya tienes guardado y lo descartado
    const mineTitles = new Set(all.map(t => normTitle(t.title)));
    const minePaths = new Set(all.map(t => infoCache[t.key] && infoCache[t.key].where && infoCache[t.key].where.url).filter(Boolean).map(u => u.replace(/^.*\/es\//, '')));
    let list = Object.values(cand).filter(c => c.score > 0 && !minePaths.has(c.path) && !mineTitles.has(normTitle(c.title)) && !reco.dismissed[c.path]);
    // Los que salen de varios títulos a la vez, más arriba
    list.forEach(c => { c.score *= 1 + 0.35 * (new Set(c.from).size - 1); });
    list.sort((a, b) => b.score - a.score);
    list = list.slice(0, 18);
    // 3) Detalles (año, dónde está) de los mejores
    i = 0;
    for (const c of list) {
      msg.lastChild.textContent = T('Mirando dónde ver las recomendaciones… ({0} de {1})', ++i, list.length);
      let pg = reco.pages[c.path];
      if (!pg || Date.now() - pg.at > RECO_DAYS * 864e5) {
        try { pg = Object.assign(await SBInfo.jwPage(c.path), { at: Date.now() }); delete pg.similar; reco.pages[c.path] = pg; } catch { pg = null; }
      }
      if (pg) Object.assign(c, { year: pg.year, type: pg.type, poster: pg.poster || c.img, offers: pg.offers || [], plot: pg.plot, url: pg.url });
      else Object.assign(c, { type: c.path.startsWith('serie/') ? 'series' : 'movie', offers: [], url: 'https://www.justwatch.com/es/' + c.path });
    }
    await saveReco(reco);
    go.disabled = false;
    lastRun = { list, reco };
    showResults(lastRun);
  }

  function showResults({ list, reco }) {
    const subs = typeof subsOf === 'function' ? subsOf() : {};
    const myPlats = new Set(Object.keys(subs).filter(p => subs[p].on && (state.settings.platforms || {})[p] !== false));
    const shown = list.filter(c => (!d.kind || c.type === d.kind) && (!d.mine || (c.offers || []).some(o => o.platform && myPlats.has(o.platform))));
    if (!shown.length) { res.replaceChildren(h('div', { class: 'empty' }, d.mine ? T('No encuentro nada nuevo en tus plataformas con esto. Prueba a quitar «Solo lo que puedo ver en mis plataformas» o a partir de otros títulos.') : T('No encuentro nada nuevo con esto. Prueba a partir de otros títulos.'))); return; }
    res.replaceChildren(h('div', { class: 'dc-grid' }, shown.map(c => recoCard(c, reco, myPlats))));
  }
}

function recoCard(c, reco, myPlats) {
  const offers = (c.offers || []).slice().sort((a, b) => (myPlats.has(b.platform) - myPlats.has(a.platform)) || (!!b.platform - !!a.platform));
  const supported = offers.filter(o => o.platform && SBP.get(o.platform) && o.link);
  const from = [...new Set(c.from)].slice(0, 3);
  const card = h('div', { class: 'dc-card' },
    h('a', { class: 'dc-poster', href: c.url, target: '_blank', rel: 'noopener' }, c.poster ? h('img', { src: c.poster, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'tph' }, c.title)),
    h('div', { class: 'dc-body' },
      h('b', { class: 'dc-title' }, c.title),
      h('small', { class: 'muted' }, [SB.typeLabel(c.type), c.year || ''].filter(Boolean).join(' · ')),
      from.length ? h('div', { class: 'dc-why' }, T('Porque te gustó {0}', from.map(x => '«' + x + '»').join(', '))) : null,
      offers.length ? h('div', { class: 'where-list' }, offers.slice(0, 4).map(o => h('a', { class: 'where-it' + (o.platform ? '' : ' other') + (myPlats.has(o.platform) ? ' here' : ''), href: o.link || c.url, target: '_blank', rel: 'noopener' }, o.platform && SB_PLATFORMS[o.platform] ? SB.platformBadge(o.platform, true) : null, o.platform && SB_PLATFORMS[o.platform] ? SB_PLATFORMS[o.platform].name : o.name)))
        : h('small', { class: 'muted' }, T('Ahora mismo no está en ninguna plataforma de suscripción.')),
      h('div', { class: 'dc-actions' },
        supported.length ? saveMenu(c, supported) : null,
        h('button', { class: 'icon-btn', title: T('No me interesa'), onclick: async () => { reco.dismissed[c.path] = Date.now(); await saveReco(reco); card.remove(); } }, '✕'))));
  return card;
}

// Guardar una recomendación en una lista (en la plataforma donde está)
function saveMenu(c, supported) {
  const sel = h('select', { class: 'tv-select small' }, state.lists.map(l => h('option', { value: l.id }, l.name)));
  const btn = h('button', { class: 'primary small-btn', onclick: async () => {
    btn.disabled = true; btn.textContent = T('Guardando…');
    const o = supported[0];
    try {
      const info = await recoToTitle(c, o);
      let l = state.lists.find(x => x.id === sel.value) || state.lists[0];
      if (!l) l = SB.newList(state, T('Para ver'));
      SB.addToList(state, l, info);
      await persist(['lists', 'titles']);
      btn.textContent = '✓ ' + T('En «{0}»', l.name);
      renderSide();
    } catch (e) { btn.disabled = false; btn.textContent = '＋ ' + T('Guardar'); toastM(T('No se pudo guardar: {0}', e.message), true); }
  } }, '＋ ' + T('Guardar'));
  return h('div', { class: 'dc-save' }, btn, state.lists.length > 1 ? sel : null);
}
async function recoToTitle(c, o) {
  const p = SBP.get(o.platform);
  let pid = p.parseUrl(o.link), url = o.link;
  // Prime Video enlaza con «?gti=…»: su página dice cuál es la ficha de verdad
  if (!pid && o.platform === 'prime') {
    const gurl = o.link.replace('//app.primevideo.com', '//www.primevideo.com');
    const html = await (await fetch(gurl, { credentials: 'include' })).text();
    const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
    pid = p.parseUrl(canon); url = canon;
  }
  if (!pid) throw new Error(T('no reconozco el enlace de {0}', p.name));
  return { platform: o.platform, pid, title: c.title, type: c.type, year: c.year ? String(c.year) : '', img: c.poster || c.img || '', url: p.titleUrl ? p.titleUrl(pid, { url }) : url };
}
