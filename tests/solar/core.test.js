// Unit-Tests SonnenPilot-Kernlogik. Nummern siehe tests/solar/TESTFAELLE.md
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../solar/app/core.js');
const G = require('../../solar/growatt.js');
const { at, openMeteo, OFF, H, DAY } = require('./helpers.js');

const S = (o = {}) => C.normalizeSettings(Object.assign({ planes: [{ kwp: 1, tilt: 35, azimuth: 0 }], pr: 1, capacityWh: 2000, loadDayW: 200, loadNightW: 150, socMin: 10, reserveOnDarkness: false }, o));
const FC = (days, s = S(), opt) => C.buildForecast([C.parseOpenMeteo(openMeteo(days, opt))], s, at(0));

test('S01 Einstellungen: Unsinn wird repariert, Grenzen eingehalten, fremde Felder entfernt', () => {
  const s = C.normalizeSettings({ lat: 'abc', maxOutW: 5000, socMin: 80, socMax: 20, planes: 'x', mode: 'turbo', boost: { w: 'x' }, hacker: 1, meterUrl: 'javascript:alert(1)', dayStart: 20, dayEnd: 5 });
  assert.equal(s.lat, C.DEFAULTS.lat); assert.equal(s.maxOutW, 2000); assert.equal(s.socMin, 30); assert.equal(s.socMax, 70);
  assert.equal(s.mode, 'auto'); assert.equal(s.boost, null); assert.equal(s.hacker, undefined); assert.equal(s.meterUrl, '');
  assert.equal(s.planes.length, 1); assert.ok(s.dayEnd > s.dayStart);
  assert.deepEqual(C.normalizeSettings(s), s, 'idempotent');
  assert.equal(C.normalizeSettings({ meterUrl: 'http://192.168.1.5/' }).meterUrl, 'http://192.168.1.5');
  assert.equal(C.normalizeSettings(null).mode, 'auto');
});

test('S02 Wetter: Stundenwert gilt für die Stunde davor, Flächen addiert, Wirkungsgrad, Korrektur und Obergrenze', () => {
  const raw = openMeteo([600, 600, 600]);
  const p = C.parseOpenMeteo(raw);
  assert.equal(p.off, OFF); assert.equal(p.rows[0].t, raw.hourly.time[0] - H);
  assert.throws(() => C.parseOpenMeteo({}), /unvollständig/);
  const s = S({ planes: [{ kwp: 0.5, tilt: 35, azimuth: 0 }, { kwp: 0.5, tilt: 35, azimuth: 90 }], pr: 0.8, factor: 1.2, pvMaxW: 500 });
  const fc = C.buildForecast([p, p], s, 1);
  const noon = fc.hours.find(h => h.t === at(12));
  const gti = raw.hourly.global_tilted_irradiance[raw.hourly.time.indexOf(at(13))];
  assert.equal(noon.raw, Math.round(Math.min(500, gti * 0.8)));
  assert.equal(noon.pv, Math.min(500, Math.round(noon.raw * 1.2)));
  assert.ok(fc.hours.every(h => h.pv <= 500));
  assert.equal(C.pvAt(fc, at(12) + 1800), noon.pv);
  assert.equal(C.pvAt(fc, at(2)), 0);
  const e = C.energyBetween(fc, at(0), at(24));
  assert.ok(e > 1000 && e < 5000, 'Tagesenergie plausibel: ' + e);
});

test('S03 Sonnenphase: Grundlast decken, Rest lädt Akku', () => {
  const s = S(), fc = FC([400, 400, 400, 400], s);
  const p = C.plan({ now: at(11), soc: 20, fc, s });
  assert.equal(p.phase, 'sun'); assert.equal(p.power, 200);
  assert.match(p.reason, /lädt den Akku/);
});

test('S04 Überschuss verteilen: Akku wird sicher voll → mehr ins Haus, aber nie mehr als die Sonne', () => {
  const s = S({ capacityWh: 1000 }), fc = FC([900, 900, 900, 900], s);
  const p = C.plan({ now: at(10), soc: 70, fc, s });
  assert.equal(p.phase, 'spread'); assert.ok(p.power > 200, 'mehr als Grundlast'); assert.ok(p.power <= C.pvAt(fc, at(10)) + 10);
  const off = C.plan({ now: at(10), soc: 70, fc, s: S({ capacityWh: 1000, spreadSurplus: false }) });
  assert.equal(off.phase, 'sun'); assert.equal(off.power, 200);
});

test('S05 Akku voll: Sonnenstrom direkt ins Haus, auch wenn die Messung abgeregelt ist', () => {
  const s = S(), fc = FC([700, 700, 700, 700], s);
  const p = C.plan({ now: at(12), soc: 100, pvNow: 210, fc, s });
  assert.equal(p.phase, 'full');
  assert.equal(p.power, Math.min(800, Math.round(C.pvAt(fc, at(12)) / 10) * 10));
});

test('S06 Nacht: Akku reicht → Grundlast; reicht nicht → gestreckt, aber nicht unter Mindest-Akkuleistung', () => {
  const s = S(), fc = FC([600, 600, 600, 600], s);
  const full = C.plan({ now: at(22), soc: 90, fc, s: S({ capacityWh: 3000 }) });
  assert.equal(full.phase, 'battery'); assert.equal(full.power, 150); assert.match(full.reason, /bis zur Sonne um 0?9:00/);
  const low = C.plan({ now: at(22), soc: 30, fc, s });
  assert.equal(low.phase, 'stretch'); assert.ok(low.power < 150 && low.power >= 40, 'gestreckt: ' + low.power);
  // Schlechtes Wetter morgen → weniger Leistung als bei Sonne morgen
  const dull = FC([600, 150, 150, 150], s);
  const pd = C.plan({ now: at(22), soc: 60, fc: dull, s }), ps = C.plan({ now: at(22), soc: 60, fc, s });
  assert.ok(pd.power < ps.power, 'trüb ' + pd.power + ' < sonnig ' + ps.power);
});

test('S07 Akkugrenzen: Untergrenze → nur Sonne; Dunkelflaute hebt Reserve; Schonung senkt Obergrenze', () => {
  const s = S(), fc = FC([600, 600, 600, 600], s);
  const e = C.plan({ now: at(22), soc: 10, fc, s });
  assert.equal(e.phase, 'empty'); assert.equal(e.power, 0);
  const dark = FC([50, 50, 50, 50], s);
  const d = C.plan({ now: at(12), soc: 50, fc: dark, s: S({ reserveOnDarkness: true, reserveSoc: 25 }) });
  assert.equal(d.socLow, 25); assert.equal(d.info.dark, true);
  const g = C.plan({ now: at(20), soc: 50, fc: FC([1000, 1000, 1000, 1000], s), s: S({ gentle: true, gentleSoc: 90, capacityWh: 1000 }) });
  assert.equal(g.socHigh, 90);
  const noG = C.plan({ now: at(20), soc: 50, fc: FC([300, 300, 300, 300], s), s: S({ gentle: true, gentleSoc: 90, capacityWh: 1000 }) });
  assert.equal(noG.socHigh, 100);
});

test('S08 Boost, feste Leistung und Pause gehen vor; Obergrenze wird eingehalten', () => {
  const fc = FC([600, 600, 600, 600]);
  assert.equal(C.plan({ now: at(20), soc: 50, fc, s: S({ boost: { w: 600, until: at(21) } }) }).power, 600);
  assert.notEqual(C.plan({ now: at(22), soc: 50, fc, s: S({ boost: { w: 600, until: at(21) } }) }).phase, 'boost', 'Boost abgelaufen');
  assert.equal(C.plan({ now: at(20), soc: 50, fc, s: S({ mode: 'manual', manualW: 1500, maxOutW: 800 }) }).power, 800);
  const off = C.plan({ now: at(12), soc: 50, fc, s: S({ mode: 'off' }) });
  assert.equal(off.power, 0); assert.equal(off.phase, 'off');
  assert.equal(C.plan({ now: at(12), soc: 50, fc: null, s: S() }).phase, 'nofc');
});

test('S09 Vorschau: Akku bleibt in seinen Grenzen, sonnige Tage versorgen die Nacht', () => {
  const s = S({ capacityWh: 3000 }), fc = FC([900, 900, 900, 900], s);
  const pr = C.project({ now: at(6), soc: 30, fc, s }, 48, 15);
  assert.equal(pr.length, 48 * 4);
  assert.ok(pr.every(p => p.soc >= 10 - 0.01 && p.soc <= 100.01));
  assert.ok(pr.every(p => p.power <= 800 && p.power >= 0));
  const night = pr.filter(p => C.localHour(p.t, OFF) >= 23 || C.localHour(p.t, OFF) < 6);
  assert.ok(night.every(p => p.power >= 140), 'Nachts Grundlast gedeckt');
});

test('S10 Änderungen an den Speicher: Mindeständerung, Ruhezeit bei kleinen Schritten, große sofort', () => {
  const s = S({ step: 20 });
  const p = (power, phase = 'battery') => ({ power, phase, socLow: 10, socHigh: 100 });
  const dev = { setW: 150, socLow: 10, socHigh: 100 };
  assert.deepEqual(C.needsUpdate(dev, p(160), s), {});
  assert.equal(C.needsUpdate(dev, p(180), s).power, 180);
  assert.deepEqual(C.needsUpdate(dev, p(180), s, 1000, 1000 + 120), {}, 'Ruhezeit');
  assert.equal(C.needsUpdate(dev, p(180), s, 1000, 1000 + C.MIN_GAP).power, 180);
  assert.equal(C.needsUpdate(dev, p(400), s, 1000, 1001).power, 400, 'große Änderung sofort');
  assert.equal(C.needsUpdate(dev, p(0, 'off'), s, 1000, 1001).power, 0, 'Pause sofort');
  assert.deepEqual(C.needsUpdate(dev, { power: 150, socLow: 20, socHigh: 100 }, s).soc, { low: 20, high: 100 });
  assert.equal(C.needsUpdate({ setW: null }, p(150), s).power, 150);
});

test('S11 Lernen: Korrektur folgt der Messung sanft, volle Tage zählen nicht', () => {
  assert.equal(C.learnFactor(1, 800, 1000, false), 0.96);
  assert.equal(C.learnFactor(1, 800, 1000, true), 1);
  assert.equal(C.learnFactor(1, 50, 100, false), 1, 'zu wenig Sonne');
  let f = 1; for (let i = 0; i < 40; i++) f = C.learnFactor(f, 5000, 1000, false);
  assert.ok(f <= 1.4 && f > 1.35, 'begrenzt: ' + f);
});

test('S12 Tageswerte: Energie aus Messpunkten, Lücken werden nicht hochgerechnet', () => {
  const sm = [];
  for (let t = at(8); t <= at(10); t += 300) sm.push({ t, ppv: 600, pac: 200, soc: 50 });
  sm.push({ t: at(15), ppv: 600, pac: 200, soc: 70 });
  const st = C.dayStats(sm, OFF);
  assert.equal(st.length, 1); assert.equal(st[0].pvWh, 1200); assert.equal(st[0].outWh, 400);
  assert.equal(st[0].socMax, 50, 'Punkt nach Lücke zählt nicht');
});

test('S13 Growatt-Werte lesen: "200Watt", Status, Zeitsegmente', () => {
  const s = C.parseNoahStatus({ soc: '57', ppv: '312.5Watt', pac: '180Watt', chargePower: '120Watt', disChargePower: '0Watt', status: '1', batteryNum: '2' });
  assert.deepEqual([s.soc, s.ppv, s.pac, s.chargeW, s.online, s.batteries], [57, 312.5, 180, 120, true, 2]);
  assert.equal(C.parseNoahStatus({ status: '-1' }).online, false);
  assert.equal(C.parseNoahStatus({ status: '5' }).heating, true);
  const i = C.parseNoahInfo({ noah: { defaultPower: '200', chargingSocHighLimit: '95', chargingSocLowLimit: '10', batSns: ['a'], time_segment: [{ time_segment1: '0_0:0_8:0_150' }, { time_segment2: '1_8:0_18:0_0_0' }] } });
  assert.deepEqual([i.setW, i.socHigh, i.socLow, i.batteries], [200, 95, 10, 1]);
  assert.deepEqual(i.segments.map(x => [x.mode, x.start, x.end, x.power, x.enabled]), [[0, '0:0', '8:0', 150, true], [1, '8:0', '18:0', 0, false]]);
  assert.equal(C.parseNoahInfo(null).setW, null);
});

test('S14 Growatt-Anmeldung: Passwort-Hash wie die App, Zeitstempel und Gerätekennung im richtigen Format', () => {
  assert.equal(G.hashPassword('test'), 'c98f6bcd4621d373cade4e832627b4f6');
  assert.equal(G.hashPassword('Sonne2026!'), '8a75edd5b052b7951cc0bee7ec1be818');
  assert.equal(G.hashPassword('geheim123'), '576aa4c2e8948b2a10d21617d3a84085');
  const ts = G.appTimestamp(1730000000000);
  assert.equal(ts, '17300000000' + String(parseInt('7000', 10) % 98).padStart(2, '0'));
  assert.match(G.ipvcpc('nutzer'), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('S15 Himmelsrichtungen und Wettersymbole', () => {
  assert.equal(C.dirName(0), 'Süden'); assert.equal(C.dirName(-90), 'Osten'); assert.equal(C.dirName(100), 'Westen'); assert.equal(C.dirName(-170), 'Norden');
  assert.equal(C.weatherIcon(0, true)[0], '☀️'); assert.equal(C.weatherIcon(0, false)[0], '🌙'); assert.equal(C.weatherIcon(63, true)[1], 'Regen');
});

test('S16 Simulierter Speicher: Energiebilanz stimmt, Grenzen halten', () => {
  const sim = new C.Sim({ soc: 50, setW: 200, cap: 1000, t: 0, pvFn: () => 0, socLow: 10 });
  sim.advance(3600);
  assert.ok(Math.abs(sim.soc - (50 - 200 / C.ETA / 1000 * 100)) < 0.01);
  sim.advance(3600 * 10);
  assert.ok(sim.soc >= 10 - 1e-9); assert.equal(sim.status().pac, 0, 'leer → keine Abgabe');
  const sun = new C.Sim({ soc: 99, setW: 0, cap: 1000, t: 0, pvFn: () => 800 });
  sun.advance(3600); assert.ok(sun.soc <= 100);
  const fc = C.demoForecast(at(12), S(), OFF, 3);
  assert.equal(fc.hours.length, 96); assert.ok(C.energyBetween(fc, at(0), at(24)) > 0);
});
