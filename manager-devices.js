// StreamBox — «Mis dispositivos»: abrir un título en la app oficial de otro dispositivo (no se envía vídeo).
//  · Tele (Google TV / Android TV / Fire TV): por la red, con adb, a través de un pequeño ayudante
//    instalado en el ordenador (native-host/instalar.bat) con el que la extensión habla por Native Messaging.
//  · Móvil o tablet: una notificación con ntfy (app gratuita); al tocarla, se abre la app de la plataforma.
const SB_HOST = 'com.streambox.devices';
const NTFY = 'https://ntfy.sh';

async function loadDevices() { const { devices = [] } = await chrome.storage.local.get('devices'); return devices; }
async function saveDevices(list) { await chrome.storage.local.set({ devices: list }); }

function nativeCall(msg) {
  return new Promise((res, rej) => {
    try {
      chrome.runtime.sendNativeMessage(SB_HOST, msg, r => {
        const err = chrome.runtime.lastError;
        if (err) rej(new Error(err.message || 'native')); else res(r || { ok: false, error: 'empty' });
      });
    } catch (e) { rej(e); }
  });
}
const hostMissing = e => /not found|no such native|not registered|forbidden|access to the specified|exited/i.test(String(e && e.message || e));

const DEV_ERR = {
  noadb: () => T('El ayudante no encuentra adb. Vuelve a ejecutar instalar.bat (carpeta native-host).'),
  unauthorized: () => T('La tele aún no ha dado permiso: mira la pantalla y acepta «¿Permitir la depuración?» (marca «Permitir siempre»).'),
  unreachable: () => T('No contesta. ¿Está encendida, en la misma red y con la depuración activada? Revisa la IP.'),
  noapp: () => T('La tele no tiene la app de esa plataforma (o no reconoce el enlace).'),
  badaddr: () => T('La dirección no es válida.'),
  pairfail: () => T('No se pudo emparejar: revisa la dirección y el código de 6 cifras.'),
};
const devErr = r => (DEV_ERR[r && r.error] || (() => T('Algo falló ({0})', (r && (r.error || r.out)) || '?')))();

// Cómo pedirle a cada app de tele que abra un título concreto
function tvIntents(t) {
  const url = titlePublicUrl(t), pid = String(t.pid || '');
  switch (t.platform) {
    case 'netflix': {
      const id = (pid.match(/\d{5,}/) || [pid])[0];
      return {
        intents: [
          { component: 'com.netflix.ninja/.MainActivity', data: 'netflix://title/' + id, flags: '0x10808000', extras: { source: '30' } },
          { pkg: 'com.netflix.ninja', data: 'https://www.netflix.com/title/' + id },
          { pkgMatch: 'netflix', data: 'https://www.netflix.com/title/' + id },
        ], launch: 'netflix',
      };
    }
    case 'prime': {
      const gti = /^amzn1\.dv\.gti\./.test(pid) ? pid : '';
      const list = [];
      if (gti) list.push({ pkg: 'com.amazon.amazonvideo.livingroom', data: 'https://app.primevideo.com/detail?gti=' + gti });
      list.push({ pkg: 'com.amazon.amazonvideo.livingroom', data: url }, { pkgMatch: 'amazonvideo|primevideo|avod', data: url });
      return { intents: list, launch: 'amazonvideo|primevideo' };
    }
    case 'disney':
      return { intents: [{ pkg: 'com.disney.disneyplus', data: url }, { pkgMatch: 'disney', data: url }], launch: 'disney' };
    case 'movistar':
      return { intents: [{ pkgMatch: 'movistar|yomvi', data: url }], launch: 'movistar|yomvi' };
    default:
      return { intents: [{ data: url }], launch: '' };
  }
}

async function sendToDevice(d, t) {
  const pname = (SB_PLATFORMS[t.platform] || {}).name || t.platform;
  if (d.kind === 'phone') {
    try {
      const r = await fetch((d.server || NTFY).replace(/\/+$/, ''), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: d.topic, title: '▶ ' + (t.title || t.pid), message: T('Toca para abrirlo en {0}', pname), click: titlePublicUrl(t), tags: ['tv'], priority: 4 }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      toastM(T('📱 Enviado a {0}: toca la notificación', d.name));
    } catch (e) { toastM(T('No se pudo enviar a {0} ({1})', d.name, e.message), true); }
    return;
  }
  toastM(T('📺 Abriendo en {0}…', d.name));
  try {
    const p = tvIntents(t);
    const r = await nativeCall({ op: 'open', addr: d.addr, intents: p.intents, launch: p.launch });
    if (r.ok) toastM(r.how === 'deeplink' ? T('📺 Abierto en {0}', d.name) : T('📺 Abierta la app de {0} en {1} (búscalo allí: no aceptó el enlace directo)', pname, d.name));
    else toastM(d.name + ': ' + devErr(r), true);
  } catch (e) {
    if (hostMissing(e)) helperDialog(); else toastM(d.name + ': ' + e.message, true);
  }
}

// ---------- Ayudante del ordenador ----------
function helperSteps() {
  const id = chrome.runtime.id, isFx = /^moz-extension:/.test(location.href);
  return h('div', { class: 'dev-helper' },
    h('ol', { class: 'tv-steps' },
      h('li', {}, T('Necesitas Node.js instalado (nodejs.org).')),
      h('li', {}, T('En la carpeta de StreamBox, abre native-host y ejecuta instalar.bat (no pide permisos de administrador; descarga adb de Google si no lo tienes).')),
      isFx ? h('li', {}, T('En Firefox no hace falta nada más: pulsa Intro cuando te pida el ID.'))
        : h('li', {}, T('Cuando te lo pida, pega este ID:'), ' ', h('code', { class: 'dev-id' }, id), ' ',
          h('button', { class: 'secondary small', onclick: async () => { await navigator.clipboard.writeText(id); toastM(T('ID copiado')); } }, '📋 ' + T('Copiar'))),
      h('li', {}, T('Reinicia el navegador y pulsa «Comprobar».'))));
}
function helperDialog() {
  dialog('🧩 ' + T('Falta el ayudante del ordenador'),
    h('p', {}, T('Para abrir títulos en la tele, StreamBox usa un pequeño programa en tu ordenador que habla con ella por la red (con adb, la herramienta oficial de Android). Se instala una vez:')),
    helperSteps(),
    h('div', { class: 'dlg-foot' }, h('button', { class: 'primary', onclick: () => { $('.sb-dialog')?.remove(); go({ name: 'settings' }); setTimeout(() => $('#devices-card')?.scrollIntoView({ block: 'start' }), 60); } }, T('Ir a Mis dispositivos'))));
}

// ---------- Alta de dispositivos ----------
function tvForm(onDone, prev) {
  const name = h('input', { type: 'text', class: 'dev-inp', maxlength: '30', placeholder: T('Tele del salón'), value: prev ? prev.name : '' });
  const addr = h('input', { type: 'text', class: 'dev-inp', maxlength: '60', placeholder: '192.168.1.40', value: prev ? prev.addr : '' });
  const pAddr = h('input', { type: 'text', class: 'dev-inp', maxlength: '60', placeholder: '192.168.1.40:37123' });
  const pCode = h('input', { type: 'text', class: 'dev-inp', maxlength: '6', inputmode: 'numeric', placeholder: '123456' });
  const out = h('p', { class: 'dev-out muted small' });
  const say = (msg, bad) => { out.textContent = msg; out.classList.toggle('err', !!bad); };
  const test = async () => {
    const a = addr.value.trim();
    if (!a) return say(T('Escribe la IP de la tele.'), true);
    say(T('Conectando… (si es la primera vez, acepta el aviso en la tele)'));
    try { const r = await nativeCall({ op: 'connect', addr: a }); r.ok ? say('✅ ' + T('Conectada ({0})', r.serial)) : say(devErr(r), true); return r.ok; }
    catch (e) { if (hostMissing(e)) { say(T('Primero instala el ayudante del ordenador (abajo, en Mis dispositivos).'), true); } else say(e.message, true); return false; }
  };
  const pair = async () => {
    say(T('Emparejando…'));
    try { const r = await nativeCall({ op: 'pair', addr: pAddr.value.trim(), code: pCode.value.trim() }); r.ok ? say('✅ ' + T('Emparejada. Ahora escribe arriba la IP y el puerto que muestra «Depuración inalámbrica» y pulsa «Probar».')) : say(devErr(r), true); }
    catch (e) { say(hostMissing(e) ? T('Primero instala el ayudante del ordenador (abajo, en Mis dispositivos).') : e.message, true); }
  };
  const d = dialog('📺 ' + (prev ? T('Editar tele') : T('Añadir una tele')),
    h('details', { class: 'dev-howto', open: prev ? null : '' }, h('summary', {}, T('Cómo prepararla (una sola vez)')),
      h('ol', { class: 'tv-steps' },
        h('li', {}, T('En la tele: Ajustes › Sistema › Información › pulsa 7 veces en «Compilación del SO de Android TV» para activar las opciones de desarrollador.')),
        h('li', {}, T('Ajustes › Sistema › Opciones para desarrolladores › activa «Depuración por USB» (en Chromecast con Google TV sirve también por la red).')),
        h('li', {}, T('Mira su IP en Ajustes › Red e Internet › tu wifi. Mejor si le das una IP fija en el router.')),
        h('li', {}, T('Pulsa «Probar» aquí: la tele te preguntará si permites la depuración; marca «Permitir siempre».')))),
    h('label', { class: 'dev-lbl' }, T('Nombre'), name),
    h('label', { class: 'dev-lbl' }, T('IP (y puerto, si no es el 5555)'), addr),
    h('details', { class: 'dev-howto' }, h('summary', {}, T('¿Tu tele usa «Depuración inalámbrica» con código? (Google TV Streamer, Android 11+)')),
      h('p', { class: 'muted small' }, T('Activa «Depuración inalámbrica», entra en «Vincular dispositivo con código» y copia aquí la dirección y el código que te enseña:')),
      h('div', { class: 'dev-pair' }, pAddr, pCode, h('button', { class: 'secondary', onclick: pair }, T('Emparejar')))),
    out,
    h('div', { class: 'dlg-foot' },
      h('button', { class: 'secondary', onclick: test }, '🔌 ' + T('Probar')),
      h('button', { class: 'primary', onclick: async () => {
        const a = addr.value.trim();
        if (!/^[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(a)) return say(T('La dirección no es válida.'), true);
        await onDone({ id: prev ? prev.id : SB.uid(), kind: 'tv', name: name.value.trim() || T('Tele'), addr: a });
        d.close();
      } }, T('Guardar'))));
  setTimeout(() => (prev ? addr : name).focus(), 30);
}
function randTopic() { const a = new Uint8Array(10); crypto.getRandomValues(a); return 'streambox-' + [...a].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); }
function phoneForm(onDone, prev) {
  const topic = prev ? prev.topic : randTopic();
  const name = h('input', { type: 'text', class: 'dev-inp', maxlength: '30', placeholder: T('Mi móvil'), value: prev ? prev.name : '' });
  const subUrl = NTFY + '/' + topic;
  const box = h('div', { class: 'qr-box' }); try { box.innerHTML = SBQR.svg(subUrl, 180); } catch {}
  const dev = () => ({ id: prev ? prev.id : SB.uid(), kind: 'phone', name: name.value.trim() || T('Móvil'), topic, server: NTFY });
  const d = dialog('📱 ' + (prev ? T('Editar móvil o tablet') : T('Añadir un móvil o tablet')),
    h('div', { class: 'qr-wrap' }, box,
      h('div', { class: 'qr-side' },
        h('ol', { class: 'tv-steps' },
          h('li', {}, T('Instala la app gratuita «ntfy» (Google Play, F-Droid o App Store).')),
          h('li', {}, T('En la app, pulsa ＋ y suscríbete a este tema (o escanea el código y elige abrirlo en ntfy):')),
          h('li', {}, T('Pulsa «Enviar prueba»: te llegará una notificación; al tocarla se abre el título en la app de la plataforma.'))),
        h('code', { class: 'dev-id' }, topic),
        h('p', { class: 'muted small' }, T('El nombre del tema es tu «contraseña»: es largo y al azar para que nadie más lo adivine. No compartas el código.')))),
    h('label', { class: 'dev-lbl' }, T('Nombre'), name),
    h('div', { class: 'dlg-foot' },
      h('button', { class: 'secondary', onclick: () => sendToDevice(dev(), { platform: 'netflix', pid: '80057281', title: T('Prueba de StreamBox') }) }, '🔔 ' + T('Enviar prueba')),
      h('button', { class: 'primary', onclick: async () => { await onDone(dev()); d.close(); } }, T('Guardar'))));
  setTimeout(() => name.focus(), 30);
}

// ---------- Tarjeta en Ajustes ----------
function devicesCard() {
  const listEl = h('div', { class: 'dev-list' });
  const status = h('div', { class: 'dev-status muted small' });
  const helperBox = h('div', {});
  const upsert = async d => { const l = await loadDevices(); const i = l.findIndex(x => x.id === d.id); if (i >= 0) l[i] = d; else l.push(d); await saveDevices(l); draw(); };
  const draw = async () => {
    const l = await loadDevices();
    listEl.replaceChildren(...(l.length ? l.map(d => h('div', { class: 'dev-row' },
      h('span', { class: 'dev-ico' }, d.kind === 'tv' ? '📺' : '📱'),
      h('span', { class: 'dev-txt' }, h('b', {}, d.name), h('small', { class: 'muted' }, d.kind === 'tv' ? d.addr : T('Notificaciones ntfy'))),
      h('button', { class: 'secondary small', title: T('Probar'), onclick: async () => {
        if (d.kind === 'phone') return sendToDevice(d, { platform: 'netflix', pid: '80057281', title: T('Prueba de StreamBox') });
        try { const r = await nativeCall({ op: 'connect', addr: d.addr }); toastM(r.ok ? '✅ ' + T('{0} conectada', d.name) : d.name + ': ' + devErr(r), !r.ok); }
        catch (e) { hostMissing(e) ? helperDialog() : toastM(e.message, true); }
      } }, '🔌'),
      h('button', { class: 'secondary small', title: T('Editar'), onclick: () => (d.kind === 'tv' ? tvForm : phoneForm)(upsert, d) }, '✏️'),
      h('button', { class: 'secondary small', title: T('Quitar'), onclick: async () => { await saveDevices((await loadDevices()).filter(x => x.id !== d.id)); draw(); } }, '🗑'))) : [h('p', { class: 'muted small' }, T('Aún no tienes dispositivos. Añade tu tele o tu móvil y aparecerán en «📲 Reproducir en…» de cada título.'))]));
  };
  const check = async () => {
    status.textContent = T('Comprobando…');
    try {
      const r = await nativeCall({ op: 'ping' });
      status.textContent = r.adb ? '✅ ' + T('Ayudante instalado (v{0}) · {1}', r.version, r.adb) : '⚠️ ' + T('Ayudante instalado, pero sin adb: vuelve a ejecutar instalar.bat.');
      helperBox.replaceChildren();
    } catch (e) {
      status.textContent = '⚠️ ' + T('El ayudante del ordenador no está instalado (solo hace falta para las teles).');
      helperBox.replaceChildren(helperSteps());
    }
  };
  draw(); check();
  return h('div', { class: 'card', id: 'devices-card' }, h('h3', { style: 'margin-top:0' }, T('📲 Mis dispositivos')),
    h('p', { class: 'muted small' }, T('Abre un título directamente en la app de tu tele o de tu móvil, sin enviar el vídeo: el dispositivo lo reproduce con su propia app y tu cuenta.')),
    listEl,
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-top:10px' },
      h('button', { class: 'secondary', onclick: () => tvForm(upsert) }, '📺 ' + T('Añadir tele (Google TV / Android TV)')),
      h('button', { class: 'secondary', onclick: () => phoneForm(upsert) }, '📱 ' + T('Añadir móvil o tablet'))),
    h('h4', {}, T('Ayudante del ordenador (para las teles)')), status,
    h('button', { class: 'secondary small', onclick: check }, T('Comprobar')), helperBox);
}
