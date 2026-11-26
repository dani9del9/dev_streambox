// StreamBox — Listas compartidas: una lista se comparte con un código; quien lo importa puntúa y
// devuelve su código, y cada StreamBox combina los votos de todos. No hay servidor: los códigos
// viajan por donde queráis (WhatsApp, correo…).
const SHARE_PREFIX = 'SBL1.';
const myName = () => (state.settings.myName || '').trim();

// Ventana sencilla (reutilizable)
function dialog(title, ...body) {
  $('.sb-dialog')?.remove();
  const close = () => { ov.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  const ov = h('div', { class: 'modal sb-dialog', onclick: e => { if (e.target === ov) close(); } },
    h('div', { class: 'dlg' }, h('div', { class: 'dlg-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', title: T('Cerrar'), onclick: close }, '✕')), h('div', { class: 'dlg-body' }, ...body)));
  document.addEventListener('keydown', key);
  document.body.append(ov);
  return { close, el: ov };
}
function askName(then) {
  const inp = h('input', { type: 'text', class: 'name-input small', maxlength: '30', placeholder: T('Tu nombre o apodo'), value: myName() });
  const d = dialog('👋 ' + T('¿Cómo te llamas?'),
    h('p', { class: 'muted' }, T('Es el nombre con el que verán tus votos los demás.')), inp,
    h('div', { class: 'dlg-foot' }, h('button', { class: 'primary', onclick: async () => {
      if (!inp.value.trim()) return inp.focus();
      state.settings.myName = inp.value.trim(); await persist(['settings']); d.close(); then();
    } }, T('Continuar'))));
  setTimeout(() => inp.focus(), 50);
}

// Votos de una lista compartida: los míos son siempre mis estrellas actuales
function listVotes(l) {
  const votes = JSON.parse(JSON.stringify((l.shared && l.shared.votes) || {}));
  const me = myName();
  if (me) { votes[me] = {}; for (const i of l.items) { const t = state.titles[i.k]; if (t && t.rating) votes[me][i.k] = t.rating; } }
  return votes;
}
function groupScore(l, k) {
  const v = Object.values(listVotes(l)).map(m => m[k]).filter(Boolean);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
// Para «¿Qué veo esta noche?»: lo que opinan los demás de un título (en cualquier lista compartida)
function othersAvg(k) {
  const me = myName(), v = [];
  for (const l of state.lists) if (l.shared) for (const [who, m] of Object.entries(l.shared.votes || {})) if (who !== me && m[k]) v.push(m[k]);
  return v.length ? { avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length } : null;
}

async function shareList(l) {
  if (!myName()) return askName(() => shareList(l));
  l.shared = l.shared || { id: SB.uid() + SB.uid(), votes: {} };
  await persist(['lists']);
  const titles = l.items.map(i => state.titles[i.k]).filter(Boolean).map(t => ({ k: t.key, p: t.platform, id: t.pid, n: t.title, ty: t.type, y: t.year, i: t.img, u: t.url, g: t.genres }));
  const code = await SB.packCode({ v: 1, id: l.shared.id, name: l.name, icon: l.icon, color: l.color, from: myName(), titles, votes: listVotes(l) }, SHARE_PREFIX);
  const ta = h('textarea', { class: 'code-box', readonly: '', rows: '5' }, code);
  const copy = h('button', { class: 'primary', onclick: async () => { await navigator.clipboard.writeText(T('Mi lista «{0}» de StreamBox:', l.name) + ' ' + code); copy.textContent = '✓ ' + T('Copiado'); } }, '📋 ' + T('Copiar'));
  dialog('👥 ' + T('Compartir «{0}»', l.name),
    h('p', {}, T('Envía este código a quien quieras (por WhatsApp, correo…). En su StreamBox: «📥 Importar lista compartida», en la barra lateral. Verá la lista con tus estrellas; cuando puntúe, que te devuelva su código y aquí se juntan los votos de todos.')),
    ta,
    h('div', { class: 'dlg-foot' }, h('span', { class: 'muted small' }, TN(titles.length, '{0} título', '{0} títulos') + ' · ' + T('{0} caracteres', code.length)), copy));
  setTimeout(() => ta.select(), 50);
}

async function importShared() {
  const ta = h('textarea', { class: 'code-box', rows: '5', placeholder: T('Pega aquí el código (empieza por {0})', SHARE_PREFIX) });
  const msg = h('div', { class: 'msg' });
  const d = dialog('📥 ' + T('Importar lista compartida'),
    h('p', {}, T('Pega el código de una lista compartida. Si ya la tenías, se añaden los títulos nuevos y se actualizan los votos de quien te la envía.')),
    ta, msg,
    h('div', { class: 'dlg-foot' }, h('button', { class: 'primary', onclick: async () => {
      let data;
      try { data = await SB.unpackCode(ta.value, SHARE_PREFIX); } catch { msg.className = 'msg err'; msg.textContent = T('Ese código no es válido o está incompleto.'); return; }
      if (!data || !data.id || !Array.isArray(data.titles)) { msg.className = 'msg err'; msg.textContent = T('Ese código no es válido o está incompleto.'); return; }
      const me = myName();
      let l = state.lists.find(x => x.shared && x.shared.id === data.id);
      const isNew = !l;
      if (!l) { l = { id: SB.uid(), name: data.name || T('Lista compartida'), icon: data.icon || { type: 'svg', value: 'grupo', bg: true }, color: data.color || '#5b5bd6', items: [], shared: { id: data.id, votes: {} } }; state.lists.push(l); }
      let added = 0;
      for (const x of data.titles) {
        const t = SB.upsertTitle(state, { key: x.k, platform: x.p, pid: x.id, title: x.n, type: x.ty, year: x.y, img: x.i, url: x.u, genres: x.g });
        if (!l.items.some(i => i.k === t.key)) { l.items.push({ k: t.key, at: Date.now() }); added++; }
      }
      // Los votos de los demás (los míos siguen siendo mis estrellas)
      for (const [who, m] of Object.entries(data.votes || {})) if (who !== me) l.shared.votes[who] = m;
      await persist(['lists', 'titles']);
      d.close();
      toastM(isNew ? T('Lista «{0}» importada · {1}', l.name, TN(added, '{0} título', '{0} títulos')) : T('«{0}» actualizada · {1} nuevos · votos de {2}', l.name, added, data.from || '?'));
      go({ name: 'list', id: l.id });
    } }, T('Importar'))));
  setTimeout(() => ta.focus(), 50);
}

// Votos del grupo en la tarjeta de un título (solo en listas compartidas)
function votesEl(l, t) {
  const votes = listVotes(l), me = myName();
  const rows = Object.entries(votes).map(([who, m]) => [who, m[t.key]]).filter(x => x[1]);
  if (!rows.length) return null;
  const avg = rows.reduce((a, x) => a + x[1], 0) / rows.length;
  return h('div', { class: 'tvotes', title: rows.map(([w, v]) => (w === me ? T('Tú') : w) + ': ' + '★'.repeat(v)).join('\n') },
    h('span', { class: 'tv-avg' }, '👥 ' + avg.toLocaleString(T.locale(), { maximumFractionDigits: 1 })),
    rows.slice(0, 4).map(([w, v]) => h('span', { class: 'tv-who' + (w === me ? ' me' : '') }, h('b', {}, (w === me ? T('Tú') : w).slice(0, 10)), ' ★' + v)));
}
