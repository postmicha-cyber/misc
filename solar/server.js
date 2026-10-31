#!/usr/bin/env node
/* SonnenPilot-Server: regelt den Growatt-NOAH-Speicher nach Wetter und liefert die Handy-App aus.
 * Start:  node server.js          (Einstellungen in .env, siehe .env.example)
 * Ohne Growatt-Zugangsdaten läuft ein simulierter Speicher (zum Ausprobieren).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Core = require('./app/core.js');
const { Growatt } = require('./growatt.js');

const APP_DIR = path.join(__dirname, 'app');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const KEEP_DAYS = 10, WEATHER_MAX_AGE = 30 * 60, INFO_MAX_AGE = 30 * 60;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

// ---------- Simulierter Speicher (wenn keine Zugangsdaten) ----------
class SimDevice {
  constructor(svc) { this.svc = svc; this.sim = null; }
  _sim() {
    if (!this.sim) {
      const s = this.svc.state.settings;
      this.sim = new Core.Sim({ soc: 45, setW: 150, cap: s.capacityWh, t: this.svc.now(), pvFn: t => Core.pvAt(this.svc.state.forecast, t) });
    }
    this.sim.cap = this.svc.state.settings.capacityWh;
    return this.sim;
  }
  async status() { const st = this._sim().advance(this.svc.now()); return Object.assign({}, st); }
  async info() { const m = this._sim(); return { setW: m.setW, socLow: m.socLow, socHigh: m.socHigh, model: 'Simulation', version: '-', batteries: 1, segments: [] }; }
  async setPower(w) { this._sim().setW = w; return w; }
  async setSoc(high, low) { const m = this._sim(); m.socHigh = high; m.socLow = low; return { high, low }; }
}

function createService(o = {}) {
  const env = o.env || process.env;
  const dataDir = o.dataDir || env.DATA_DIR || path.join(__dirname, 'data');
  const fetchFn = o.fetch || globalThis.fetch;
  const now = o.now || (() => Math.floor(Date.now() / 1000));
  const log = o.log || ((...a) => console.log(new Date().toISOString(), ...a));
  const file = path.join(dataDir, 'state.json');
  fs.mkdirSync(dataDir, { recursive: true });

  let state = {};
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { state = {}; }
  state.settings = Core.normalizeSettings(state.settings);
  state.samples = Array.isArray(state.samples) ? state.samples : [];
  state.actions = Array.isArray(state.actions) ? state.actions : [];
  state.days = state.days && typeof state.days === 'object' ? state.days : {}; // Tag → { fcRawWh, learned }
  state.appKey = env.APP_KEY || state.appKey || crypto.randomBytes(9).toString('base64url');

  const svc = {
    state, now, simulated: false, device: null, dev: null, info: null, infoAt: 0,
    lastPlan: null, lastError: '', lastRun: 0, busy: false, dataDir,
    dryRun: env.DRY_RUN === '1', dryLast: ''   // Probelauf: nur lesen, nichts am Speicher ändern
  };

  if (o.device) svc.device = o.device;
  else if (env.GROWATT_USER && (env.GROWATT_PASSWORD || env.GROWATT_PASSWORD_HASH) && env.SIMULATE !== '1') {
    svc.device = new Growatt({ user: env.GROWATT_USER, password: env.GROWATT_PASSWORD, passwordHash: env.GROWATT_PASSWORD_HASH, sn: env.GROWATT_SN, server: env.GROWATT_SERVER, fetch: fetchFn, log });
  } else { svc.device = new SimDevice(svc); svc.simulated = true; }

  let saveTimer = null;
  svc.save = function (immediate) {
    const write = () => {
      saveTimer = null;
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, file);
    };
    if (immediate) { if (saveTimer) clearTimeout(saveTimer); return write(); }
    if (!saveTimer) saveTimer = setTimeout(write, 500);
  };
  svc.act = function (kind, text) {
    state.actions.push({ t: now(), kind, text });
    if (state.actions.length > 400) state.actions.splice(0, state.actions.length - 400);
    log('[' + kind + '] ' + text);
  };

  // ---------- Wetter ----------
  svc.refreshWeather = async function (force) {
    const s = state.settings, fc = state.forecast;
    const key = JSON.stringify([s.lat, s.lon, s.planes, s.pr, s.pvMaxW]);
    if (!force && fc && fc.key === key && now() - fc.at < WEATHER_MAX_AGE) {
      // Vorhersage bleibt, nur die gelernte Korrektur wird neu angewendet
      state.forecast = Object.assign({}, fc, { hours: fc.hours.map(h => Object.assign({}, h, { pv: Math.round(Math.min(s.pvMaxW, h.raw * s.factor)) })) });
      return state.forecast;
    }
    if (env.OFFLINE_WEATHER === '1') {
      state.forecast = Object.assign(Core.demoForecast(now(), s, fc ? fc.off : 3600), { key, demo: true });
      return state.forecast;
    }
    const parts = [];
    for (const p of s.planes) {
      const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + s.lat + '&longitude=' + s.lon +
        '&hourly=global_tilted_irradiance,temperature_2m,cloud_cover,weather_code&tilt=' + p.tilt + '&azimuth=' + p.azimuth +
        '&past_days=1&forecast_days=3&timeformat=unixtime&timezone=auto';
      const r = await fetchFn(u);
      if (!r.ok) throw new Error('Wetterdienst meldet ' + r.status);
      parts.push(Core.parseOpenMeteo(await r.json()));
    }
    state.forecast = Object.assign(Core.buildForecast(parts, s, now()), { key });
    return state.forecast;
  };

  // ---------- Lernen: Vorhersage mit Messung vergleichen ----------
  function learn() {
    const fc = state.forecast; if (!fc || fc.demo) return;
    const off = fc.off, today = Core.localDay(now(), off);
    // Vorhersage (roh) je Tag merken, solange der Tag noch läuft
    for (const d of [today, today + 1]) {
      const a = d * Core.DAY - off;
      const e = state.days[d] || {};
      e.fcRawWh = Math.round(Core.energyBetween(fc, a, a + Core.DAY, 'raw'));
      state.days[d] = e;
    }
    // Abgeschlossene Tage auswerten
    const stats = Core.dayStats(state.samples, off);
    for (const st of stats) {
      const e = state.days[st.day];
      if (!e || e.learned || st.day >= today || st.n < 150) continue;
      const before = state.settings.factor;
      state.settings.factor = Core.learnFactor(before, st.pvWh, e.fcRawWh, st.socMax >= state.settings.socMax - 2);
      e.learned = true; e.pvWh = st.pvWh;
      if (state.settings.factor !== before) svc.act('lernen', 'Vorhersage-Korrektur ' + before.toFixed(2) + ' → ' + state.settings.factor.toFixed(2) + ' (gemessen ' + (st.pvWh / 1000).toFixed(2) + ' kWh, vorhergesagt ' + (e.fcRawWh / 1000).toFixed(2) + ' kWh)');
    }
    Object.keys(state.days).forEach(d => { if (+d < today - KEEP_DAYS) delete state.days[d]; });
  }

  // ---------- Stromzähler (optional, Shelly) ----------
  svc.readMeter = async function () {
    const url = state.settings.meterUrl; if (!url) return null;
    const get = async p => { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000); try { const r = await fetchFn(url + p, { signal: ctl.signal }); return r.ok ? r.json() : null; } catch (e) { return null; } finally { clearTimeout(t); } };
    let j = await get('/rpc/EM.GetStatus?id=0'); if (j && j.total_act_power != null) return Core.num(j.total_act_power);
    j = await get('/rpc/EM1.GetStatus?id=0'); if (j && j.act_power != null) return Core.num(j.act_power);
    j = await get('/status'); if (j && j.total_power != null) return Core.num(j.total_power);
    if (j && Array.isArray(j.emeters)) return j.emeters.reduce((a, e) => a + Core.num(e.power), 0);
    throw new Error('Stromzähler unter ' + url + ' nicht lesbar');
  };

  // ---------- Ein Regeldurchlauf ----------
  svc.tick = async function (opts = {}) {
    if (svc.busy) return svc.snapshot();
    svc.busy = true;
    const errs = [];
    try {
      try { await svc.refreshWeather(opts.forceWeather); } catch (e) { errs.push('Wetter: ' + e.message); }
      let dev;
      try { dev = await svc.device.status(); } catch (e) { errs.push('Speicher: ' + e.message); }
      if (dev && (!svc.info || now() - svc.infoAt > INFO_MAX_AGE || opts.forceInfo)) {
        try { svc.info = await svc.device.info(); svc.infoAt = now(); } catch (e) { errs.push('Geräteinfo: ' + e.message); }
      }
      let gridW = null;
      try { gridW = await svc.readMeter(); } catch (e) { errs.push(e.message); }
      if (dev) {
        dev = Object.assign({}, dev, { setW: svc.info ? svc.info.setW : dev.setW, socLow: svc.info ? svc.info.socLow : dev.socLow, socHigh: svc.info ? svc.info.socHigh : dev.socHigh });
        // Akkugröße aus der Anzahl der Akkus ableiten, solange nichts Eigenes eingetragen ist
        const nb = (svc.info && svc.info.batteries) || dev.batteries;
        if (nb && !state.capacityManual && !svc.simulated) state.settings.capacityWh = nb * 2048;
        const s = state.settings;
        if (s.boost && s.boost.until <= now()) { s.boost = null; svc.act('boost', 'Boost beendet'); }
        const houseW = gridW == null ? null : Math.max(0, gridW + Core.num(dev.pac));
        const p = Core.plan({ now: now(), soc: dev.soc, pvNow: dev.online ? dev.ppv : null, houseW, fc: state.forecast, s });
        p.houseW = houseW; p.gridW = gridW;
        svc.lastPlan = p;
        if (dev.online && svc.dryRun) {
          const ch = Core.needsUpdate(dev, p, s);
          const parts = [];
          if (ch.power != null) parts.push('Leistung ' + (dev.setW == null ? '?' : dev.setW) + ' → ' + ch.power + ' W');
          if (ch.soc) parts.push('Akkugrenzen ' + ch.soc.low + '–' + ch.soc.high + ' %');
          const msg = parts.length ? 'würde setzen: ' + parts.join(', ') + ' · ' + p.reason : '';
          if (msg && msg !== svc.dryLast) svc.act('probelauf', msg);
          svc.dryLast = msg;
        } else if (dev.online) {
          const ch = Core.needsUpdate(dev, p, s, opts.forcePower ? 0 : svc.setAt, now());
          if (ch.power != null) {
            try { await svc.device.setPower(ch.power); svc.setAt = now(); svc.act('leistung', (dev.setW == null ? '?' : dev.setW) + ' → ' + ch.power + ' W · ' + p.reason); if (svc.info) svc.info.setW = ch.power; dev.setW = ch.power; }
            catch (e) { errs.push('Leistung setzen: ' + e.message); }
          }
          if (ch.soc) {
            try { await svc.device.setSoc(ch.soc.high, ch.soc.low); svc.act('akku', 'Akkugrenzen ' + ch.soc.low + '–' + ch.soc.high + ' %' + (p.info.dark ? ' (Dunkelflaute-Reserve)' : '')); if (svc.info) { svc.info.socLow = ch.soc.low; svc.info.socHigh = ch.soc.high; } dev.socLow = ch.soc.low; dev.socHigh = ch.soc.high; }
            catch (e) { errs.push('Akkugrenzen setzen: ' + e.message); }
          }
        }
        state.samples.push({ t: now(), soc: dev.soc, ppv: dev.ppv, pac: dev.pac, chargeW: dev.chargeW, dischargeW: dev.dischargeW, setW: dev.setW, houseW, on: dev.online ? 1 : 0 });
        const cut = now() - KEEP_DAYS * Core.DAY;
        while (state.samples.length && state.samples[0].t < cut) state.samples.shift();
        svc.dev = dev;
        learn();
      }
      svc.lastError = errs.join(' · ');
      if (errs.length) log('Fehler: ' + svc.lastError);
      svc.lastRun = now();
      svc.save();
    } finally { svc.busy = false; }
    return svc.snapshot();
  };

  svc.snapshot = function (o2 = {}) {
    const s = state.settings, fc = state.forecast, t = now();
    const proj = svc.dev ? Core.project({ now: t, soc: svc.dev.soc, fc, s }, 30, 15) : [];
    const off = fc ? fc.off : 0;
    const daySum = a => fc ? Math.round(Core.energyBetween(fc, a, a + Core.DAY)) : null;
    const d0 = Core.dayStartT(t, off);
    const since = o2.since != null ? Core.num(o2.since) : t - 36 * 3600;
    return {
      now: t, simulated: svc.simulated, dryRun: svc.dryRun, settings: s, device: svc.dev, info: svc.info, plan: svc.lastPlan,
      error: svc.lastError, lastRun: svc.lastRun, forecast: fc ? { off: fc.off, tz: fc.tz, at: fc.at, demo: !!fc.demo, hours: fc.hours.filter(h => h.t >= since - 3600 && h.t < t + 50 * 3600) } : null,
      forecastToday: daySum(d0), forecastRest: fc ? Math.round(Core.energyBetween(fc, t, d0 + Core.DAY)) : null, forecastTomorrow: daySum(d0 + Core.DAY),
      projection: proj, samples: state.samples.filter(x => x.t >= since), actions: state.actions.slice(-60).reverse(),
      days: Core.dayStats(state.samples, off).slice(-8), capacityManual: !!state.capacityManual
    };
  };

  svc.updateSettings = function (patch) {
    const before = JSON.stringify(state.settings);
    const p = Object.assign({}, patch);
    delete p.factor; delete p.boost;
    if ('capacityWh' in p) state.capacityManual = true;
    if (p.capacityAuto) { state.capacityManual = false; }
    state.settings = Core.normalizeSettings(Object.assign({}, state.settings, p));
    if (JSON.stringify(state.settings) !== before) svc.act('einstellung', 'Einstellungen geändert');
    svc.save();
    return state.settings;
  };
  svc.setBoost = function (w, minutes) {
    const s = state.settings;
    if (!(minutes > 0)) { s.boost = null; svc.act('boost', 'Boost beendet'); }
    else { s.boost = { w: Core.clamp(Core.num(w), 0, s.maxOutW), until: now() + Math.round(Core.clamp(minutes, 5, 720) * 60) }; svc.act('boost', 'Boost ' + s.boost.w + ' W für ' + Math.round(minutes) + ' min'); }
    state.settings = Core.normalizeSettings(s);
    svc.save();
  };
  svc.resetFactor = function () { state.settings.factor = 1; Object.values(state.days).forEach(d => { d.learned = true; }); svc.act('lernen', 'Vorhersage-Korrektur zurückgesetzt'); svc.save(); };

  return svc;
}

// ---------- HTTP ----------
function createServer(svc) {
  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const body = req => new Promise((resolve, reject) => {
    let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) { reject(new Error('zu groß')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(new Error('Ungültige Daten')); } });
  });
  const keyOk = req => {
    const k = String(req.headers['x-app-key'] || '');
    const a = Buffer.from(k), b = Buffer.from(svc.state.appKey);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/hello') return json(res, 200, { app: 'SonnenPilot', simulated: svc.simulated });
        if (!keyOk(req)) return json(res, 401, { error: 'Zugangsschlüssel fehlt oder falsch' });
        if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, svc.snapshot({ since: url.searchParams.get('since') }));
        if (req.method === 'POST') {
          const b = await body(req);
          if (url.pathname === '/api/settings') { svc.updateSettings(b); await svc.tick({ forceWeather: true, forcePower: true }); return json(res, 200, svc.snapshot()); }
          if (url.pathname === '/api/mode') { svc.updateSettings({ mode: b.mode, manualW: b.manualW != null ? b.manualW : svc.state.settings.manualW }); if (b.mode) svc.act('modus', 'Modus: ' + b.mode); await svc.tick({ forcePower: true }); return json(res, 200, svc.snapshot()); }
          if (url.pathname === '/api/boost') { svc.setBoost(b.w, b.minutes); await svc.tick({ forcePower: true }); return json(res, 200, svc.snapshot()); }
          if (url.pathname === '/api/refresh') { await svc.tick({ forceWeather: true, forceInfo: true }); return json(res, 200, svc.snapshot()); }
          if (url.pathname === '/api/reset-learning') { svc.resetFactor(); await svc.tick(); return json(res, 200, svc.snapshot()); }
        }
        return json(res, 404, { error: 'Unbekannt' });
      }
      let p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const f = path.join(APP_DIR, path.normalize(p));
      if (!f.startsWith(APP_DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Nicht gefunden'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      fs.createReadStream(f).pipe(res);
    } catch (e) { json(res, 500, { error: e.message }); }
  });
}

function main() {
  loadEnvFile(path.join(__dirname, '.env'));
  const svc = createService();
  const port = Number(process.env.PORT || 8787);
  const tick = Math.max(60, Number(process.env.TICK_SECONDS || (svc.state.settings.meterUrl ? 120 : 300)));
  createServer(svc).listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log('☀️  SonnenPilot läuft auf Port ' + port + (svc.simulated ? ' (SIMULATION – keine Growatt-Zugangsdaten)' : '') + (svc.dryRun ? ' (PROBELAUF – Speicher wird nur gelesen, nichts verändert)' : ''));
    console.log('📱 Im Browser öffnen: http://localhost:' + port);
    console.log('🔑 Zugangsschlüssel für die App: ' + svc.state.appKey);
  });
  svc.save(true);
  const loop = () => svc.tick().catch(e => console.error(e));
  loop(); setInterval(loop, tick * 1000);
}

if (require.main === module) main();
module.exports = { createService, createServer, SimDevice, loadEnvFile };
