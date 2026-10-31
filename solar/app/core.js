/* SonnenPilot – Kernlogik ohne Oberfläche und ohne Netzwerk.
 * Läuft im Browser (window.SolarCore) und in Node (require).
 *
 * Begriffe:
 *  - "Leistung" / power: was der Speicher (NOAH) insgesamt ins Hausnetz abgibt (Sonne + Akku), in Watt.
 *  - Zeiten sind Unix-Sekunden. off = Abstand der Ortszeit zu UTC in Sekunden (von Open-Meteo).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolarCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HOUR = 3600, DAY = 86400, ETA = 0.92;
  const MIN_BAT_W = 40;      // kleinere Akkuleistung lohnt nicht (Wechselrichter arbeitet dann ineffizient)
  const MIN_GAP = 10 * 60;   // kleine Änderungen höchstens alle 10 Minuten an den Speicher schicken
  const BIG_STEP = 100;      // große Änderungen sofort

  const DEFAULTS = Object.freeze({
    lat: 51.16, lon: 10.45,
    planes: [{ name: 'Balkon', kwp: 0.8, tilt: 35, azimuth: 0 }],
    pr: 0.85,            // Systemwirkungsgrad der Module (Kabel, Wärme, Schatten)
    pvMaxW: 2000,        // was der Speicher maximal an Sonnenleistung aufnimmt
    capacityWh: 2048,    // Akkukapazität (NOAH 2000: 2048 Wh je Akku)
    maxOutW: 800,        // erlaubte Einspeisung (Balkonkraftwerk: 800 W)
    minOutW: 0,
    loadDayW: 180, loadNightW: 120, dayStart: 6, dayEnd: 22,
    socMin: 10, socMax: 100,
    reserveOnDarkness: true, reserveSoc: 20,
    gentle: false, gentleSoc: 90,
    spreadSurplus: true,
    step: 20,            // kleinere Änderungen werden nicht an den Speicher geschickt
    mode: 'auto',        // auto | manual | off
    manualW: 300,
    boost: null,         // { w, until }
    meterUrl: '',
    factor: 1            // gelernte Korrektur der Wettervorhersage
  });

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d = 0) => {
    if (typeof v === 'number') return isFinite(v) ? v : d;
    const m = String(v == null ? '' : v).replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : d;
  };
  const round10 = v => Math.round(v / 10) * 10;

  // ---------- Einstellungen ----------
  function normalizeSettings(raw) {
    const s = Object.assign({}, DEFAULTS, raw && typeof raw === 'object' ? raw : {});
    const n = (k, a, b) => { s[k] = clamp(num(s[k], DEFAULTS[k]), a, b); };
    n('lat', -90, 90); n('lon', -180, 180); n('pr', 0.3, 1); n('pvMaxW', 100, 10000);
    n('capacityWh', 200, 50000); n('maxOutW', 0, 2000); n('minOutW', 0, 2000);
    n('loadDayW', 0, 3000); n('loadNightW', 0, 3000); n('dayStart', 0, 23); n('dayEnd', 1, 24);
    n('socMin', 0, 30); n('socMax', 70, 100); n('reserveSoc', 0, 30); n('gentleSoc', 70, 100);
    n('step', 0, 200); n('manualW', 0, 2000); n('factor', 0.4, 1.4);
    s.minOutW = Math.min(s.minOutW, s.maxOutW);
    if (s.dayEnd <= s.dayStart) s.dayEnd = Math.min(24, s.dayStart + 1);
    s.planes = (Array.isArray(s.planes) && s.planes.length ? s.planes : DEFAULTS.planes).slice(0, 6).map((p, i) => ({
      name: String((p && p.name) || 'Fläche ' + (i + 1)).slice(0, 30),
      kwp: clamp(num(p && p.kwp, 0.4), 0.05, 20),
      tilt: clamp(num(p && p.tilt, 35), 0, 90),
      azimuth: clamp(num(p && p.azimuth, 0), -180, 180)
    }));
    ['reserveOnDarkness', 'gentle', 'spreadSurplus'].forEach(k => { s[k] = !!s[k]; });
    if (!['auto', 'manual', 'off'].includes(s.mode)) s.mode = 'auto';
    if (s.boost && !(num(s.boost.until) > 0 && num(s.boost.w, -1) >= 0)) s.boost = null;
    if (s.boost) s.boost = { w: clamp(num(s.boost.w), 0, s.maxOutW), until: num(s.boost.until) };
    s.meterUrl = /^https?:\/\/[^\s]+$/i.test(String(s.meterUrl || '').trim()) ? String(s.meterUrl).trim().replace(/\/+$/, '') : '';
    Object.keys(s).forEach(k => { if (!(k in DEFAULTS)) delete s[k]; });
    return s;
  }

  // ---------- Zeit ----------
  const localHour = (t, off) => Math.floor((((t + (off || 0)) % DAY) + DAY) % DAY / HOUR);
  const localDay = (t, off) => Math.floor((t + (off || 0)) / DAY);
  const hhmm = (t, off) => { const m = Math.floor((((t + (off || 0)) % DAY) + DAY) % DAY / 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const loadAt = (t, s, off) => { const h = localHour(t, off); return h >= s.dayStart && h < s.dayEnd ? s.loadDayW : s.loadNightW; };

  // ---------- Wetter (Open-Meteo) ----------
  // Open-Meteo liefert Strahlung als Mittel der VORANGEGANGENEN Stunde: Wert bei 13:00 gilt für 12–13 Uhr.
  function parseOpenMeteo(json) {
    if (!json || !json.hourly || !Array.isArray(json.hourly.time)) throw new Error('Wetterdaten unvollständig');
    const h = json.hourly, n = h.time.length, col = k => (Array.isArray(h[k]) ? h[k] : []);
    const gti = col('global_tilted_irradiance'), temp = col('temperature_2m'), cloud = col('cloud_cover'), code = col('weather_code');
    const rows = [];
    for (let i = 0; i < n; i++) {
      const t = num(h.time[i], NaN); if (!isFinite(t)) continue;
      rows.push({ t: t - HOUR, gti: Math.max(0, num(gti[i])), temp: temp[i] == null ? null : num(temp[i]), cloud: cloud[i] == null ? null : num(cloud[i]), code: code[i] == null ? null : num(code[i]) });
    }
    return { off: num(json.utc_offset_seconds), tz: json.timezone || '', rows };
  }

  // planesData: Liste von parseOpenMeteo-Ergebnissen, eins je Modulfläche (gleiche Reihenfolge wie s.planes)
  function buildForecast(planesData, s, fetchedAt) {
    s = normalizeSettings(s);
    const map = new Map(); let off = 0, tz = '';
    planesData.forEach((pd, i) => {
      const plane = s.planes[i] || s.planes[0]; off = pd.off; tz = pd.tz;
      pd.rows.forEach(r => {
        const e = map.get(r.t) || { t: r.t, raw: 0, temp: r.temp, cloud: r.cloud, code: r.code };
        e.raw += r.gti / 1000 * plane.kwp * 1000 * s.pr;
        map.set(r.t, e);
      });
    });
    const hours = [...map.values()].sort((a, b) => a.t - b.t).map(e => {
      const raw = Math.min(s.pvMaxW, e.raw);
      return { t: e.t, raw: Math.round(raw), pv: Math.round(Math.min(s.pvMaxW, raw * s.factor)), temp: e.temp, cloud: e.cloud, code: e.code };
    });
    return { off, tz, at: fetchedAt || 0, hours };
  }
  const pvAt = (fc, t) => { const h = fc && fc.hours.find(x => t >= x.t && t < x.t + HOUR); return h ? h.pv : 0; };
  function energyBetween(fc, a, b, key = 'pv') { // Wh zwischen zwei Zeitpunkten
    let wh = 0; if (!fc) return 0;
    for (const h of fc.hours) { const x = Math.max(a, h.t), y = Math.min(b, h.t + HOUR); if (y > x) wh += h[key] * (y - x) / HOUR; }
    return wh;
  }
  // Ortstag-Grenzen
  const dayStartT = (t, off) => localDay(t, off) * DAY - (off || 0);

  // ---------- Zeitscheiben ab jetzt ----------
  function slices(now, fc, s, hours, cur) {
    const out = [], off = fc ? fc.off : 0, end = now + hours * HOUR;
    let t = now;
    while (t < end) {
      const next = Math.min(end, (Math.floor(t / HOUR) + 1) * HOUR);
      out.push({ t0: t, dur: (next - t) / HOUR, pv: pvAt(fc, t), load: loadAt(t, s, off) });
      t = next;
    }
    if (out.length && cur) {
      if (cur.pv != null) out[0].pv = cur.pv;
      if (cur.load != null) out[0].load = cur.load;
    }
    return out;
  }

  // ---------- Strategie ----------
  // in: { now, soc, pvNow?, houseW?, fc, s }
  // out: { power, socLow, socHigh, phase, reason, info }
  function plan(input) {
    const s = normalizeSettings(input.s), now = input.now, fc = input.fc, off = fc ? fc.off : 0;
    const soc = clamp(num(input.soc, 50), 0, 100), cap = s.capacityWh;
    const sl = slices(now, fc, s, 48, { pv: input.pvNow == null ? null : num(input.pvNow), load: input.houseW == null ? null : Math.max(0, num(input.houseW)) });
    const pv0 = sl[0].pv, load0 = sl[0].load;
    const info = { pvNow: Math.round(pv0), load: Math.round(load0) };

    // Akkugrenzen
    const surplus48 = sl.reduce((a, x) => a + Math.max(0, x.pv - x.load) * x.dur, 0);
    const tomorrow = dayStartT(now, off) + DAY;
    const surplusTomorrow = slices(tomorrow, fc, s, 24).reduce((a, x) => a + Math.max(0, x.pv - x.load) * x.dur, 0);
    info.surplus48 = Math.round(surplus48); info.surplusTomorrow = Math.round(surplusTomorrow);
    let socLow = s.socMin, socHigh = s.socMax;
    const dark = !!fc && surplus48 < cap * 0.15;
    info.dark = dark;
    if (s.mode === 'auto') {
      if (s.reserveOnDarkness && dark) socLow = Math.max(socLow, s.reserveSoc);
      if (s.gentle && !!fc && surplusTomorrow > cap * 1.5) socHigh = Math.min(socHigh, s.gentleSoc);
    }
    const res = (power, phase, reason) => ({
      power: clamp(round10(power), s.minOutW, s.maxOutW), socLow, socHigh, phase, reason, info
    });

    if (s.boost && s.boost.until > now) return res(s.boost.w, 'boost', 'Boost: ' + s.boost.w + ' W bis ' + hhmm(s.boost.until, off) + ' Uhr');
    if (s.mode === 'off') return res(0, 'off', 'Einspeisung pausiert – Sonne lädt nur den Akku');
    if (s.mode === 'manual') return res(s.manualW, 'manual', 'Feste Leistung: ' + s.manualW + ' W');

    const usable = Math.max(0, (soc - socLow) / 100 * cap) * ETA;
    const free = Math.max(0, (socHigh - soc) / 100 * cap) / ETA;
    info.usableWh = Math.round(usable); info.freeWh = Math.round(free);

    if (!fc && input.pvNow == null) return res(load0, 'nofc', 'Noch keine Wetterdaten – Grundlast ' + Math.round(load0) + ' W');

    if (pv0 >= load0 && pv0 > 0) {
      // Sonnenphase
      // Bei vollem Akku regelt der Speicher die Sonne ab – gemessene Leistung ist dann zu niedrig, daher auch die Vorhersage nutzen
      if (soc >= socHigh - 1) return res(Math.max(load0, Math.min(Math.max(pv0, pvAt(fc, now)), s.maxOutW)), 'full', 'Akku voll – Sonnenstrom geht direkt ins Haus');
      let S = 0, hS = 0, endT = now;
      for (const x of sl) { if (x.pv < x.load) break; S += (x.pv - x.load) * x.dur; hS += x.dur; endT = x.t0 + x.dur * HOUR; }
      info.surplusToday = Math.round(S); info.sunUntil = hhmm(endT, off);
      if (s.spreadSurplus && S > free * 1.1 && hS > 0) {
        const extra = (S - free) / hS;
        const p = Math.min(Math.max(load0, pv0), load0 + extra);
        return res(p, 'spread', 'Akku wird heute sicher voll – ' + Math.round(extra) + ' W Überschuss zusätzlich ins Haus');
      }
      const socEnd = Math.min(socHigh, soc + S * ETA / cap * 100);
      info.socEnd = Math.round(socEnd);
      return res(load0, 'sun', 'Sonne deckt die Grundlast, Rest lädt den Akku (bis ' + info.sunUntil + ' Uhr ca. ' + Math.round(socEnd) + ' %)');
    }

    // Akkuphase: Bedarf bis zur nächsten Sonne
    let D = 0, sunT = null;
    for (let i = 0; i < sl.length; i++) {
      const x = sl[i];
      if (i > 0 && x.pv >= x.load && x.pv > 0) { sunT = x.t0; break; }
      D += Math.max(0, x.load - x.pv) * x.dur;
    }
    info.needWh = Math.round(D); info.sunAt = sunT ? hhmm(sunT, off) : null;
    const until = sunT ? 'bis zur Sonne um ' + hhmm(sunT, off) + ' Uhr' : 'für die nächsten 48 Stunden';
    if (usable <= 1) return res(pv0, 'empty', 'Akku an der Untergrenze (' + socLow + ' %) – nur Sonnenstrom' + (dark ? ', Reserve für Dunkelflaute' : ''));
    if (usable >= D) return res(load0, 'battery', 'Akku reicht ' + until + ' – Grundlast voll gedeckt');
    const ratio = usable / D, share = Math.min(load0 - pv0, Math.max(MIN_BAT_W, (load0 - pv0) * ratio)), p = pv0 + share;
    info.ratio = Math.round(ratio * 100) / 100;
    return res(p, 'stretch', (sunT ? 'Akku reicht nicht ganz ' + until : 'Trübe Aussichten – Akku wird sparsam ' + until + ' verteilt') + ': ' + round10(p) + ' W');
  }

  // Vorschau: was passiert in den nächsten Stunden, wenn die Automatik so weitermacht?
  function project(input, hours = 24, stepMin = 15) {
    const s = normalizeSettings(input.s), fc = input.fc, cap = s.capacityWh, out = [];
    let soc = clamp(num(input.soc, 50), 0, 100), t = input.now;
    const end = t + hours * HOUR, dt = stepMin * 60;
    while (t < end) {
      const p = plan({ now: t, soc, fc, s });
      const pv = pvAt(fc, t);
      const r = applyEnergy(soc, pv, p.power, p.socLow, p.socHigh, cap, dt / HOUR);
      out.push({ t, pv, power: Math.round(r.out), soc: Math.round(r.soc * 10) / 10, phase: p.phase });
      soc = r.soc; t += dt;
    }
    return out;
  }

  // Energiebilanz für eine kurze Zeitspanne (Stunden). Liefert neuen Ladestand und tatsächliche Abgabe.
  function applyEnergy(soc, pv, setW, socLow, socHigh, cap, hrs) {
    let out = setW, net = pv - setW;
    if (net >= 0) {
      const room = Math.max(0, (socHigh - soc) / 100 * cap);
      const charge = Math.min(room, net * ETA * hrs);
      return { soc: soc + charge / cap * 100, out, chargeW: charge / hrs / ETA, dischargeW: 0 };
    }
    const avail = Math.max(0, (soc - socLow) / 100 * cap) * ETA;
    const want = -net * hrs;
    const got = Math.min(avail, want);
    out = pv + got / hrs;
    return { soc: soc - got / ETA / cap * 100, out, chargeW: 0, dischargeW: got / hrs };
  }

  // ---------- Simulierter Speicher (Demo und Tests) ----------
  function Sim(o) {
    o = o || {};
    this.soc = num(o.soc, 55); this.setW = num(o.setW, 150); this.socLow = num(o.socLow, 10); this.socHigh = num(o.socHigh, 100);
    this.cap = num(o.cap, 2048); this.t = num(o.t, Math.floor(Date.now() / 1000)); this.pvFn = o.pvFn || (() => 0);
    this.last = { soc: this.soc, ppv: 0, pac: 0, chargeW: 0, dischargeW: 0 };
  }
  Sim.prototype.advance = function (toT) {
    while (this.t < toT) {
      const dt = Math.min(60, toT - this.t), pv = Math.max(0, this.pvFn(this.t));
      const r = applyEnergy(this.soc, pv, this.setW, this.socLow, this.socHigh, this.cap, dt / HOUR);
      this.soc = clamp(r.soc, 0, 100);
      this.last = { soc: Math.round(this.soc), ppv: Math.round(pv), pac: Math.round(r.out), chargeW: Math.round(r.chargeW), dischargeW: Math.round(r.dischargeW) };
      this.t += dt;
    }
    return this.status();
  };
  Sim.prototype.status = function () {
    return Object.assign({ online: true, setW: this.setW, socLow: this.socLow, socHigh: this.socHigh, capacityWh: this.cap, sn: 'DEMO0000001', model: 'Simulation' }, this.last);
  };

  // Gleichmäßiger Beispiel-Wetterbericht (für Demo / Simulation ohne Internet)
  function demoForecast(now, s, off, seed) {
    s = normalizeSettings(s); off = off == null ? 3600 : off;
    let x = seed || 7; const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const start = dayStartT(now, off) - DAY, hours = [];
    const doy = Math.floor((now % (365.25 * DAY)) / DAY);
    const season = 0.6 + 0.4 * Math.cos((doy - 172) / 365.25 * 2 * Math.PI); // 0.2 im Winter … 1 im Sommer
    const kwp = s.planes.reduce((a, p) => a + p.kwp, 0);
    let cloudDay = 0.3;
    for (let i = 0; i < 24 * 4; i++) {
      const t = start + i * HOUR, h = localHour(t, off) + 0.5;
      if (i % 24 === 0) cloudDay = rnd() * 0.8;
      const rise = 8.2 - 3.8 * (season - 0.2) / 0.8, set = 26 - rise;
      const sun = h > rise && h < set ? Math.sin(Math.PI * (h - rise) / (set - rise)) : 0;
      const cloud = clamp(cloudDay + (rnd() - 0.5) * 0.3, 0, 1);
      const raw = Math.min(s.pvMaxW, sun * season * kwp * 1000 * s.pr * (1 - 0.75 * cloud));
      hours.push({ t, raw: Math.round(raw), pv: Math.round(Math.min(s.pvMaxW, raw * s.factor)), temp: Math.round(8 + 10 * season + 6 * sun), cloud: Math.round(cloud * 100), code: cloud > 0.7 ? 3 : cloud > 0.35 ? 2 : sun > 0 ? 0 : 1 });
    }
    return { off, tz: 'Demo', at: now, hours };
  }

  // ---------- Verlauf & Lernen ----------
  // samples: [{t, soc, ppv, pac, chargeW, dischargeW, setW}] im Abstand von Minuten
  function dayStats(samples, off) {
    const days = new Map();
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i], dt = (b.t - a.t) / HOUR;
      if (dt <= 0 || dt > 0.5) continue; // Lücken nicht mitzählen
      const d = localDay(b.t, off);
      const e = days.get(d) || { day: d, pvWh: 0, outWh: 0, chargeWh: 0, dischargeWh: 0, socMax: 0, socMin: 100, n: 0 };
      e.pvWh += num(b.ppv) * dt; e.outWh += num(b.pac) * dt; e.chargeWh += num(b.chargeW) * dt; e.dischargeWh += num(b.dischargeW) * dt;
      e.socMax = Math.max(e.socMax, num(b.soc)); e.socMin = Math.min(e.socMin, num(b.soc)); e.n++;
      days.set(d, e);
    }
    return [...days.values()].map(e => Object.assign(e, { pvWh: Math.round(e.pvWh), outWh: Math.round(e.outWh), chargeWh: Math.round(e.chargeWh), dischargeWh: Math.round(e.dischargeWh) }));
  }

  // Vorhersage-Korrektur: gemessen / vorhergesagt, sanft nachgeführt.
  // Tage, an denen der Akku voll war, zählen nicht (dann wird Sonnenleistung abgeregelt und die Messung ist zu niedrig).
  function learnFactor(factor, measuredWh, forecastRawWh, hitFull) {
    factor = clamp(num(factor, 1), 0.4, 1.4);
    if (hitFull || !(forecastRawWh > 300) || !(measuredWh >= 0)) return factor;
    const ratio = clamp(measuredWh / forecastRawWh, 0.4, 1.4);
    return Math.round(clamp(factor * 0.8 + ratio * 0.2, 0.4, 1.4) * 1000) / 1000;
  }

  // Muss die neue Vorgabe an den Speicher geschickt werden?
  // lastSetAt/now (optional): kleine Änderungen werden gesammelt, damit der Speicher nicht ständig umgestellt wird
  function needsUpdate(dev, p, s, lastSetAt, now) {
    s = normalizeSettings(s);
    const changes = {}, diff = dev.setW == null ? Infinity : Math.abs(num(dev.setW) - p.power);
    const calm = lastSetAt && now && now - lastSetAt < MIN_GAP && diff < BIG_STEP && p.power !== 0 && !['boost', 'manual', 'off'].includes(p.phase);
    if (!calm && (diff >= Math.max(1, s.step) || (p.power === 0 && num(dev.setW) !== 0))) changes.power = p.power;
    if (dev.socLow == null || dev.socHigh == null || num(dev.socLow) !== p.socLow || num(dev.socHigh) !== p.socHigh) changes.soc = { low: p.socLow, high: p.socHigh };
    return changes;
  }

  // Himmelsrichtungen (Open-Meteo: 0 = Süden, -90 = Osten, 90 = Westen)
  const DIRS = [['Norden', 180], ['Nordost', -135], ['Osten', -90], ['Südost', -45], ['Süden', 0], ['Südwest', 45], ['Westen', 90], ['Nordwest', 135]];
  const dirName = az => { let best = DIRS[0], d = 999; for (const x of DIRS) { const dd = Math.abs(((az - x[1] + 540) % 360) - 180); if (dd < d) { d = dd; best = x; } } return best[0]; };

  // Wettercodes (WMO) → Symbol und Text
  function weatherIcon(code, isDay) {
    const c = num(code, -1);
    if (c === 0) return isDay ? ['☀️', 'Sonnig'] : ['🌙', 'Klar'];
    if (c === 1 || c === 2) return isDay ? ['🌤️', 'Leicht bewölkt'] : ['☁️', 'Leicht bewölkt'];
    if (c === 3) return ['☁️', 'Bedeckt'];
    if (c === 45 || c === 48) return ['🌫️', 'Nebel'];
    if (c >= 51 && c <= 67) return ['🌧️', 'Regen'];
    if (c >= 71 && c <= 77) return ['🌨️', 'Schnee'];
    if (c >= 80 && c <= 82) return ['🌦️', 'Schauer'];
    if (c >= 85 && c <= 86) return ['🌨️', 'Schneeschauer'];
    if (c >= 95) return ['⛈️', 'Gewitter'];
    return ['🌡️', ''];
  }

  // Werte aus der Growatt-App-Schnittstelle ("200Watt", "20.5kWh", "55") in Zahlen
  function parseNoahStatus(obj) {
    const o = obj || {};
    const st = String(o.status == null ? '' : o.status);
    return {
      online: st === '1' || st === '5' || st === 'true',
      heating: st === '5',
      soc: num(o.soc), ppv: num(o.ppv), pac: num(o.pac),
      chargeW: num(o.chargePower), dischargeW: num(o.disChargePower),
      workMode: num(o.workMode), batteries: num(o.batteryNum, 1),
      eacToday: num(o.eacToday), alias: o.alias || ''
    };
  }
  function parseNoahInfo(obj) {
    const n = (obj && obj.noah) || {};
    const segs = [];
    const ts = n.time_segment;
    (Array.isArray(ts) ? ts : ts ? [ts] : []).forEach(m => Object.keys(m || {}).forEach(k => {
      const p = String(m[k]).split('_');
      if (p.length >= 4) segs.push({ key: k, mode: num(p[0]), start: p[1], end: p[2], power: num(p[3]), enabled: p[4] == null ? true : p[4] !== '0' });
    }));
    return {
      setW: n.defaultPower == null ? null : num(n.defaultPower),
      socHigh: n.chargingSocHighLimit == null ? null : num(n.chargingSocHighLimit),
      socLow: n.chargingSocLowLimit == null ? null : num(n.chargingSocLowLimit),
      model: n.model || n.modelName || '', version: n.version || '', alias: n.alias || '',
      batteries: Array.isArray(n.batSns) ? n.batSns.length : null, segments: segs
    };
  }

  return {
    DEFAULTS, HOUR, DAY, ETA, MIN_GAP, num, clamp, normalizeSettings, localHour, localDay, dayStartT, hhmm, loadAt,
    parseOpenMeteo, buildForecast, pvAt, energyBetween, plan, project, applyEnergy, Sim, demoForecast,
    dayStats, learnFactor, needsUpdate, DIRS, dirName, weatherIcon, parseNoahStatus, parseNoahInfo
  };
});
