// Tests Growatt-Anbindung und SonnenPilot-Server mit nachgebauter Growatt-Cloud und nachgebautem Wetterdienst.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Growatt } = require('../../solar/growatt.js');
const { createService, createServer } = require('../../solar/server.js');
const { at, openMeteo, fakeGrowatt, OFF } = require('./helpers.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sonnenpilot-'));
const quiet = () => {};

// Wetter + Growatt + optional Shelly hinter einem fetch
function world(o = {}) {
  const g = fakeGrowatt(o.growatt);
  const weatherCalls = [];
  const fetch = async (url, init) => {
    if (url.startsWith('https://api.open-meteo.com/')) {
      weatherCalls.push(url);
      return { ok: true, status: 200, json: async () => openMeteo(o.days || [600, 600, 600, 600]) };
    }
    if (o.meter && url.startsWith('http://shelly.local')) {
      if (url.includes('/rpc/EM.GetStatus')) return { ok: true, json: async () => ({ total_act_power: o.meter }) };
      return { ok: false, json: async () => ({}) };
    }
    return g.fetch(url, init);
  };
  return { g, fetch, weatherCalls };
}
function service(w, o = {}) {
  let t = o.t || at(22);
  const svc = createService({ env: Object.assign({ GROWATT_USER: 'nutzer', GROWATT_PASSWORD: 'test', APP_KEY: 'schluessel' }, o.env || {}), dataDir: o.dir || tmp(), fetch: w.fetch, now: () => t, log: quiet });
  svc.setNow = v => { t = v; };
  return svc;
}

test('S20 Growatt: Anmeldung, Gerätesuche, Status, Befehle und erneute Anmeldung bei abgelaufener Sitzung', async () => {
  const g = fakeGrowatt();
  const c = new Growatt({ user: 'nutzer', password: 'test', fetch: g.fetch, log: quiet });
  const st = await c.status();
  assert.equal(c.sn, 'NOAH12345', 'Gerät im zweiten Anlagenpark gefunden');
  assert.deepEqual([st.soc, st.ppv, st.pac, st.online, st.sn], [60, 250, 180, true, 'NOAH12345']);
  const login = g.calls.find(x => x.path === '/newTwoLoginAPIV2.do');
  assert.equal(login.form.password, 'c98f6bcd4621d373cade4e832627b4f6', 'nur Hash, nie Klartext');
  assert.ok(!g.calls.some(x => JSON.stringify(x.form).includes('"test"')), 'Klartext-Passwort nie gesendet');
  assert.equal(g.calls.find(x => x.path.includes('getSystemStatus')).headers.Authorization, 'Bearer tok123');
  const info = await c.info();
  assert.deepEqual([info.setW, info.socHigh, info.socLow, info.batteries, info.model], [180, 100, 10, 2, 'NOAH 2000']);
  assert.equal(await c.setPower(950), 800, 'auf 800 W begrenzt');
  assert.equal(g.st.defaultPower, 800);
  const set = g.calls.filter(x => x.path === '/noahDeviceApi/noah/set').pop();
  assert.deepEqual(set.form, { serialNum: 'NOAH12345', type: 'default_power', param1: '800' });
  assert.deepEqual(await c.setSoc(60, 50), { high: 70, low: 30 }, 'Gerätegrenzen');
  assert.deepEqual([g.st.high, g.st.low], [70, 30]);
  // Sitzung läuft ab → automatisch neu anmelden
  g.st.sessionValid = false;
  const n = g.calls.filter(x => x.path === '/newTwoLoginAPIV2.do').length;
  await c.status();
  assert.equal(g.calls.filter(x => x.path === '/newTwoLoginAPIV2.do').length, n + 1);
  // Abgelehnter Befehl wird gemeldet
  g.st.setResult = 0;
  await assert.rejects(c.setPower(100), /abgelehnt: Gerät antwortet nicht/);
});

test('S21 Growatt: falsches Passwort gibt verständlichen Fehler', async () => {
  const g = fakeGrowatt();
  const c = new Growatt({ user: 'nutzer', password: 'falsch', fetch: g.fetch, log: quiet });
  await assert.rejects(c.status(), /Anmeldung bei Growatt fehlgeschlagen: Passwort falsch/);
});

test('S22 Regeldurchlauf: Wetter holen, Speicher lesen, Leistung und Grenzen setzen, protokollieren, speichern', async () => {
  const w = world({ growatt: { soc: 95, ppv: 0, pac: 180, defaultPower: 300, high: 100, low: 10 } });
  const dir = tmp();
  const svc = service(w, { dir });
  const snap = await svc.tick();
  assert.equal(snap.error, '');
  assert.equal(w.weatherCalls.length, 1);
  assert.match(w.weatherCalls[0], /latitude=51\.16&longitude=10\.45.*tilt=35&azimuth=0.*timeformat=unixtime/);
  assert.equal(snap.plan.phase, 'battery');
  assert.equal(w.g.st.defaultPower, 120, 'Nachtlast gesetzt');
  assert.equal(snap.device.setW, 120);
  assert.equal(snap.settings.capacityWh, 4096, '2 Akkus erkannt');
  assert.ok(snap.actions.some(a => a.kind === 'leistung' && /300 → 120 W/.test(a.text)));
  assert.ok(snap.projection.length > 100);
  assert.ok(snap.forecastTomorrow > 0);
  svc.save(true);
  const saved = fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
  assert.ok(!/GROWATT|c98f6bcd/.test(saved), 'keine Zugangsdaten gespeichert');
  // Zweiter Lauf kurz danach: Wetter aus dem Zwischenspeicher, nichts Neues gesetzt
  svc.setNow(at(22) + 300);
  const before = w.g.calls.filter(x => x.path === '/noahDeviceApi/noah/set').length;
  await svc.tick();
  assert.equal(w.weatherCalls.length, 1);
  assert.equal(w.g.calls.filter(x => x.path === '/noahDeviceApi/noah/set').length, before);
  // Neustart: Stand wird geladen
  svc.save(true);
  const svc2 = service(w, { dir });
  assert.equal(svc2.state.samples.length, 2); assert.ok(svc2.state.actions.length >= 1);
});

test('S23 Störungen: Wetterdienst oder Growatt nicht erreichbar → Fehler sichtbar, Server läuft weiter', async () => {
  const w = world();
  const svc = service(w);
  const orig = w.fetch;
  svc.state.settings.lat = 50; // erzwingt neues Wetter
  const bad = async (url, init) => url.includes('open-meteo') ? { ok: false, status: 503 } : orig(url, init);
  const svcBad = createService({ env: { GROWATT_USER: 'nutzer', GROWATT_PASSWORD: 'test', APP_KEY: 'k' }, dataDir: tmp(), fetch: bad, now: () => at(12), log: quiet });
  const s1 = await svcBad.tick();
  assert.match(s1.error, /Wetter: Wetterdienst meldet 503/);
  assert.ok(s1.device, 'Speicher trotzdem gelesen');
  const down = async () => { throw new Error('ECONNREFUSED'); };
  const svcDown = createService({ env: { GROWATT_USER: 'nutzer', GROWATT_PASSWORD: 'test', APP_KEY: 'k', OFFLINE_WEATHER: '1' }, dataDir: tmp(), fetch: down, now: () => at(12), log: quiet });
  const s2 = await svcDown.tick();
  assert.match(s2.error, /Speicher: Growatt nicht erreichbar/);
  assert.equal(s2.device, null);
  assert.ok(svc);
});

test('S24 Stromzähler: Hausverbrauch = Netzbezug + Abgabe des Speichers, Automatik folgt dem echten Verbrauch', async () => {
  const w = world({ meter: 250, growatt: { soc: 90, ppv: 0, pac: 120, defaultPower: 120 } });
  const svc = service(w);
  svc.updateSettings({ meterUrl: 'http://shelly.local' });
  const snap = await svc.tick();
  assert.equal(snap.plan.houseW, 370); assert.equal(snap.plan.gridW, 250);
  assert.equal(w.g.st.defaultPower, 370);
});

test('S25 Lernen: nach einem vollen Tag wird die Vorhersage-Korrektur angepasst', async () => {
  const w = world({ growatt: { soc: 30, ppv: 0, pac: 0, high: 100, low: 10 } });
  const svc = service(w, { t: at(0) });
  await svc.tick();
  const fcRaw = svc.state.days[Object.keys(svc.state.days)[0]].fcRawWh;
  assert.ok(fcRaw > 300);
  // Tag lang messen: Sonne liefert 70 % der Vorhersage, Akku nie voll
  for (let t = at(0) + 300; t < at(24) + 600; t += 300) {
    svc.setNow(t);
    const pv = require('../../solar/app/core.js').pvAt(svc.state.forecast, t);
    w.g.st.ppv = Math.round(pv / svc.state.settings.factor * 0.7);
    w.g.st.soc = 40;
    await svc.tick();
  }
  assert.ok(svc.state.settings.factor < 1 && svc.state.settings.factor > 0.9, 'Korrektur ' + svc.state.settings.factor);
  assert.ok(svc.state.actions.some(a => a.kind === 'lernen'));
  svc.resetFactor();
  assert.equal(svc.state.settings.factor, 1);
});

test('S26 Ohne Zugangsdaten: simulierter Speicher, Beispielwetter, Regelung funktioniert', async () => {
  const svc = createService({ env: { OFFLINE_WEATHER: '1' }, dataDir: tmp(), now: () => at(12), log: quiet, fetch: async () => { throw new Error('kein Netz'); } });
  assert.equal(svc.simulated, true);
  assert.ok(svc.state.appKey.length >= 10, 'Schlüssel erzeugt');
  const s = await svc.tick();
  assert.equal(s.error, ''); assert.ok(s.device.online); assert.ok(s.plan);
});

// ---------- HTTP ----------
async function withServer(svc, fn) {
  const srv = createServer(svc);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  try { await fn(base); } finally { srv.close(); }
}

test('S27 HTTP: Schlüssel nötig, App wird ausgeliefert, kein Zugriff außerhalb des App-Ordners', async () => {
  const w = world();
  const svc = service(w);
  await svc.tick();
  await withServer(svc, async base => {
    assert.equal((await fetch(base + '/api/hello')).status, 200);
    assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal((await fetch(base + '/api/state', { headers: { 'x-app-key': 'falsch' } })).status, 401);
    const r = await fetch(base + '/api/state', { headers: { 'x-app-key': 'schluessel' } });
    assert.equal(r.status, 200); const j = await r.json();
    assert.equal(j.device.sn, 'NOAH12345'); assert.ok(!JSON.stringify(j).includes('schluessel'), 'Schlüssel nicht in Antwort');
    const html = await fetch(base + '/'); assert.equal(html.status, 200); assert.match(await html.text(), /SonnenPilot/);
    assert.equal((await fetch(base + '/core.js')).status, 200);
    assert.equal((await fetch(base + '/..%2fserver.js')).status, 404);
    assert.equal((await fetch(base + '/../growatt.js')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e/.env')).status, 404);
  });
});

test('S28 HTTP: Einstellungen, Modus und Boost wirken sofort auf den Speicher', async () => {
  const w = world({ growatt: { soc: 80, ppv: 0, pac: 120, defaultPower: 120 } });
  const svc = service(w);
  await svc.tick();
  await withServer(svc, async base => {
    const post = async (p, b) => { const r = await fetch(base + '/api/' + p, { method: 'POST', headers: { 'x-app-key': 'schluessel', 'content-type': 'application/json' }, body: JSON.stringify(b) }); assert.equal(r.status, 200, p); return r.json(); };
    let j = await post('settings', { loadNightW: 200, factor: 3, hacker: 1, planes: [{ name: 'Süd', kwp: 0.9, tilt: 60, azimuth: 0 }, { name: 'West', kwp: 0.9, tilt: 30, azimuth: 90 }] });
    assert.equal(j.settings.loadNightW, 200); assert.equal(j.settings.factor, 1, 'Korrektur nicht von außen setzbar'); assert.equal(j.settings.hacker, undefined);
    assert.equal(w.g.st.defaultPower, 200);
    assert.equal(w.weatherCalls.filter(u => u.includes('azimuth=90')).length, 1, 'zweite Fläche abgefragt');
    j = await post('mode', { mode: 'off' }); assert.equal(w.g.st.defaultPower, 0); assert.equal(j.plan.phase, 'off');
    j = await post('mode', { mode: 'manual', manualW: 350 }); assert.equal(w.g.st.defaultPower, 350);
    j = await post('mode', { mode: 'auto' });
    j = await post('boost', { w: 600, minutes: 60 }); assert.equal(w.g.st.defaultPower, 600); assert.equal(j.plan.phase, 'boost');
    svc.setNow(at(23) + 60);
    await svc.tick(); assert.equal(svc.state.settings.boost, null, 'Boost endet von selbst'); assert.equal(w.g.st.defaultPower, 200);
    j = await post('boost', { w: 600, minutes: 60 }); j = await post('boost', { minutes: 0 }); assert.equal(j.settings.boost, null);
    const bad = await fetch(base + '/api/settings', { method: 'POST', headers: { 'x-app-key': 'schluessel' }, body: '{kaputt' });
    assert.equal(bad.status, 500);
  });
});

test('S29 Installationsskript: gültiges Bash, nur Passwort-Hash in der .env, Sonderzeichen geschützt', () => {
  const { execFileSync } = require('child_process');
  const script = path.join(__dirname, '../../solar/install-pi.sh');
  execFileSync('bash', ['-n', script]);
  const src = fs.readFileSync(script, 'utf8');
  // Den .env-Teil des Skripts mit Testwerten nachspielen
  const dir = tmp();
  fs.copyFileSync(path.join(__dirname, '../../solar/.env.example'), path.join(dir, '.env'));
  const block = src.split('\n').filter(l => /^\s*(GH=|KEY=|GU=\$\(printf|sed -i)/.test(l)).map(l => l.replace('"$APP/.env"', '"$DIR/.env"').replace('cd "$APP"', 'cd "$SOLAR"')).join('\n');
  execFileSync('bash', ['-c', 'set -e\n' + block], { env: Object.assign({}, process.env, { GU: 'a&b|c@x.de', GP: 'test', DIR: dir, SOLAR: path.join(__dirname, '../../solar') }) });
  const env = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  assert.match(env, /^GROWATT_USER=a&b\|c@x\.de$/m);
  assert.match(env, /^GROWATT_PASSWORD=$/m);
  assert.match(env, /^GROWATT_PASSWORD_HASH=c98f6bcd4621d373cade4e832627b4f6$/m);
  assert.match(env, /^APP_KEY=[A-Za-z0-9_-]{12}$/m);
  assert.ok(!/=test$/m.test(env), 'kein Klartext-Passwort');
});

test('S30 Probelauf: echter Speicher wird nur gelesen, geplante Änderungen erscheinen einmal im Protokoll', async () => {
  const w = world({ growatt: { soc: 95, ppv: 0, pac: 300, defaultPower: 300, high: 100, low: 10 } });
  const svc = service(w, { env: { DRY_RUN: '1' } });
  let snap = await svc.tick();
  assert.equal(snap.dryRun, true);
  assert.equal(w.g.calls.filter(x => x.path === '/noahDeviceApi/noah/set').length, 0, 'kein Befehl an den Speicher');
  assert.equal(w.g.st.defaultPower, 300);
  assert.equal(snap.plan.power, 120, 'Plan wird trotzdem berechnet');
  const dry = snap.actions.filter(a => a.kind === 'probelauf');
  assert.equal(dry.length, 1); assert.match(dry[0].text, /würde setzen: Leistung 300 → 120 W/);
  svc.setNow(at(22) + 300);
  snap = await svc.tick();
  assert.equal(snap.actions.filter(a => a.kind === 'probelauf').length, 1, 'nicht bei jedem Durchlauf wiederholt');
  await withServer(svc, async base => {
    const r = await fetch(base + '/api/mode', { method: 'POST', headers: { 'x-app-key': 'schluessel' }, body: JSON.stringify({ mode: 'off' }) });
    assert.equal(r.status, 200);
  });
  assert.equal(w.g.calls.filter(x => x.path === '/noahDeviceApi/noah/set').length, 0, 'auch Bedienung ändert im Probelauf nichts');
});
