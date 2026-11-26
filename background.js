// StreamBox — fondo: abre el gestor, sincroniza entre navegadores y comprueba las series en seguimiento.
if (typeof SB === 'undefined' && typeof importScripts === 'function') {
  try { importScripts('i18n.js', 'i18n-en.js', 'i18n-gl.js', 'common.js', 'platforms/netflix.js', 'platforms/prime.js', 'platforms/disney.js', 'platforms/movistar.js', 'info.js'); } catch (e) { console.warn('[StreamBox]', e); }
}
function openManager(hash) {
  chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') + (hash ? '#' + hash : '') });
}
chrome.action.onClicked.addListener(() => openManager(''));
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'openManager') openManager(msg.hash || '');
  if (msg && msg.type === 'syncNow') { syncNow().then(r => reply(r)).catch(e => reply({ error: e.message })); return true; }
  if (msg && msg.type === 'leavingCheck') { checkLeaving(true).then(r => reply(r)).catch(e => reply({ error: e.message })); return true; }
  if (msg && msg.type === 'info') { titleInfo(msg.key, msg.force).then(r => reply(r)).catch(e => reply({ error: e.message })); return true; }
  if (msg && msg.type === 'followCheck') { checkFollowed(msg.keys).then(r => reply(r)).catch(e => reply({ error: e.message })); return true; }
});
chrome.runtime.onInstalled.addListener((d) => { if (d.reason === 'install') openManager(''); pull().catch(() => {}); setupAlarm(); updateBadge(); });
chrome.runtime.onStartup.addListener(() => { pull().catch(() => {}); setupAlarm(); updateBadge(); });

// ---------- Seguimiento: comprobar cada 6 horas si hay temporadas o episodios nuevos ----------
function setupAlarm() { chrome.alarms.create('sb-follow', { delayInMinutes: 2, periodInMinutes: 360 }); }
chrome.alarms.onAlarm.addListener(a => {
  if (a.name !== 'sb-follow') return;
  checkFollowed().catch(e => console.warn('[StreamBox] seguimiento', e))
    .then(() => checkLeaving()).catch(e => console.warn('[StreamBox] se va pronto', e));
});

// ---------- «Se va pronto»: hasta cuándo sigue cada título guardado en su plataforma ----------
// Se guarda aparte (leaving[k] = { at: fecha de salida o 0, checked }) para no pisar los títulos.
let leavingBusy = null;
async function checkLeaving(force) {
  if (leavingBusy) return leavingBusy;
  leavingBusy = (async () => {
    const st = await SB.load();
    const { leaving = {} } = await chrome.storage.local.get('leaving');
    const inLists = new Set(st.lists.flatMap(l => l.items.map(i => i.k)));
    const todo = Object.values(st.titles).filter(t => inLists.has(t.key) && SBP.get(t.platform) && SBP.get(t.platform).leavingCheck
      && (force || !leaving[t.key] || Date.now() - (leaving[t.key].checked || 0) > 3 * 864e5)).slice(0, 25);
    for (const t of todo) {
      try { const at = await SBP.get(t.platform).leavingCheck(t.pid, t); leaving[t.key] = Object.assign(leaving[t.key] || {}, { at: at || (leaving[t.key] && leaving[t.key].fromPage && leaving[t.key].at > Date.now() ? leaving[t.key].at : 0), checked: Date.now() }); }
      catch (e) { leaving[t.key] = Object.assign(leaving[t.key] || {}, { checked: Date.now() }); }
      await new Promise(r => setTimeout(r, 600));
    }
    for (const k of Object.keys(leaving)) if (!st.titles[k]) delete leaving[k];
    await chrome.storage.local.set({ leaving });
    await notifyLeaving(st, leaving);
    return { revisados: todo.length };
  })();
  try { return await leavingBusy; } finally { leavingBusy = null; }
}

// ---------- Avisos del sistema (episodios nuevos y títulos que se van) ----------
const tr = (s, ...a) => (typeof T === 'function' ? T(s, ...a) : s.replace(/\{(\d)\}/g, (_, i) => a[i]));
async function notify(id, title, message) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (settings.notify === false || !chrome.notifications) return;
  try { await chrome.notifications.create(id, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title, message, priority: 1 }); } catch (e) { console.warn('[StreamBox] aviso', e); }
}
if (chrome.notifications) chrome.notifications.onClicked.addListener(id => {
  const hash = id.startsWith('sb-new-') ? '#follow' : id.startsWith('sb-leave-') ? '#tonight' : '';
  chrome.tabs.create({ url: chrome.runtime.getURL('manager.html' + hash) });
  chrome.notifications.clear(id);
});
async function notifyLeaving(st, leaving) {
  const soon = Object.entries(leaving).filter(([k, v]) => v.at && SB.daysLeft(v.at) <= 7 && SB.daysLeft(v.at) >= 0 && !v.notified && st.titles[k]);
  for (const [k, v] of soon) {
    const t = st.titles[k], d = SB.daysLeft(v.at), p = SBP.get(t.platform) || SB_PLATFORMS[t.platform] || { name: t.platform };
    await notify('sb-leave-' + k, tr('⏳ «{0}» se va de {1}', t.title, p.name), d <= 0 ? tr('Hoy es el último día para verla.') : d === 1 ? tr('Mañana es el último día para verla.') : tr('Quedan {0} días para verla.', d));
    v.notified = Date.now();
  }
  if (soon.length) await chrome.storage.local.set({ leaving });
}
let checking = null;
// ---------- «Info» de un título (notas y datos básicos), guardada unos días ----------
const INFO_DAYS = 7;
const infoBusy = {};
async function titleInfo(key, force) {
  const { info = {}, titles = {} } = await chrome.storage.local.get(['info', 'titles']);
  const t = titles[key];
  if (!t) return { error: 'no-title' };
  const old = info[key];
  const fresh = old && old.title === t.title && Date.now() - old.at < (old.found ? INFO_DAYS : 1) * 864e5;
  if (old && fresh && !force) return old;
  if (!infoBusy[key]) infoBusy[key] = SBInfo.lookup(t).finally(() => setTimeout(() => delete infoBusy[key], 0));
  const r = await infoBusy[key];
  const cur = (await chrome.storage.local.get('info')).info || {};
  cur[key] = r;
  // Que no crezca sin fin: se quitan las de títulos que ya no están guardados
  for (const k of Object.keys(cur)) if (!titles[k]) delete cur[k];
  await chrome.storage.local.set({ info: cur });
  return r;
}

async function checkFollowed(keys) {
  if (checking) return checking;
  checking = (async () => {
    const st = await SB.load();
    const todo = (keys || Object.keys(st.follow)).filter(k => st.follow[k] && st.titles[k]);
    const done = {};
    let nuevos = 0, revisadas = 0;
    for (const k of todo) {
      const t = st.titles[k], p = SBP.get(t.platform), rec = st.follow[k];
      if (!p || !p.followCheck) continue; // Disney+: se comprueba al entrar en la serie
      try {
        const obs = await p.followCheck(t.pid, t);
        if (obs) { if (SB.applyObs(rec, obs)) { nuevos++; await notify('sb-new-' + k, tr('✨ Novedades en «{0}»', t.title), rec.newWhat === 'season' ? tr('¡Hay una temporada nueva!') : tr('¡Hay episodios nuevos!')); } } else rec.checkedAt = Date.now();
        delete rec.error;
      } catch (e) { rec.error = e.message; rec.checkedAt = Date.now(); }
      done[k] = rec; revisadas++;
      await new Promise(r => setTimeout(r, 700));
    }
    // Guardar sin pisar lo que haya cambiado mientras tanto (seguir / dejar de seguir)
    const { follow = {} } = await chrome.storage.local.get('follow');
    for (const [k, rec] of Object.entries(done)) if (follow[k]) follow[k] = Object.assign(follow[k], rec);
    await chrome.storage.local.set({ follow, followCheckedAt: Date.now() });
    await updateBadge();
    return { revisadas, nuevos };
  })();
  try { return await checking; } finally { checking = null; }
}
// Número en el icono de la extensión: series con novedades
async function updateBadge() {
  const { follow = {}, settings = {} } = await chrome.storage.local.get(['follow', 'settings']);
  const n = Object.values(follow).filter(r => r && r.isNew).length;
  try {
    await chrome.action.setBadgeText({ text: n ? String(n) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: settings.color1 || '#ff4d6d' });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  } catch {}
}

// ---------- Sincronización entre navegadores (chrome.storage.sync) ----------
// Se guardan listas y títulos troceados (cada elemento de sync admite ~8 KB, en total ~100 KB).
// Si no cabe todo, se suben los títulos sin carátula (cada navegador conserva las suyas).
const CHUNK = 7000, MAX_CHUNKS = 13;
let pushTimer = null, applying = false;

async function deviceId() {
  let { syncDevice } = await chrome.storage.local.get('syncDevice');
  if (!syncDevice) { syncDevice = Math.random().toString(36).slice(2); await chrome.storage.local.set({ syncDevice }); }
  return syncDevice;
}

function payloadOf(lists, titles, withImg) {
  const t = {};
  for (const [k, x] of Object.entries(titles || {})) {
    t[k] = { platform: x.platform, pid: x.pid, title: x.title, type: x.type, year: x.year, url: x.url, added: x.added };
    if (x.rating) t[k].rating = x.rating;
    if (x.note) t[k].note = x.note;
    if (x.cats && x.cats.length) t[k].cats = x.cats;
    if (x.catsEdited) t[k].catsEdited = true;
    if (withImg && x.img) t[k].img = x.img;
  }
  return JSON.stringify({ lists: lists || [], titles: t });
}

async function push() {
  const { settings = {}, lists, titles, syncHash } = await chrome.storage.local.get(['settings', 'lists', 'titles', 'syncHash']);
  if (!settings.sync) return { skipped: true };
  let json = payloadOf(lists, titles, true);
  if (json.length > CHUNK * MAX_CHUNKS) json = payloadOf(lists, titles, false);
  if (json === syncHash) return { unchanged: true };
  const parts = [];
  for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
  if (parts.length > MAX_CHUNKS) {
    await chrome.storage.local.set({ syncStatus: { error: 'Demasiados datos para sincronizar (prueba a usar iconos que no sean imágenes subidas)', at: Date.now() } });
    return { error: 'too big' };
  }
  const items = { meta: { n: parts.length, ts: Date.now(), by: await deviceId() } };
  parts.forEach((p, i) => items['c' + i] = p);
  await chrome.storage.sync.set(items);
  const old = await chrome.storage.sync.get(null);
  const stale = Object.keys(old).filter(k => /^c\d+$/.test(k) && +k.slice(1) >= parts.length);
  if (stale.length) await chrome.storage.sync.remove(stale);
  await chrome.storage.local.set({ syncHash: json, syncTs: items.meta.ts, syncStatus: { ok: 'Subido', at: Date.now() } });
  return { pushed: true };
}

async function pull() {
  const { settings = {}, syncTs = 0, titles: localT = {}, queue = {} } = await chrome.storage.local.get(['settings', 'syncTs', 'titles', 'queue']);
  if (!settings.sync) return { skipped: true };
  const all = await chrome.storage.sync.get(null);
  const meta = all.meta;
  if (!meta || meta.ts <= syncTs) return { nothing: true };
  let json = '';
  for (let i = 0; i < meta.n; i++) json += all['c' + i] || '';
  const data = JSON.parse(json);
  // Conservar las carátulas locales si las sincronizadas no vienen
  for (const [k, t] of Object.entries(data.titles)) { t.key = k; if (!t.img && localT[k] && localT[k].img) t.img = localT[k].img; if (localT[k] && localT[k].genres) t.genres = localT[k].genres; }
  // La cola es de este navegador: sus títulos se conservan aunque no vengan en la sincronización
  for (const i of queue.items || []) if (!data.titles[i.k] && localT[i.k]) data.titles[i.k] = localT[i.k];
  const { follow = {} } = await chrome.storage.local.get('follow');
  for (const k of Object.keys(follow)) if (!data.titles[k] && localT[k]) data.titles[k] = localT[k];
  applying = true;
  await chrome.storage.local.set({ lists: data.lists, titles: data.titles, syncHash: json, syncTs: meta.ts, syncStatus: { ok: 'Descargado', at: Date.now() } });
  applying = false;
  return { pulled: true };
}

async function syncNow() {
  const r = await pull();
  if (r.pulled) return r;
  await chrome.storage.local.remove('syncHash');
  return push();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.meta) { pull().catch(() => {}); return; }
  if (area === 'local' && changes.follow) updateBadge();
  if (area !== 'local' || applying) return;
  if (changes.settings && changes.settings.newValue && changes.settings.newValue.sync && !(changes.settings.oldValue || {}).sync) { syncNow().catch(() => {}); return; }
  if (changes.lists || changes.titles) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push().catch(e => chrome.storage.local.set({ syncStatus: { error: e.message, at: Date.now() } })), 3000);
  }
});
