/* Growatt-Cloud-Zugriff für den NOAH-Speicher – spricht dieselbe Schnittstelle wie die ShinePhone-App.
 * Nur Node (nutzt crypto). Keine Abhängigkeiten.
 * Vorbild für die Schnittstelle: github.com/mtrossbach/noah-mqtt und github.com/indykoning/PyPi_GrowattServer
 */
'use strict';
const crypto = require('crypto');
const Core = require('./app/core.js');

// Growatt-"MD5": jede Null an gerader Stelle wird zu "c"
function hashPassword(pw) {
  const d = crypto.createHash('md5').update(String(pw), 'utf8').digest('hex').split('');
  for (let i = 0; i < d.length; i += 2) if (d[i] === '0') d[i] = 'c';
  return d.join('');
}
function appTimestamp(ms = Date.now()) {
  const v = String(ms);
  const n = parseInt(v[1] + v[3] + v[5] + v[7], 10) % 98;
  return v.slice(0, 11) + (n < 10 ? '0' + n : String(n));
}
function ipvcpc(user, ms = Date.now()) {
  const h = Buffer.from(hashPassword(user + '★☆i₰₭' + ms).slice(0, 8), 'latin1');
  const u = crypto.randomBytes(16);
  h.readBigInt64LE ? u.writeBigInt64BE(h.readBigInt64LE(0), 0) : h.copy(u, 0);
  u[8] = (u[8] & 0x3f) | 0x80;
  const x = u.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

class GrowattError extends Error {}

class Growatt {
  constructor(o) {
    this.user = o.user; this.pwHash = o.passwordHash || hashPassword(o.password || '');
    this.base = (o.server || 'https://server-api.growatt.com').replace(/\/+$/, '');
    this.sn = o.sn || ''; this.fetch = o.fetch || globalThis.fetch;
    this.cookies = new Map(); this.token = ''; this.loggedIn = false; this.phoneSn = crypto.randomUUID();
    this.log = o.log || (() => {});
  }

  async _post(url, form, retry = true) {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36'
    };
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => k + '=' + v).join('; ');
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    let res;
    try { res = await this.fetch(url, { method: 'POST', headers, body: new URLSearchParams(form).toString(), signal: ctl.signal, redirect: 'manual' }); }
    catch (e) { throw new GrowattError('Growatt nicht erreichbar: ' + (e.name === 'AbortError' ? 'Zeitüberschreitung' : e.message)); }
    finally { clearTimeout(timer); }
    const sc = res.headers && (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get && res.headers.get('set-cookie')].filter(Boolean));
    (sc || []).forEach(c => { const m = String(c).match(/^\s*([^=;]+)=([^;]*)/); if (m) this.cookies.set(m[1].trim(), m[2]); });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    // Sitzung abgelaufen → Growatt liefert eine HTML-Anmeldeseite oder leitet um
    if ((!json || res.status === 302) && retry && !url.includes('LoginAPI') && !url.includes('/ocpp/')) {
      this.loggedIn = false; await this.login(); return this._post(url, form, false);
    }
    if (res.status && res.status >= 400) throw new GrowattError('Growatt meldet Fehler ' + res.status);
    if (!json) throw new GrowattError('Unerwartete Antwort von Growatt');
    return json;
  }

  async login() {
    try { // Token wie die App (nicht überall nötig, daher Fehler ignorieren)
      const t = await this._post('https://evcharge.growatt.com/ocpp/user', { cmd: 'shineLogin', userId: 'SHINE' + this.user, password: this.pwHash, lan: '1' }, false);
      if (t && t.token) this.token = t.token;
    } catch (e) { this.log('Token-Anmeldung übersprungen: ' + e.message); }
    const now = new Date();
    const j = await this._post(this.base + '/newTwoLoginAPIV2.do', {
      userName: this.user, password: this.pwHash, newLogin: '1', phoneType: 'android', shinephoneVersion: '8.2.6.0',
      phoneSn: this.phoneSn, ipvcpc: ipvcpc(this.user), language: '1', systemVersion: '9', phoneModel: 'SonnenPilot',
      loginTime: now.toISOString().slice(0, 19).replace('T', ' '), appType: 'ShinePhone', timestamp: appTimestamp()
    }, false);
    const back = j && j.back;
    if (!back || !back.success) throw new GrowattError('Anmeldung bei Growatt fehlgeschlagen' + (back && back.msg ? ': ' + back.msg : ' – Benutzername/Passwort prüfen'));
    this.loggedIn = true; this.userId = back.user && back.user.id;
    return back;
  }
  async ensure() { if (!this.loggedIn) await this.login(); }

  // Findet die NOAH-Seriennummer, falls nicht vorgegeben
  async discover() {
    await this.ensure();
    if (this.sn) return this.sn;
    const pl = await this._post(this.base + '/newTwoPlantAPI.do?op=getAllPlantListTwo', { plantStatus: '', pageSize: '20', language: '1', toPageNum: '1', order: '1' });
    for (const p of (pl.PlantList || [])) {
      const r = await this._post(this.base + '/noahDeviceApi/noah/isPlantNoahSystem', { plantId: String(p.id) });
      const o = r && r.obj;
      if (o && (o.isPlantHaveNoah || o.isPlantNoahSystem) && o.deviceSn) { this.sn = o.deviceSn; return this.sn; }
    }
    throw new GrowattError('Kein NOAH-Speicher im Growatt-Konto gefunden. Seriennummer in GROWATT_SN eintragen.');
  }
  _ok(r, what) {
    if (r && r.result != null && Number(r.result) !== 1) throw new GrowattError(what + ' abgelehnt' + (r.msg ? ': ' + r.msg : ''));
    return r;
  }
  async status() {
    await this.discover();
    const r = this._ok(await this._post(this.base + '/noahDeviceApi/noah/getSystemStatus', { deviceSn: this.sn }), 'Status');
    return Object.assign({ sn: this.sn }, Core.parseNoahStatus(r.obj));
  }
  async info() {
    await this.discover();
    const r = this._ok(await this._post(this.base + '/noahDeviceApi/noah/getNoahInfoBySn', { deviceSn: this.sn }), 'Geräteinfo');
    return Core.parseNoahInfo(r.obj);
  }
  async setPower(w) {
    await this.discover();
    const p = Math.round(Core.clamp(w, 0, 800));
    this._ok(await this._post(this.base + '/noahDeviceApi/noah/set', { serialNum: this.sn, type: 'default_power', param1: String(p) }), 'Leistung setzen');
    return p;
  }
  async setSoc(high, low) {
    await this.discover();
    const h = Math.round(Core.clamp(high, 70, 100)), l = Math.round(Core.clamp(low, 0, 30));
    this._ok(await this._post(this.base + '/noahDeviceApi/noah/set', { serialNum: this.sn, type: 'charging_soc', param1: String(h), param2: String(l) }), 'Akkugrenzen setzen');
    return { high: h, low: l };
  }
}

module.exports = { Growatt, GrowattError, hashPassword, appTimestamp, ipvcpc };
