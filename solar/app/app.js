/* SonnenPilot – Handy-Oberfläche. Spricht mit dem eigenen Server (/api/…);
 * ohne Server (z. B. auf GitHub Pages) läuft eine Demo mit simuliertem Speicher im Browser. */
(function () {
  'use strict';
  const C = window.SolarCore;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'sonnenpilot.key', VIEW = 'sonnenpilot.view';
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  const de = (v, d = 0) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const W = v => v == null || isNaN(v) ? '–' : Math.abs(v) >= 1000 ? de(v / 1000, 2) + ' kW' : de(Math.round(v)) + ' W';
  const kWh = v => v == null || isNaN(v) ? '–' : de(v / 1000, v >= 10000 ? 0 : 1) + ' kWh';

  const App = window.App = { ready: false, S: null, mode: null, view: store.get(VIEW) || 'now' };

  // ---------- Verbindung ----------
  async function api(path, body) {
    if (App.mode === 'demo') return Demo.api(path, body);
    const r = await fetch('api/' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-app-key': store.get(KEY) || '' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    if (r.status === 401) { const e = new Error('auth'); e.auth = true; throw e; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Server meldet ' + r.status);
    return j;
  }
  async function detect() {
    if (location.protocol === 'file:' || /[?&]demo\b/.test(location.search)) return 'demo';
    try { const r = await fetch('api/hello', { cache: 'no-store' }); const j = r.ok ? await r.json() : null; return j && j.app === 'SonnenPilot' ? 'server' : 'demo'; }
    catch (e) { return 'demo'; }
  }

  // ---------- Demo: Speicher im Browser simulieren ----------
  const Demo = {
    init() {
      const now = Math.floor(Date.now() / 1000), off = -new Date().getTimezoneOffset() * 60;
      this.s = C.normalizeSettings({ lat: 51.3, lon: 9.5, planes: [{ name: 'Balkon Süd', kwp: 0.9, tilt: 70, azimuth: 0 }, { name: 'Balkon West', kwp: 0.9, tilt: 35, azimuth: 90 }], capacityWh: 2048 });
      this.fc = C.demoForecast(now, this.s, off, 11);
      const start = now - 36 * 3600;
      this.sim = new C.Sim({ soc: 40, setW: 120, cap: this.s.capacityWh, t: start, pvFn: t => C.pvAt(this.fc, t) * (0.85 + 0.3 * Math.sin(t / 900) ** 2) });
      this.samples = []; this.actions = [];
      for (let t = start; t <= now; t += 300) this.step(t);
    },
    step(t) {
      const st = this.sim.advance(t);
      if (this.s.boost && this.s.boost.until <= t) this.s.boost = null;
      const p = C.plan({ now: t, soc: st.soc, pvNow: st.ppv, fc: this.fc, s: this.s });
      const ch = C.needsUpdate(st, p, this.s, this.setAt, t);
      if (ch.power != null) { this.setAt = t; this.actions.push({ t, kind: 'leistung', text: st.setW + ' → ' + p.power + ' W · ' + p.reason }); this.sim.setW = p.power; }
      if (ch.soc) { this.actions.push({ t, kind: 'akku', text: 'Akkugrenzen ' + ch.soc.low + '–' + ch.soc.high + ' %' }); this.sim.socLow = ch.soc.low; this.sim.socHigh = ch.soc.high; }
      this.plan = p; this.t = t;
      this.samples.push(Object.assign({ t }, this.sim.status()));
      if (this.actions.length > 200) this.actions.splice(0, this.actions.length - 200);
    },
    snap() {
      const now = Math.floor(Date.now() / 1000), fc = this.fc, off = fc.off;
      if (now - this.t >= 60) this.step(now);
      const d0 = C.dayStartT(now, off), dev = this.sim.status();
      return {
        now, demo: true, simulated: true, settings: this.s, device: dev, info: { model: 'Demo', segments: [] }, plan: this.plan, error: '',
        forecast: fc, forecastToday: Math.round(C.energyBetween(fc, d0, d0 + C.DAY)), forecastRest: Math.round(C.energyBetween(fc, now, d0 + C.DAY)),
        forecastTomorrow: Math.round(C.energyBetween(fc, d0 + C.DAY, d0 + 2 * C.DAY)),
        projection: C.project({ now, soc: dev.soc, fc, s: this.s }, 30, 15), samples: this.samples.slice(-450),
        actions: this.actions.slice(-60).reverse(), days: C.dayStats(this.samples, off).slice(-8)
      };
    },
    async api(path, body) {
      const now = Math.floor(Date.now() / 1000);
      if (path === 'settings') { const p = Object.assign({}, body); delete p.factor; delete p.boost; this.s = C.normalizeSettings(Object.assign({}, this.s, p)); this.sim.cap = this.s.capacityWh; this.t = 0; }
      if (path === 'mode') { this.s = C.normalizeSettings(Object.assign({}, this.s, { mode: body.mode, manualW: body.manualW != null ? body.manualW : this.s.manualW })); this.t = 0; }
      if (path === 'boost') { this.s.boost = body.minutes > 0 ? { w: body.w, until: now + body.minutes * 60 } : null; this.s = C.normalizeSettings(this.s); this.t = 0; }
      if (path === 'reset-learning') this.s.factor = 1;
      return this.snap();
    }
  };

  // ---------- Kleinigkeiten ----------
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
  const off = () => (App.S && App.S.forecast ? App.S.forecast.off : -new Date().getTimezoneOffset() * 60);
  const hm = t => C.hhmm(t, off());
  const dayName = t => { const d = C.localDay(t, off()), today = C.localDay(App.S.now, off()); return d === today ? 'Heute' : d === today - 1 ? 'Gestern' : d === today + 1 ? 'Morgen' : new Date((d * C.DAY) * 1000).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' }); };

  async function load(quiet) {
    try {
      App.S = await api('state' + (App.mode === 'server' ? '' : ''));
      render();
    } catch (e) {
      if (e.auth) return showLogin();
      if (!quiet) toast('Keine Verbindung: ' + e.message);
      setPill('err', 'offline');
    }
  }
  async function send(path, body, msg) {
    try { App.S = await api(path, body); render(); if (msg) toast(msg); }
    catch (e) { if (e.auth) return showLogin(); toast('Fehler: ' + e.message); }
  }
  function setPill(cls, txt) { const p = $('#pill'); p.className = 'pill ' + cls; p.textContent = txt; }

  // ---------- Anmeldung (Zugangsschlüssel) ----------
  function showLogin(msg) {
    $('#nav').classList.add('hidden');
    $('#view').innerHTML = `<div class="login"><div style="font-size:54px">🔑</div><h2>Zugangsschlüssel</h2>
      <div class="card"><p class="muted">Der Schlüssel steht beim Start des Servers im Protokoll (Zeile „Zugangsschlüssel für die App“) oder in deiner <code>.env</code> als <code>APP_KEY</code>.</p>
      <label class="f"><span>Schlüssel</span><input id="key" type="password" autocomplete="current-password" autocapitalize="off"></label>
      ${msg ? '<p style="color:var(--bad)">' + esc(msg) + '</p>' : ''}
      <button class="btn" id="keyOk" style="width:100%">Verbinden</button></div></div>`;
    setPill('', 'gesperrt');
    $('#keyOk').onclick = async () => {
      store.set(KEY, $('#key').value.trim());
      try { App.S = await api('state'); $('#nav').classList.remove('hidden'); render(); }
      catch (e) { showLogin(e.auth ? 'Schlüssel passt nicht.' : e.message); }
    };
    $('#key').onkeydown = e => { if (e.key === 'Enter') $('#keyOk').click(); };
  }

  // ---------- Ansichten ----------
  function render() {
    const S = App.S; if (!S) return;
    const dev = S.device;
    if (App.mode === 'demo') setPill('demo', 'Demo');
    else if (S.simulated) setPill('demo', 'Simulation');
    else if (!dev) setPill('err', 'kein Gerät');
    else if (!dev.online) setPill('err', 'Speicher offline');
    else setPill('ok', 'verbunden');
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === App.view));
    const keepScroll = window.scrollY;
    const html = ({ now: viewNow, plan: viewPlan, history: viewHistory, settings: viewSettings })[App.view]();
    if (App.view === 'settings' && $('#settingsForm') && App.dirty) return; // Eingaben nicht überschreiben
    $('#view').innerHTML = banners() + html;
    bind();
    window.scrollTo(0, keepScroll);
  }

  function banners() {
    const S = App.S; let h = '';
    if (App.mode === 'demo') h += `<div class="banner demo">☀️ <b>Demo</b> mit simuliertem Speicher und Beispielwetter. Für deine Anlage den SonnenPilot-Server starten – Anleitung in <a href="https://github.com/postmicha-cyber/misc/tree/main/solar#readme" target="_blank" rel="noopener">solar/README.md</a>.</div>`;
    else if (S.simulated) h += `<div class="banner demo">Server läuft ohne Growatt-Zugangsdaten – der Speicher wird <b>simuliert</b>. Trage <code>GROWATT_USER</code> und <code>GROWATT_PASSWORD</code> in die <code>.env</code> ein.</div>`;
    if (S.dryRun) h += `<div class="banner demo">🧪 <b>Probelauf:</b> SonnenPilot liest deinen Speicher, ändert aber nichts. Was er tun würde, steht unter Verlauf → Protokoll. Zum Scharfschalten <code>DRY_RUN=1</code> aus der <code>.env</code> entfernen.</div>`;
    if (S.error) h += `<div class="banner err">⚠️ ${esc(S.error)}</div>`;
    return h;
  }

  function ring(soc, low, high) {
    const r = 52, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, soc)) / 100;
    const mark = v => { const a = (v / 100) * 2 * Math.PI; return `<line x1="${60 + 44 * Math.cos(a)}" y1="${60 + 44 * Math.sin(a)}" x2="${60 + 60 * Math.cos(a)}" y2="${60 + 60 * Math.sin(a)}" stroke="var(--dim)" stroke-width="2"/>`; };
    return `<div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--line)" stroke-width="11"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--bat)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${c * f} ${c}"/>
      ${low > 0 ? mark(low) : ''}${high < 100 ? mark(high) : ''}</svg>
      <div class="in"><b>${soc == null ? '–' : Math.round(soc) + ' %'}</b><small>Akku</small></div></div>`;
  }

  function viewNow() {
    const S = App.S, d = S.device || {}, p = S.plan || {}, s = S.settings;
    const charging = (d.chargeW || 0) > 5, discharging = (d.dischargeW || 0) > 5;
    const batTxt = charging ? '+' + W(d.chargeW) + ' lädt' : discharging ? '−' + W(d.dischargeW) + ' entlädt' : 'Ruhe';
    const boostOn = s.boost && s.boost.until > S.now;
    const fc = S.forecast, hours = fc ? fc.hours.filter(h => h.t + 3600 > S.now).slice(0, 18) : [];
    const lim = (d.socLow != null ? d.socLow : p.socLow) + '–' + (d.socHigh != null ? d.socHigh : p.socHigh) + ' %';
    return `
    <section class="card" aria-label="Energiefluss">
      <div class="flow">
        <div class="node"><div class="emo">☀️</div><div class="big" id="vPv">${W(d.ppv)}</div><div class="lbl">Sonne</div>
          <div class="wire ${d.ppv > 5 ? 'on' : ''}" style="--c:var(--sun)"></div></div>
        <div class="node">${ring(d.soc, d.socLow, d.socHigh)}<div class="lbl" id="vBat">${batTxt}</div></div>
        <div class="node"><div class="emo">🏠</div><div class="big" id="vOut">${W(d.pac)}</div><div class="lbl">ins Haus</div>
          <div class="wire ${d.pac > 5 ? 'on' : ''}" style="--c:var(--home)"></div></div>
      </div>
      ${p.houseW != null ? `<p class="muted" style="text-align:center;margin:10px 0 0">Hausverbrauch ${W(p.houseW)} · Netz ${p.gridW < 0 ? 'Einspeisung ' + W(-p.gridW) : 'Bezug ' + W(p.gridW)}</p>` : ''}
    </section>

    <section class="card" aria-label="Automatik">
      <h2>Steuerung</h2>
      <div class="seg" role="tablist">
        <button data-mode="auto" class="${s.mode === 'auto' ? 'on' : ''}">🤖 Automatik</button>
        <button data-mode="manual" class="${s.mode === 'manual' ? 'on' : ''}">✋ Fest</button>
        <button data-mode="off" class="${s.mode === 'off' ? 'on' : ''}">⏸ Pause</button>
      </div>
      ${s.mode === 'manual' ? `<div class="row" style="margin-top:12px"><input type="range" id="manualW" min="0" max="${s.maxOutW}" step="10" value="${s.manualW}" aria-label="Feste Leistung"><b id="manualOut" style="min-width:64px;text-align:right">${s.manualW} W</b></div>` : ''}
      <p class="reason" id="reason">${esc(p.reason || 'Warte auf erste Messung …')}</p>
      <div class="kv"><span>Vorgabe <b id="vSet">${W(d.setW)}</b></span><span>Akkugrenzen <b>${lim}</b></span>
        ${S.lastRun ? `<span>geprüft <b>${hm(S.lastRun)}</b></span>` : ''}${s.factor !== 1 ? `<span>Wetterkorrektur <b>${de(s.factor * 100)} %</b></span>` : ''}</div>
    </section>

    <section class="card" aria-label="Boost">
      <h2>Kurz mehr Leistung</h2>
      ${boostOn ? `<p class="reason" style="margin-top:0">⚡ ${W(s.boost.w)} bis ${hm(s.boost.until)} Uhr</p><div class="chips"><button class="chip stop" data-boost="0">Boost beenden</button><button class="chip" data-boost="${s.boost.w}" data-min="${Math.round((s.boost.until - S.now) / 60) + 30}">+30 min</button></div>`
        : `<div class="chips">
          <button class="chip" data-boost="${Math.min(600, s.maxOutW)}" data-min="120">🧺 Waschen · ${Math.min(600, s.maxOutW)} W · 2 h</button>
          <button class="chip" data-boost="${Math.min(800, s.maxOutW)}" data-min="60">🍳 Kochen · ${Math.min(800, s.maxOutW)} W · 1 h</button>
          <button class="chip" data-boost="${Math.min(400, s.maxOutW)}" data-min="180">💻 Homeoffice · ${Math.min(400, s.maxOutW)} W · 3 h</button>
        </div><p class="muted" style="margin:8px 0 0">Danach übernimmt die Automatik wieder.</p>`}
    </section>

    <section class="card" aria-label="Wetter">
      <h2>Sonne</h2>
      <div class="tiles">
        <div class="tile"><b>${kWh(S.forecastRest)}</b><span>heute noch</span></div>
        <div class="tile"><b>${kWh(S.forecastToday)}</b><span>heute gesamt</span></div>
        <div class="tile"><b>${kWh(S.forecastTomorrow)}</b><span>morgen</span></div>
      </div>
      <div class="wx">${hours.map(h => { const isDay = h.raw > 0 || (C.localHour(h.t, off()) > 6 && C.localHour(h.t, off()) < 19); const ic = C.weatherIcon(h.code, isDay); return `<div title="${esc(ic[1])}">${hm(Math.max(h.t, S.now)).slice(0, 2)} Uhr<b>${ic[0]}</b>${h.temp == null ? '' : de(h.temp) + '°'}<i>${h.pv > 0 ? W(h.pv) : '·'}</i></div>`; }).join('')}</div>
      ${fc && fc.demo ? '<p class="muted">Beispielwetter (keine Verbindung zum Wetterdienst).</p>' : ''}
    </section>`;
  }

  // ---------- Diagramm ----------
  function chart(id, o) {
    const Wd = 640, Hd = 230, L = 40, R = o.pct ? 34 : 10, T = 10, B = 24, t0 = o.t0, t1 = o.t1;
    let maxW = 100;
    o.series.forEach(s => { if (!s.pct) s.data.forEach(p => { if (p[1] > maxW) maxW = p[1]; }); });
    maxW = Math.ceil(maxW / 100) * 100;
    const x = t => L + (t - t0) / (t1 - t0) * (Wd - L - R), yW = v => T + (1 - v / maxW) * (Hd - T - B), yP = v => T + (1 - v / 100) * (Hd - T - B);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = maxW * i / 4, y = yW(v); g += `<line x1="${L}" x2="${Wd - R}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${v >= 1000 ? de(v / 1000, 1) + 'k' : Math.round(v)}</text>`; if (o.pct) g += `<text x="${Wd - R + 6}" y="${y + 4}">${i * 25}%</text>`; }
    const o2 = off(), firstH = Math.ceil((t0 + o2) / 3600) * 3600 - o2;
    for (let t = firstH; t <= t1; t += 3600) {
      const h = C.localHour(t, o2);
      if (h % 6 === 0) g += `<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${Hd - B}" stroke="var(--line)" ${h === 0 ? '' : 'stroke-dasharray="2 4"'}/><text x="${x(t)}" y="${Hd - 6}" text-anchor="middle">${h === 0 ? dayName(t + 60) : h + ' Uhr'}</text>`;
    }
    if (o.now && o.now > t0 && o.now < t1) g += `<line x1="${x(o.now)}" x2="${x(o.now)}" y1="${T}" y2="${Hd - B}" stroke="var(--txt)" stroke-opacity=".5"/><text x="${x(o.now) + 4}" y="${T + 10}" style="fill:var(--txt)">jetzt</text>`;
    o.series.forEach(s => {
      const pts = s.data.filter(p => p[0] >= t0 && p[0] <= t1 && p[1] != null);
      if (!pts.length) return;
      const y = s.pct ? yP : yW;
      const d = pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
      if (s.area) g += `<path d="${d} L${x(pts[pts.length - 1][0]).toFixed(1)} ${Hd - B} L${x(pts[0][0]).toFixed(1)} ${Hd - B} Z" fill="${s.color}" fill-opacity=".18"/>`;
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
    });
    g += `<line class="cur" x1="0" x2="0" y1="${T}" y2="${Hd - B}" stroke="var(--txt)" stroke-width="1" visibility="hidden"/>`;
    App.charts[id] = { o, x0: L, x1: Wd - R, Wd };
    return `<svg class="chart" id="${id}" viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="${esc(o.label)}">${g}</svg>
      <div class="legend">${o.series.map(s => `<span><i style="background:${s.color}${s.dash ? ';opacity:.6' : ''}"></i>${esc(s.name)}</span>`).join('')}</div>
      <div class="tip" id="${id}-tip">Antippen für Werte</div>`;
  }
  function chartTouch(svg) {
    const c = App.charts[svg.id]; if (!c) return;
    const tip = document.getElementById(svg.id + '-tip'), cur = svg.querySelector('.cur');
    const show = ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * c.Wd;
      if (px < c.x0 || px > c.x1) return;
      const t = c.o.t0 + (px - c.x0) / (c.x1 - c.x0) * (c.o.t1 - c.o.t0);
      cur.setAttribute('x1', px); cur.setAttribute('x2', px); cur.setAttribute('visibility', 'visible');
      const parts = c.o.series.map(s => {
        let best = null, bd = Infinity; s.data.forEach(p => { const dd = Math.abs(p[0] - t); if (dd < bd) { bd = dd; best = p; } });
        return best && bd < 3600 && best[1] != null ? `<span style="color:${s.color}">${esc(s.name)} ${s.pct ? Math.round(best[1]) + ' %' : W(best[1])}</span>` : '';
      }).filter(Boolean);
      tip.innerHTML = `<b>${dayName(t)} ${hm(t)}</b> · ` + parts.join(' · ');
    };
    svg.addEventListener('pointerdown', show); svg.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'mouse') show(e); });
  }

  function viewPlan() {
    const S = App.S, pr = S.projection || [], fc = S.forecast;
    if (!pr.length) return `<section class="card"><h2>Plan</h2><p class="muted">Noch keine Daten vom Speicher.</p></section>`;
    const t0 = S.now, t1 = S.now + 30 * 3600;
    const fcPts = fc ? fc.hours.flatMap(h => [[h.t, h.pv], [h.t + 3599, h.pv]]) : [];
    const steps = []; let last = null;
    pr.forEach(p => { if (!last || p.phase !== last.phase || Math.abs(p.power - last.power) >= 60) { steps.push(p); last = p; } });
    const PH = { sun: '☀️ Sonne lädt Akku', spread: '🌞 Überschuss verteilen', full: '🔋 Akku voll', battery: '🌙 Akku versorgt Haus', stretch: '🌧️ Akku sparsam strecken', empty: '🪫 Akku leer', boost: '⚡ Boost', manual: '✋ Feste Leistung', off: '⏸ Pause', nofc: '…' };
    const end = pr[pr.length - 1];
    return `
    <section class="card"><h2>So plant die Automatik</h2>
      <p class="reason" style="margin-top:0">${esc((S.plan || {}).reason || '')}</p>
      ${chart('cPlan', { label: 'Plan der nächsten 30 Stunden', t0, t1, now: S.now, pct: true, series: [
        { name: 'Sonne (Vorhersage)', color: 'var(--sun)', area: true, data: fcPts },
        { name: 'Leistung ins Haus', color: 'var(--home)', data: pr.map(p => [p.t, p.power]) },
        { name: 'Akku', color: 'var(--bat)', pct: true, data: pr.map(p => [p.t, p.soc]) }] })}
    </section>
    <section class="card"><h2>Ablauf</h2>
      <ul class="steps">${steps.slice(0, 14).map(p => `<li><time>${hm(p.t)}</time><span>${PH[p.phase] || p.phase} · <b class="nowrap">${W(p.power)}</b> <span class="muted nowrap">· Akku ${Math.round(p.soc)} %</span></span></li>`).join('')}
      <li><time>${hm(end.t)}</time><span class="muted">${dayName(end.t)}: Akku voraussichtlich ${Math.round(end.soc)} %</span></li></ul>
    </section>
    <section class="card"><h2>Wie entscheidet die Automatik?</h2>
      <p class="muted" style="margin:0">Stell dir den Akku wie einen <b>Wassertank</b> vor, der tagsüber von der Sonne gefüllt wird. Die Automatik schaut in den Wetterbericht und dreht den Hahn so auf, dass der Tank genau dann leer wird, wenn die Sonne ihn wieder füllt – nicht früher (sonst Netzstrom in der Nacht) und nicht später (sonst läuft der Tank am Mittag über und Sonnenstrom geht verloren).</p>
      <ul class="steps" style="margin-top:8px">
        <li>☀️<span>Scheint genug Sonne, deckt sie die Grundlast; der Rest lädt den Akku.</span></li>
        <li>🌞<span>Wird der Akku laut Vorhersage ohnehin voll, gibt sie den Überschuss gleich mit ab statt ihn abzuregeln.</span></li>
        <li>🌙<span>Nachts verteilt sie den Akku bis zur nächsten Sonne – bei trüben Aussichten sparsamer.</span></li>
        <li>🌫️<span>Bei Dunkelflaute hält sie eine Reserve im Akku (schont die Zellen).</span></li>
      </ul>
    </section>`;
  }

  function viewHistory() {
    const S = App.S, sm = S.samples || [], fc = S.forecast;
    const t1 = S.now, t0 = S.now - 36 * 3600;
    const fcPts = fc ? fc.hours.filter(h => h.t < t1).flatMap(h => [[h.t, h.pv], [h.t + 3599, h.pv]]) : [];
    const days = (S.days || []).slice().reverse();
    return `
    <section class="card"><h2>Letzte 36 Stunden</h2>
      ${chart('cHist', { label: 'Verlauf der letzten 36 Stunden', t0, t1, now: S.now, pct: true, series: [
        { name: 'Sonne gemessen', color: 'var(--sun)', area: true, data: sm.map(x => [x.t, x.ppv]) },
        { name: 'Vorhersage', color: 'var(--sun)', dash: true, width: 1.5, data: fcPts },
        { name: 'Ins Haus', color: 'var(--home)', data: sm.map(x => [x.t, x.pac]) },
        { name: 'Akku', color: 'var(--bat)', pct: true, data: sm.map(x => [x.t, x.soc]) }] })}
    </section>
    <section class="card"><h2>Tage</h2>
      ${days.length ? `<table><thead><tr><th>Tag</th><th>Sonne</th><th>ins Haus</th><th>Akku</th></tr></thead><tbody>
        ${days.map(d => `<tr><td>${dayName(d.day * C.DAY - off() + 43200)}</td><td>${kWh(d.pvWh)}</td><td>${kWh(d.outWh)}</td><td>${d.socMin}–${d.socMax} %</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Noch keine Tageswerte.</p>'}
    </section>
    <section class="card"><h2>Protokoll</h2>
      <ul class="steps">${(S.actions || []).slice(0, App.allLog ? 60 : 12).map(a => `<li><time>${hm(a.t)}</time><span>${esc(a.text)}<br><span class="muted">${dayName(a.t)}</span></span></li>`).join('') || '<li class="muted">Noch keine Aktionen.</li>'}</ul>
      ${!App.allLog && (S.actions || []).length > 12 ? '<button class="chip" id="allLog">Ältere anzeigen</button>' : ''}
    </section>`;
  }

  // ---------- Einstellungen ----------
  const dirOpts = az => C.DIRS.map(d => `<option value="${d[1]}" ${C.dirName(az) === d[0] ? 'selected' : ''}>${d[0]}</option>`).join('');
  function planeHtml(p, i) {
    return `<div class="plane" data-i="${i}"><div class="plane-head"><label class="f" style="flex:1"><span>Name</span><input type="text" data-k="name" value="${esc(p.name)}"></label>
      <button type="button" class="del" data-del="${i}" aria-label="Fläche entfernen">✕</button></div>
      <div class="grid3"><label class="f"><span>Leistung kWp</span><input type="number" step="0.01" min="0.05" data-k="kwp" value="${p.kwp}"></label>
      <label class="f"><span>Neigung °</span><input type="number" min="0" max="90" data-k="tilt" value="${p.tilt}"></label>
      <label class="f"><span>Richtung</span><select data-k="azimuth">${dirOpts(p.azimuth)}</select></label></div></div>`;
  }
  const num = (id, label, v, a) => `<label class="f"><span>${label}</span><input type="number" id="${id}" value="${v}" ${a || ''}></label>`;
  const sw = (id, label, hint, on) => `<label class="switch"><span>${label}<small>${hint}</small></span><input type="checkbox" id="${id}" ${on ? 'checked' : ''}></label>`;
  function viewSettings() {
    const S = App.S, s = S.settings;
    return `<form id="settingsForm" autocomplete="off">
    <section class="card"><h2>Standort</h2>
      <div class="grid2">${num('lat', 'Breitengrad', s.lat, 'step="0.0001"')}${num('lon', 'Längengrad', s.lon, 'step="0.0001"')}</div>
      <button type="button" class="btn sec" id="geo">📍 Aktuellen Standort übernehmen</button>
    </section>
    <section class="card"><h2>Module</h2><div id="planes">${s.planes.map(planeHtml).join('')}</div>
      <button type="button" class="btn sec" id="addPlane">＋ Weitere Fläche (z. B. zweite Balkonseite)</button>
      <div class="grid2">${num('pr', 'Wirkungsgrad (0,3–1)', s.pr, 'step="0.01" min="0.3" max="1"')}${num('pvMaxW', 'Max. Sonnenleistung W', s.pvMaxW, 'step="10"')}</div>
      <p class="muted">Wetterkorrektur (gelernt): <b>${de(s.factor * 100)} %</b> <button type="button" class="chip" id="resetLearn" style="margin-left:6px">zurücksetzen</button></p>
    </section>
    <section class="card"><h2>Akku & Einspeisung</h2>
      <div class="grid2">${num('capacityWh', 'Akkukapazität Wh', s.capacityWh, 'step="1"')}${num('maxOutW', 'Max. Einspeisung W', s.maxOutW, 'step="10" max="800"')}</div>
      ${S.capacityManual ? '<button type="button" class="chip" id="capAuto">Kapazität wieder vom Gerät übernehmen</button>' : '<p class="muted">Wird aus der Anzahl der Akkus am Gerät übernommen, bis du selbst etwas einträgst.</p>'}
      <div class="grid2">${num('socMin', 'Akku nie unter %', s.socMin, 'min="0" max="30"')}${num('socMax', 'Akku laden bis %', s.socMax, 'min="70" max="100"')}</div>
    </section>
    <section class="card"><h2>Verbrauch (Grundlast)</h2>
      <p class="muted" style="margin-top:0">Was dein Haushalt ständig zieht (Kühlschrank, Router, Standby). Tipp: Nachts am Stromzähler ablesen.</p>
      <div class="grid2">${num('loadDayW', 'Tagsüber W', s.loadDayW, 'step="10"')}${num('loadNightW', 'Nachts W', s.loadNightW, 'step="10"')}
      ${num('dayStart', 'Tag beginnt (Uhr)', s.dayStart, 'min="0" max="23"')}${num('dayEnd', 'Tag endet (Uhr)', s.dayEnd, 'min="1" max="24"')}</div>
      <label class="f"><span>Shelly-Stromzähler (optional, z. B. http://192.168.178.50)</span><input type="url" id="meterUrl" value="${esc(s.meterUrl)}" placeholder="leer = ohne Zähler"></label>
      <p class="muted">Mit Zähler (Shelly Pro 3EM, 3EM, EM) regelt die Automatik auf den echten Verbrauch statt auf die Grundlast. Der Server muss den Zähler im Heimnetz erreichen.</p>
    </section>
    <section class="card"><h2>Automatik</h2>
      ${sw('spreadSurplus', 'Überschuss verteilen', 'Wird der Akku sicher voll, schon vorher mehr ins Haus geben', s.spreadSurplus)}
      ${sw('reserveOnDarkness', 'Reserve bei Dunkelflaute', 'Bei tagelang trübem Wetter Akku nicht leer fahren', s.reserveOnDarkness)}
      ${num('reserveSoc', 'Reserve %', s.reserveSoc, 'min="0" max="30"')}
      ${sw('gentle', 'Akkuschonung im Sommer', 'Bei sehr sonnigen Aussichten nur bis zur Schongrenze laden', s.gentle)}
      ${num('gentleSoc', 'Schongrenze %', s.gentleSoc, 'min="70" max="100"')}
      <div class="grid2">${num('step', 'Mindeständerung W', s.step, 'min="0" max="200"')}${num('minOutW', 'Mindestleistung W', s.minOutW, 'step="10"')}</div>
    </section>
    <div class="save-bar"><button type="button" class="btn sec" id="cancel">Verwerfen</button><button type="submit" class="btn" id="save">Speichern</button></div>
    </form>
    <section class="card"><h2>Gerät</h2>
      ${S.device ? `<div class="kv"><span>Seriennr. <b>${esc(S.device.sn || '–')}</b></span><span>Modell <b>${esc((S.info && S.info.model) || S.device.model || '–')}</b></span>${S.info && S.info.version ? `<span>Firmware <b>${esc(S.info.version)}</b></span>` : ''}</div>` : '<p class="muted">Kein Gerät verbunden.</p>'}
      ${S.info && S.info.segments && S.info.segments.some(x => x.enabled) ? `<p class="banner err" style="margin-top:10px">In der Shine-App sind Zeitsegmente aktiv. Sie haben Vorrang vor der Automatik – bitte dort deaktivieren.</p>` : ''}
      ${App.mode === 'server' ? '<button class="btn sec" id="logout" style="margin-top:10px">Zugangsschlüssel auf diesem Gerät vergessen</button>' : ''}
    </section>`;
  }
  function readForm() {
    const v = id => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(String(el.value).replace(',', '.')) : el.value) : undefined; };
    const o = {};
    ['lat', 'lon', 'pr', 'pvMaxW', 'maxOutW', 'socMin', 'socMax', 'loadDayW', 'loadNightW', 'dayStart', 'dayEnd', 'meterUrl', 'spreadSurplus', 'reserveOnDarkness', 'reserveSoc', 'gentle', 'gentleSoc', 'step', 'minOutW'].forEach(k => { const x = v(k); if (x !== undefined && !(typeof x === 'number' && isNaN(x))) o[k] = x; });
    const cap = v('capacityWh'); if (!isNaN(cap) && cap !== App.S.settings.capacityWh) o.capacityWh = cap;
    o.planes = [...document.querySelectorAll('#planes .plane')].map(el => {
      const g = k => el.querySelector(`[data-k="${k}"]`).value;
      return { name: g('name'), kwp: parseFloat(g('kwp').replace(',', '.')), tilt: parseFloat(g('tilt')), azimuth: parseFloat(g('azimuth')) };
    });
    return o;
  }

  // ---------- Ereignisse ----------
  function bind() {
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => send('mode', { mode: b.dataset.mode }, b.dataset.mode === 'auto' ? 'Automatik aktiv' : b.dataset.mode === 'off' ? 'Einspeisung pausiert' : 'Feste Leistung'));
    const mw = $('#manualW');
    if (mw) { mw.oninput = () => { $('#manualOut').textContent = mw.value + ' W'; }; mw.onchange = () => send('mode', { mode: 'manual', manualW: +mw.value }, 'Feste Leistung ' + mw.value + ' W'); }
    document.querySelectorAll('[data-boost]').forEach(b => b.onclick = () => {
      const w = +b.dataset.boost; send('boost', w ? { w, minutes: +b.dataset.min } : { minutes: 0 }, w ? 'Boost ' + w + ' W' : 'Boost beendet');
    });
    document.querySelectorAll('svg.chart').forEach(chartTouch);
    const f = $('#settingsForm');
    if (f) {
      App.dirty = false;
      f.oninput = f.onchange = () => { App.dirty = true; };
      f.onsubmit = async e => { e.preventDefault(); App.dirty = false; await send('settings', readForm(), 'Gespeichert'); };
      $('#cancel').onclick = () => { App.dirty = false; render(); };
      $('#addPlane').onclick = () => { App.dirty = true; const wrap = $('#planes'); const n = wrap.children.length; if (n >= 6) return; wrap.insertAdjacentHTML('beforeend', planeHtml({ name: 'Fläche ' + (n + 1), kwp: 0.4, tilt: 35, azimuth: 0 }, n)); };
      $('#planes').onclick = e => { const i = e.target.dataset.del; if (i == null) return; if ($('#planes').children.length <= 1) return toast('Mindestens eine Fläche'); e.target.closest('.plane').remove(); App.dirty = true; };
      $('#geo').onclick = () => {
        if (!navigator.geolocation) return toast('Standort nicht verfügbar');
        navigator.geolocation.getCurrentPosition(p => { $('#lat').value = p.coords.latitude.toFixed(4); $('#lon').value = p.coords.longitude.toFixed(4); App.dirty = true; toast('Standort übernommen – Speichern nicht vergessen'); }, () => toast('Standort nicht freigegeben'), { timeout: 10000 });
      };
      const rl = $('#resetLearn'); if (rl) rl.onclick = () => send('reset-learning', {}, 'Wetterkorrektur zurückgesetzt');
      const ca = $('#capAuto'); if (ca) ca.onclick = () => send('settings', { capacityAuto: true }, 'Kapazität vom Gerät');
    }
    const al = $('#allLog'); if (al) al.onclick = () => { App.allLog = true; render(); };
    const lo = $('#logout'); if (lo) lo.onclick = () => { store.set(KEY, null); showLogin(); };
  }

  $('#nav').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (App.view === 'settings' && App.dirty && !confirm('Änderungen verwerfen?')) return;
    App.dirty = false; App.view = b.dataset.v; store.set(VIEW, App.view); App.charts = {}; window.scrollTo(0, 0); render();
  };
  $('#refresh').onclick = async () => { $('#refresh').disabled = true; if (App.mode === 'server') await send('refresh', {}, 'Aktualisiert'); else await load(); $('#refresh').disabled = false; };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });

  App.charts = {};
  (async function start() {
    App.mode = await detect();
    if (App.mode === 'demo') Demo.init();
    await load();
    App.ready = true;
    setInterval(() => { if (!document.hidden && !App.dirty) load(true); }, 30000);
  })();
})();
