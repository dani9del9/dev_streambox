// StreamBox — «Reproducir en…»: en este ordenador, en tus dispositivos registrados (tele con Google TV /
// Android TV y móviles: ver manager-devices.js), en el móvil con un código QR, compartir o copiar el enlace.
// Nunca se envía vídeo: el otro dispositivo abre el título en la app oficial de la plataforma.
function titlePublicUrl(t) {
  const p = SBP.get(t.platform);
  try { if (p && p.titleUrl) return p.titleUrl(t.pid, t); } catch {}
  return t.url || SB.playUrl(t);
}
async function openPlayOn(t, anchor) {
  $('.playon-pop')?.remove();
  const devs = typeof loadDevices === 'function' ? await loadDevices() : [];
  const url = titlePublicUrl(t), pname = (SB_PLATFORMS[t.platform] || {}).name || t.platform;
  const close = () => { pop.remove(); document.removeEventListener('mousedown', out, true); };
  const out = e => { if (!pop.contains(e.target)) close(); };
  const item = (ico, label, sub, fn) => h('button', { class: 'po-item', type: 'button', onclick: () => { close(); fn(); } }, h('span', { class: 'po-ico' }, ico), h('span', { class: 'po-txt' }, h('b', {}, label), sub ? h('small', {}, sub) : null));
  const pop = h('div', { class: 'playon-pop', role: 'menu' },
    h('div', { class: 'po-head' }, T('Reproducir «{0}» en…', t.title || t.pid)),
    item('💻', T('Este ordenador'), pname, () => window.open(SB.playUrl(t), '_blank')),
    /^chrome-extension:/.test(location.href) ? item('📡', T('Enviar a la tele con Chrome'), T('Lo abre aquí y te indica dónde pulsar «Enviar»'), async () => {
      await chrome.storage.local.set({ castHint: { at: Date.now(), key: t.key || (t.platform + ':' + t.pid) } });
      window.open(SB.playUrl(t), '_blank');
    }) : null,
    ...devs.map(d => item(d.kind === 'tv' ? '📺' : '📱', d.name, d.kind === 'tv' ? T('Se abre en la app de {0} de la tele', pname) : T('Notificación: tócala y se abre en la app'), () => sendToDevice(d, t))),
    item('📱', T('Móvil o tablet'), T('Escanea un código QR: se abre en la app de {0}', pname), () => showQR(t, url)),
    navigator.share ? item('📤', T('Compartir con mis dispositivos…'), T('Enlace Móvil, dispositivos cercanos, correo…'), () => navigator.share({ title: t.title, text: T('Ver «{0}» en {1}', t.title, pname), url }).catch(() => {})) : null,
    devs.length ? null : item('📺', T('Mi tele o mi móvil'), T('Registra tus dispositivos para abrirlo en ellos con un clic'), () => tvHelp(t, url)),
    item('🔗', T('Copiar enlace'), '', async () => { await navigator.clipboard.writeText(url); toastM(T('Enlace copiado')); }));
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(10, Math.min(innerWidth - pop.offsetWidth - 10, r.left)) + 'px';
  pop.style.top = (r.bottom + 6 + pop.offsetHeight > innerHeight - 10 ? Math.max(10, r.top - pop.offsetHeight - 6) : r.bottom + 6) + 'px';
  setTimeout(() => document.addEventListener('mousedown', out, true), 0);
}
function showQR(t, url) {
  let svg = '';
  try { svg = SBQR.svg(url, 240); } catch { svg = ''; }
  const box = h('div', { class: 'qr-box' }); box.innerHTML = svg;
  dialog('📱 ' + T('Abrir en el móvil'),
    h('div', { class: 'qr-wrap' }, box,
      h('div', { class: 'qr-side' },
        h('b', {}, t.title), SB.platformBadge(t.platform, true),
        h('p', {}, T('Apunta la cámara del móvil o la tablet al código: se abrirá «{0}» en la app de {1} (si la tienes instalada) o en su web.', t.title, (SB_PLATFORMS[t.platform] || {}).name || t.platform)),
        h('p', { class: 'muted small' }, T('¿Lo quieres en la tele? Registra tu Google TV en Ajustes › Mis dispositivos y se abrirá allí directamente.')))),
    h('div', { class: 'dlg-foot' }, h('small', { class: 'muted' }, url), h('button', { class: 'secondary', onclick: async () => { await navigator.clipboard.writeText(url); toastM(T('Enlace copiado')); } }, '🔗 ' + T('Copiar enlace'))));
}
function tvHelp(t, url) {
  dialog('📲 ' + T('Abrir en tu tele o tu móvil'),
    h('p', {}, T('StreamBox no envía el vídeo (las plataformas lo bloquean desde el navegador): le dice a tu dispositivo que abra «{0}» en su propia app, con tu cuenta.', t.title || t.pid)),
    h('ul', { class: 'tv-steps' },
      h('li', {}, h('b', {}, T('Google TV / Android TV / Fire TV')), ': ', T('se abre directamente en la app de la tele. Necesita un pequeño ayudante en el ordenador y activar la depuración en la tele (una vez).')),
      h('li', {}, h('b', {}, T('Móvil o tablet')), ': ', T('te llega una notificación (app gratuita ntfy); al tocarla se abre en la app.'))),
    h('p', { class: 'muted small' }, T('Ojo: Netflix ya no deja enviar desde su app del móvil a las teles con Google TV, así que para Netflix la tele es la buena opción.')),
    h('div', { class: 'dlg-foot' },
      h('button', { class: 'secondary', onclick: () => { $('.sb-dialog')?.remove(); showQR(t, url); } }, '📱 ' + T('Código QR')),
      h('button', { class: 'primary', onclick: () => { $('.sb-dialog')?.remove(); go({ name: 'settings' }); setTimeout(() => $('#devices-card')?.scrollIntoView({ block: 'start' }), 60); } }, '⚙️ ' + T('Registrar mis dispositivos'))));
}
