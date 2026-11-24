// StreamBox — puente en el «mundo» de la página de Netflix: lee de la caché de la web (netflix.falcorCache)
// el título, el tipo, el año y la carátula de un id, y se los pasa al script de la extensión.
(() => {
  const val = x => (x && typeof x === 'object' && 'value' in x) ? x.value : x;
  function findUrl(o, depth = 0) {
    if (!o || depth > 5) return '';
    if (typeof o === 'string') return /^https:\/\/.*\.(jpg|jpeg|webp|png)/i.test(o) ? o : '';
    if (typeof o !== 'object') return '';
    if (typeof o.url === 'string') return o.url;
    for (const k of Object.keys(o)) { const u = findUrl(o[k], depth + 1); if (u) return u; }
    return '';
  }
  function meta(pid) {
    const cache = window.netflix && (window.netflix.falcorCache || (window.netflix.appContext && window.netflix.appContext.state && window.netflix.appContext.state.pathEvaluator && window.netflix.appContext.state.pathEvaluator.getCache && window.netflix.appContext.state.pathEvaluator.getCache()));
    const v = cache && cache.videos && cache.videos[pid];
    if (!v) return null;
    const summary = val(v.summary) || {};
    const t = String(summary.type || val(v.type) || '').toLowerCase();
    return {
      title: val(v.title) || '',
      type: t === 'show' || t === 'series' ? 'series' : t === 'movie' ? 'movie' : '',
      year: String(val(v.releaseYear) || ''),
      img: findUrl(v.boxarts) || findUrl(v.boxArt) || '',
    };
  }
  // Serie (o peli) a la que pertenece un episodio: API de metadatos que usa la propia web
  function buildId() {
    const n = window.netflix || {};
    const pick = o => o && o.models && o.models.serverDefs && o.models.serverDefs.data && o.models.serverDefs.data.BUILD_IDENTIFIER;
    return pick(n.reactContext) || pick(n.appContext && n.appContext.state && n.appContext.state.model) || '';
  }
  async function show(wid) {
    let v = null;
    for (const b of [buildId(), 'release'].filter(Boolean)) {
      try {
        const r = await fetch(`/nq/website/memberapi/${b}/metadata?movieid=${encodeURIComponent(wid)}`, { credentials: 'include' });
        if (r.ok) { v = (await r.json()).video; if (v) break; }
      } catch {}
    }
    if (!v || !v.id) return null;
    const art = [].concat(v.boxart || [], v.artwork || [], v.storyart || []).find(a => a && a.url);
    return { pid: String(v.id), title: v.title || '', type: v.type === 'show' ? 'series' : v.type === 'movie' ? 'movie' : '', year: String(v.year || ''), img: art ? art.url : '' };
  }
  window.addEventListener('message', async e => {
    if (e.source !== window || !e.data || !/^nf-/.test(e.data.sbReq || '')) return;
    let data = null;
    try { data = e.data.sbReq === 'nf-ping' ? { ok: 1 } : e.data.sbReq === 'nf-show' ? await show(String(e.data.pid)) : meta(String(e.data.pid)); } catch {}
    window.postMessage({ sbRes: e.data.id, data }, location.origin);
  });
})();
