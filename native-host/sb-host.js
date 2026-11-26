#!/usr/bin/env node
// StreamBox — ayudante para «Reproducir en…» (Google TV / Android TV / Fire TV).
// La extensión le habla por Native Messaging y él usa adb (por la red) para que la tele abra
// el título en la app oficial de la plataforma. No envía vídeo: solo «abre esta ficha».
// Órdenes: ping · connect {addr} · pair {addr, code} · open {addr, intents[], launch} · disconnect {addr}
'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERSION = '1.0.0';
const ADDR_RE = /^[A-Za-z0-9.\-]+(:\d{1,5})?$/;           // 192.168.1.40 · 192.168.1.40:5555 · tele.local:37000
const DATA_RE = /^[A-Za-z][A-Za-z0-9+.\-]*:[A-Za-z0-9\-._~:/?#\[\]@!$&()*+,;=%]+$/; // URI sin comillas ni espacios
const PKG_RE = /^[A-Za-z0-9_.]+(\/[A-Za-z0-9_.$]+)?$/;
const KEY_RE = /^[A-Za-z0-9_.]+$/;

function adbPath() {
  if (process.env.SB_ADB) return process.env.SB_ADB;
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  for (const p of [path.join(__dirname, 'platform-tools', exe), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'StreamBox', 'devices', 'platform-tools', exe)]) {
    if (p && fs.existsSync(p)) return p;
  }
  return 'adb';
}
function adb(args, timeout = 15000) {
  return new Promise(res => {
    execFile(adbPath(), args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      const out = String(stdout || '') + String(stderr || '');
      res({ code: err ? (err.code ?? 1) : 0, out: out.trim(), missing: !!(err && err.code === 'ENOENT') });
    });
  });
}
const withPort = a => (/:\d+$/.test(a) ? a : a + ':5555');

async function connect(addr) {
  const serial = withPort(addr);
  const r = await adb(['connect', serial], 12000);
  if (r.missing) return { ok: false, error: 'noadb' };
  const o = r.out.toLowerCase();
  if (/unauthorized|failed to authenticate/.test(o)) return { ok: false, error: 'unauthorized', serial, out: r.out };
  if (!/connected to|already connected/.test(o)) return { ok: false, error: 'unreachable', serial, out: r.out };
  // Comprobar que está autorizado (la primera vez la tele pregunta «¿Permitir depuración?»)
  const st = await adb(['-s', serial, 'get-state'], 8000);
  if (/unauthorized/i.test(st.out)) return { ok: false, error: 'unauthorized', serial, out: st.out };
  if (st.code !== 0 || !/device/.test(st.out)) return { ok: false, error: 'unreachable', serial, out: st.out };
  return { ok: true, serial };
}
function amStart(it) {
  if (!it || !DATA_RE.test(it.data || '')) return null;
  const a = ['am', 'start', '-a', it.action && KEY_RE.test(it.action) ? it.action : 'android.intent.action.VIEW', '-d', "'" + it.data + "'"];
  if (it.flags && /^0x[0-9a-fA-F]+$/.test(it.flags)) a.push('-f', it.flags);
  for (const [k, v] of Object.entries(it.extras || {})) if (KEY_RE.test(k) && /^[A-Za-z0-9_.\-]+$/.test(String(v))) a.push('--es', k, String(v));
  if (it.component && PKG_RE.test(it.component) && it.component.includes('/')) a.push('-n', it.component);
  else if (it.pkg && PKG_RE.test(it.pkg)) a.push(it.pkg);
  return a.join(' ');
}
const amOk = out => /Starting:|Status: ok|Activity:/i.test(out) && !/Error|Exception|unable to resolve|does not exist/i.test(out);

async function open(msg) {
  if (!ADDR_RE.test(msg.addr || '')) return { ok: false, error: 'badaddr' };
  const c = await connect(msg.addr);
  if (!c.ok) return c;
  const s = c.serial;
  await adb(['-s', s, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'], 6000);
  const tried = [];
  let pkgList = null;
  const installed = async () => {
    if (!pkgList) { const pm = await adb(['-s', s, 'shell', 'pm', 'list', 'packages'], 15000); pkgList = pm.out.split(/\r?\n/).map(l => l.replace(/^package:/, '').trim()).filter(p => PKG_RE.test(p)); }
    return pkgList;
  };
  const matchRe = src => { try { return new RegExp(String(src).slice(0, 120), 'i'); } catch { return null; } };
  for (let it of (msg.intents || []).slice(0, 6)) {
    if (it && it.pkgMatch) {           // paquete según lo que haya instalado en la tele
      const re = matchRe(it.pkgMatch), pkg = re && (await installed()).find(p => re.test(p));
      if (!pkg) continue;
      it = Object.assign({}, it, { pkg });
    }
    const cmd = amStart(it);
    if (!cmd) continue;
    const r = await adb(['-s', s, 'shell', cmd], 15000);
    tried.push({ cmd, out: r.out.slice(0, 300) });
    if (amOk(r.out)) return { ok: true, how: 'deeplink', serial: s, tried };
  }
  // Sin enlace directo: al menos abrir la app (buscándola por nombre de paquete)
  if (msg.launch) {
    const re = matchRe(msg.launch);
    if (re) {
      const pkgs = (await installed()).filter(p => re.test(p));
      for (const p of pkgs) {
        const r = await adb(['-s', s, 'shell', 'monkey', '-p', p, '-c', 'android.intent.category.LEANBACK_LAUNCHER', '1'], 15000);
        tried.push({ cmd: 'monkey ' + p, out: r.out.slice(0, 300) });
        if (!/No activities found|Error|aborted/i.test(r.out)) return { ok: true, how: 'app', pkg: p, serial: s, tried };
      }
    }
  }
  return { ok: false, error: 'noapp', serial: s, tried };
}

async function handle(msg) {
  switch (msg && msg.op) {
    case 'ping': {
      const r = await adb(['version'], 8000);
      return { ok: true, version: VERSION, adb: r.missing ? null : (r.out.split(/\r?\n/)[0] || 'adb'), adbPath: adbPath() };
    }
    case 'connect':
      if (!ADDR_RE.test(msg.addr || '')) return { ok: false, error: 'badaddr' };
      return connect(msg.addr);
    case 'pair': {
      if (!ADDR_RE.test(msg.addr || '') || !/:\d+$/.test(msg.addr) || !/^\d{6}$/.test(msg.code || '')) return { ok: false, error: 'badaddr' };
      const r = await adb(['pair', msg.addr, msg.code], 20000);
      if (r.missing) return { ok: false, error: 'noadb' };
      return /successfully paired/i.test(r.out) ? { ok: true, out: r.out } : { ok: false, error: 'pairfail', out: r.out };
    }
    case 'disconnect':
      if (!ADDR_RE.test(msg.addr || '')) return { ok: false, error: 'badaddr' };
      await adb(['disconnect', withPort(msg.addr)], 8000);
      return { ok: true };
    case 'open':
      return open(msg);
    default:
      return { ok: false, error: 'badop' };
  }
}

// ---- Native Messaging: 4 bytes (longitud, little-endian) + JSON, en los dos sentidos ----
function send(obj) {
  const b = Buffer.from(JSON.stringify(obj), 'utf8');
  const hdr = Buffer.alloc(4); hdr.writeUInt32LE(b.length, 0);
  process.stdout.write(Buffer.concat([hdr, b]));
}
let buf = Buffer.alloc(0), busy = 0, ended = false;
const maybeExit = () => { if (ended && !busy) setTimeout(() => process.exit(0), 50); };
process.stdin.on('data', chunk => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= 4) {
    const len = buf.readUInt32LE(0);
    if (len > 1024 * 1024) { send({ ok: false, error: 'toolarge' }); process.exit(1); }
    if (buf.length < 4 + len) break;
    const raw = buf.subarray(4, 4 + len).toString('utf8');
    buf = buf.subarray(4 + len);
    let msg; try { msg = JSON.parse(raw); } catch { send({ ok: false, error: 'badjson' }); continue; }
    busy++;
    handle(msg).catch(e => ({ ok: false, error: 'internal', out: String(e && e.message || e) }))
      .then(r => { send(Object.assign({ id: msg && msg.id }, r)); busy--; maybeExit(); });
  }
});
process.stdin.on('end', () => { ended = true; maybeExit(); });
