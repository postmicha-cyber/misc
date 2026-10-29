/* Arcade Sync: automatische Synchronisation und Backup für die Mini-Apps.
 *  - Cloud-Sync über ein privates (geheimes) GitHub-Gist, optional Ende-zu-Ende-verschlüsselt (AES-GCM)
 *  - Datei-Backup über das iOS-Teilen-Menü (z. B. "In Dateien sichern" → iCloud Drive)
 * Alle Mini-Apps teilen sich Zugang (Token) und Gist; jede App nutzt ihre eigene Datei darin.
 */
(function () {
  'use strict';
  const SK = 'arcadeSync.v1', DESC = 'Arcade Sync (privat)';
  const blank = () => ({ token: '', gist: '', pass: '', apps: {} });
  let S = blank();
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(SK) || '{}')); } catch (e) {}
  let cfg = null, busy = false, applying = false, timer = null, status = { k: 'off', t: 0, msg: '' }, panel = null, passAsked = false;
  const persist = () => { try { localStorage.setItem(SK, JSON.stringify(S)); } catch (e) {} };
  const app = () => (S.apps[cfg.name] = S.apps[cfg.name] || { ts: 0, synced: 0 });
  const connected = () => !!(S.token && S.gist);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Krypto ----------
  const TE = new TextEncoder(), TD = new TextDecoder();
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function dkey(pass, salt) {
    const km = await crypto.subtle.importKey('raw', TE.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(obj, pass) {
    const txt = JSON.stringify(obj); if (!pass) return txt;
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await dkey(pass, salt), TE.encode(txt)));
    return JSON.stringify({ enc: 1, s: b64(salt), i: b64(iv), c: b64(ct) });
  }
  async function unseal(text, pass) {
    const o = JSON.parse(text); if (!o.enc) return o;
    if (!pass) throw new Error('PASS');
    try { return JSON.parse(TD.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.i) }, await dkey(pass, unb64(o.s)), unb64(o.c)))); } catch (e) { throw new Error('PASS'); }
  }

  // ---------- GitHub-Gist ----------
  async function gh(path, method, body) {
    const h = { Authorization: 'Bearer ' + S.token, Accept: 'application/vnd.github+json' };
    if (body) h['Content-Type'] = 'application/json';
    const r = await fetch('https://api.github.com' + path + (method ? '' : (path.includes('?') ? '&' : '?') + 't=' + Date.now()), { method: method || 'GET', headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    if (r.status === 401 || r.status === 403 && (await r.clone().text()).includes('credentials')) throw new Error('AUTH');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  async function findOrCreateGist() {
    const list = await gh('/gists?per_page=100');
    const g = list.find(x => x.description === DESC);
    if (g) return g.id;
    const c = await gh('/gists', 'POST', { description: DESC, public: false, files: { 'LIESMICH.txt': { content: 'Daten der Arcade-Mini-Apps. Wenn ein Passwort gesetzt ist, sind die Dateien verschlüsselt.' } } });
    return c.id;
  }
  const fileName = () => cfg.name + '.json';
  async function readRemote() {
    const g = await gh('/gists/' + S.gist), f = g.files && g.files[fileName()];
    if (!f) return null;
    let txt = f.content;
    if (f.truncated) txt = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
    return unseal(txt, S.pass);
  }
  async function writeRemote(ts) {
    const text = await seal({ ts, data: cfg.getData() }, S.pass);
    await gh('/gists/' + S.gist, 'PATCH', { files: { [fileName()]: { content: text } } });
  }

  // ---------- Sync-Logik ----------
  function setStatus(k, msg) { status = { k, t: Date.now(), msg: msg || '' }; if (k === 'ok') { S.lastOk = Date.now(); persist(); } render(); }
  function adopt(remote) {
    const a = app(); applying = true;
    try { cfg.setData(remote.data); } finally { applying = false; }
    a.ts = a.synced = remote.ts; persist();
  }
  async function push(ts) { const a = app(); await writeRemote(ts); a.ts = a.synced = ts; persist(); }

  async function sync(manual) {
    if (!cfg || !connected() || busy) return;
    busy = true; setStatus('sync');
    try {
      const a = app();
      if (a.ts === 0 && cfg.hasData && cfg.hasData()) { a.ts = Date.now(); persist(); }   // vorhandene Daten gelten als lokale Änderung
      const remote = await readRemote();
      if (!remote) { if (cfg.hasData && !cfg.hasData() && a.ts === 0) { /* nichts zu tun */ } else await push(a.ts || Date.now()); }
      else if (remote.ts === a.synced) { if (a.ts > a.synced) await push(a.ts); }
      else if (remote.ts > a.synced) {
        if (a.ts <= a.synced) adopt(remote);
        else { const pick = await askConflict(remote); if (pick === 'cloud') adopt(remote); else await push(Date.now()); }
      } else await push(Math.max(a.ts, Date.now()));
      setStatus('ok');
    } catch (e) {
      setStatus('err', e.message === 'AUTH' ? 'Zugang abgelehnt. Token prüfen.' : e.message === 'PASS' ? 'Die Cloud-Daten sind mit einem App-Passwort verschlüsselt, das hier fehlt oder nicht passt.' : navigator.onLine === false ? 'Offline. Wird später gesendet.' : 'Fehler: ' + e.message);
      if (e.message === 'PASS' && (manual || !passAsked)) { passAsked = true; setTimeout(askPass, 0); }
    } finally { busy = false; }
  }
  function changed() {
    if (!cfg || applying) return;
    app().ts = Date.now(); persist();
    if (!connected()) { render(); return; }
    setStatus('pending'); clearTimeout(timer); timer = setTimeout(() => sync(), 2500);
  }

  // ---------- Dialoge ----------
  const CSS = '.as-ov{position:fixed;inset:0;z-index:9999;background:rgba(2,6,16,.8);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);display:flex;align-items:flex-end;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#eef2ff}' +
    '.as-sh{width:100%;max-height:92%;overflow-y:auto;background:#121a30;border-top:1px solid #2c3a63;border-radius:22px 22px 0 0;padding:16px 14px calc(16px + env(safe-area-inset-bottom));animation:asup .25s}@keyframes asup{from{transform:translateY(40px);opacity:0}}' +
    '.as-sh h3{font-size:18px;font-weight:900;margin-bottom:6px}.as-sh h4{font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#8d9bc6;margin:14px 0 6px}.as-sh p{font-size:13px;line-height:1.5;color:#c9d3f5;margin-bottom:8px}' +
    '.as-b{display:block;width:100%;padding:13px;border-radius:13px;border:0;font:800 15px inherit;font-family:inherit;color:#fff;background:linear-gradient(135deg,#5b6cff,#9a6bff);margin-top:8px;text-align:center;text-decoration:none}' +
    '.as-b.s{background:#1f2b48;border:1px solid #2c3a63}.as-b.r{background:rgba(255,93,108,.14);color:#ff5d6c;border:1px solid #ff5d6c}.as-b:active{transform:scale(.98)}' +
    '.as-in{width:100%;padding:11px;border-radius:10px;background:#0b1020;border:1px solid #2c3a63;color:#eef2ff;font:16px inherit;font-family:inherit;margin:4px 0 8px}' +
    '.as-st{padding:10px;border-radius:12px;font-size:13px;font-weight:700;line-height:1.4;margin-bottom:6px;background:#1f2b48}.as-st.ok{border:1px solid #3fe08f}.as-st.err{border:1px solid #ff5d6c}.as-st.pend{border:1px solid #ffc247}' +
    '@media(min-width:760px){.as-ov{align-items:center;justify-content:center}.as-sh{max-width:560px;border-radius:22px;border:1px solid #2c3a63}}' +
    '.as-x{float:right;background:rgba(255,255,255,.1);border:0;color:#fff;border-radius:10px;width:32px;height:32px;font-size:15px}.as-s{font-size:12px;color:#8d9bc6;line-height:1.45}';
  function ensureCss() { if (!document.getElementById('as-css')) { const s = document.createElement('style'); s.id = 'as-css'; s.textContent = CSS; document.head.appendChild(s); } }
  function overlay(html) { ensureCss(); const o = document.createElement('div'); o.className = 'as-ov'; o.innerHTML = '<div class="as-sh">' + html + '</div>'; document.body.appendChild(o); return o; }
  function askConflict(remote) {
    return new Promise(res => {
      const o = overlay('<h3>⚠️ Zwei Stände</h3><p>Auf diesem Gerät und in der Cloud wurde unterschiedlich weitergearbeitet. Welchen Stand möchtest du behalten?</p>' +
        '<button class="as-b" id="c1">☁️ Cloud-Stand übernehmen<br><small>vom ' + new Date(remote.ts).toLocaleString('de-DE') + ' (lokale Änderungen gehen verloren)</small></button>' +
        '<button class="as-b s" id="c2">📱 Dieses Gerät behalten<br><small>überschreibt den Cloud-Stand</small></button>');
      o.querySelector('#c1').onclick = () => { o.remove(); res('cloud'); }; o.querySelector('#c2').onclick = () => { o.remove(); res('local'); };
    });
  }
  // Verschlüsselte Cloud-Daten: Passwort eingeben oder verschlüsselte Dateien verwerfen
  function askPass() {
    if (document.getElementById('as-pass')) return;
    const o = overlay('<button class="as-x" id="cl">✕</button><h3 id="as-pass">🔒 App-Passwort nötig</h3><p>In deinem Sync-Gist liegen Daten, die mit einem <b>App-Passwort</b> verschlüsselt wurden, vermutlich bei einer früheren Einrichtung. Das ist <b>nicht</b> dein GitHub-Passwort.</p>' +
      '<h4>Passwort bekannt?</h4><input class="as-in" id="pw" type="password" placeholder="App-Passwort" autocomplete="current-password"><button class="as-b" id="ok">Entsperren</button>' +
      '<h4>Passwort unbekannt?</h4><p>Dann die verschlüsselten Cloud-Dateien verwerfen und neu anfangen. Die Daten auf diesem Gerät bleiben erhalten und werden danach hochgeladen.</p><button class="as-b r" id="wipe">Verschlüsselte Cloud-Daten verwerfen</button><div class="as-st err" id="er" style="display:none"></div>');
    const q = id => o.querySelector('#' + id); q('cl').onclick = () => o.remove();
    q('ok').onclick = async () => { const v = q('pw').value; if (!v) { q('pw').focus(); return; } S.pass = v; persist(); o.remove(); await sync(true); };
    q('wipe').onclick = async () => {
      if (!confirm('Alle verschlüsselten Dateien im Sync-Gist löschen? Das betrifft alle Apps, die mit diesem Passwort gespeichert haben.')) return;
      q('wipe').textContent = 'Lösche …';
      try { await wipeEncrypted(); S.pass = ''; persist(); o.remove(); await sync(true); }
      catch (e) { q('wipe').textContent = 'Verschlüsselte Cloud-Daten verwerfen'; q('er').style.display = 'block'; q('er').textContent = 'Fehler: ' + e.message; }
    };
  }
  async function wipeEncrypted() {
    const g = await gh('/gists/' + S.gist), files = {};
    Object.entries(g.files || {}).forEach(([n, f]) => { if (/\.json$/.test(n) && (f.truncated || /"enc"\s*:\s*1/.test(f.content || ''))) files[n] = null; });
    if (Object.keys(files).length) await gh('/gists/' + S.gist, 'PATCH', { files });
    // Alle Apps auf diesem Gerät gelten danach als „noch nicht hochgeladen“
    Object.values(S.apps).forEach(a => { a.synced = 0; if (!a.ts) a.ts = Date.now(); });
  }
  // Sync-Link: verbindet ein weiteres Gerät mit einem Antippen (alle Apps dieser Seite teilen die Einstellung)
  const syncCode = () => 'AS1:' + btoa(JSON.stringify({ t: S.token, g: S.gist, p: S.pass }));
  const syncLink = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, 'index.html') + '#sync=' + encodeURIComponent(syncCode());
  function joinFromHash() {
    const m = location.hash.match(/^#sync=(.+)$/); if (!m) return;
    history.replaceState(null, '', location.href.replace(/#.*$/, ''));
    try {
      const c = JSON.parse(atob(decodeURIComponent(m[1]).replace(/^AS1:/, ''))); if (!c.t || !c.g) throw 0;
      S.token = c.t; S.gist = c.g; S.pass = c.p || ''; persist();
      const o = overlay('<h3>✅ Sync eingerichtet</h3><p>Dieses Gerät ist jetzt verbunden. Jede App gleicht beim Öffnen automatisch mit der Cloud ab.</p><button class="as-b" id="ok">Super</button>');
      o.querySelector('#ok').onclick = () => o.remove();
      if (cfg) sync(true);
    } catch (e) { alert('Der Sync-Link ist ungültig oder unvollständig.'); }
  }
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' Tagen'; };

  function statusHTML() {
    if (!connected()) return '<div class="as-st">☁️ Cloud-Sync ist <b>aus</b>. Daten liegen nur auf diesem Gerät.</div>';
    const a = app();
    if (status.k === 'sync') return '<div class="as-st pend">🔄 Synchronisiere …</div>';
    if (status.k === 'pending' || (a.ts > a.synced && status.k !== 'err')) return '<div class="as-st pend">⏳ Änderungen warten auf Übertragung …</div>';
    if (status.k === 'err') return '<div class="as-st err">⚠️ ' + esc(status.msg) + '</div>';
    return '<div class="as-st ok">✅ Synchronisiert' + (S.lastOk ? ' ' + ago(S.lastOk) : '') + (S.pass ? ' · 🔒 verschlüsselt' : ' · nicht verschlüsselt') + '</div>';
  }
  function render() { if (!panel) return; const el = panel.querySelector('#as-status'); if (el) el.innerHTML = statusHTML(); }

  function open() {
    if (!cfg) return;
    const on = connected();
    panel = overlay('<button class="as-x" id="as-cl">✕</button><h3>☁️ Sync &amp; Backup</h3><div id="as-status">' + statusHTML() + '</div>' +
      (on ? '<button class="as-b" id="as-now">🔄 Jetzt synchronisieren</button><button class="as-b s" id="as-link">📲 Sync-Link für weitere Geräte</button><button class="as-b s" id="as-code">🔑 Sync-Code kopieren</button><button class="as-b r" id="as-off">Cloud-Sync auf diesem Gerät trennen</button>' :
        '<p>Gleicht deine Daten automatisch zwischen iPhone und iPad ab. Sie liegen dabei in einem <b>privaten GitHub-Gist</b> in deinem Account, optional verschlüsselt.</p><button class="as-b" id="as-setup">☁️ Cloud-Sync einrichten</button><button class="as-b s" id="as-join">🔑 Sync-Code von anderem Gerät einfügen</button>') +
      '<h4>Datei-Backup</h4><p>Speichert eine Sicherungsdatei, z. B. über „In Dateien sichern“ in <b>iCloud Drive</b>. So kannst du sie auch auf dem iPad laden.</p><button class="as-b s" id="as-save">📁 Backup-Datei sichern</button><button class="as-b s" id="as-load">📂 Aus Datei wiederherstellen</button><div class="as-s" id="as-msg" style="margin-top:8px"></div>');
    const q = id => panel.querySelector('#' + id), msg = t => { q('as-msg').textContent = t; };
    const close = () => { panel.remove(); panel = null; };
    q('as-cl').onclick = close; panel.onclick = e => { if (e.target === panel) close(); };
    if (on) {
      q('as-now').onclick = () => sync(true);
      q('as-link').onclick = async () => {
        const url = syncLink();
        if (navigator.share) { try { await navigator.share({ title: 'Arcade Sync', text: 'Diesen Link auf dem anderen Gerät öffnen:', url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
        try { await navigator.clipboard.writeText(url); msg('Sync-Link kopiert. Auf dem anderen Gerät im Browser öffnen, fertig. Der Link enthält deinen Zugang, also nur dir selbst schicken.'); } catch (e) { prompt('Sync-Link kopieren:', url); }
      };
      q('as-code').onclick = () => { const code = syncCode(); (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => msg('Sync-Code kopiert. Auf dem anderen Gerät: „Sync-Code einfügen“. Enthält Zugangsdaten, nicht weitergeben.')).catch(() => { prompt('Sync-Code kopieren:', code); }); };
      q('as-off').onclick = () => { if (confirm('Cloud-Sync trennen? Die Daten bleiben auf diesem Gerät und in der Cloud erhalten.')) { S.token = S.gist = S.pass = ''; S.apps = {}; persist(); setStatus('off'); close(); } };
    } else {
      q('as-setup').onclick = () => { close(); setupSheet(); };
      q('as-join').onclick = () => { close(); joinSheet(); };
    }
    q('as-save').onclick = shareFile; q('as-load').onclick = () => loadFile(msg);
  }

  function setupSheet() {
    const o = overlay('<button class="as-x" id="cl">✕</button><h3>☁️ Cloud-Sync einrichten</h3><p><b>1.</b> Erstelle bei GitHub ein Zugangs-Token. Es braucht nur die Berechtigung „gist“.</p>' +
      '<a class="as-b s" target="_blank" rel="noopener" href="https://github.com/settings/tokens/new?scopes=gist&description=Arcade%20Sync">GitHub öffnen und Token erstellen</a>' +
      '<p class="as-s">Auf GitHub: Name egal, Ablauf z. B. „No expiration“, nur Haken bei „gist“, ganz unten „Generate token“.</p><p style="margin-top:10px"><b>2.</b> Kopiere das Token (beginnt mit „ghp_“) und füge es hier ein:</p><input class="as-in" id="tk" placeholder="ghp_…" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '<p><b>3.</b> Optional: ein eigenes <b>App-Passwort</b>, mit dem die Daten verschlüsselt werden. Das ist <b>nicht</b> dein GitHub-Passwort. Für Tests einfach leer lassen. Wenn du eins setzt: merken, es ist nicht wiederherstellbar.</p><input class="as-in" id="pw" type="password" placeholder="leer lassen = ohne Verschlüsselung" autocomplete="new-password">' +
      '<div class="as-st" id="er" style="display:none"></div><button class="as-b" id="go">Verbinden</button>');
    const q = id => o.querySelector('#' + id); q('cl').onclick = () => o.remove();
    q('go').onclick = async () => {
      const t = q('tk').value.trim(); if (!t) { q('tk').focus(); return; }
      q('go').textContent = 'Verbinde …'; q('er').style.display = 'none';
      const prev = { token: S.token, gist: S.gist, pass: S.pass };
      try { S.token = t; S.pass = q('pw').value; S.gist = await findOrCreateGist(); persist(); o.remove(); await sync(true); open(); }
      catch (e) { S.token = prev.token; S.gist = prev.gist; S.pass = prev.pass; q('go').textContent = 'Verbinden'; q('er').className = 'as-st err'; q('er').style.display = 'block'; q('er').textContent = e.message === 'AUTH' ? 'Token wurde abgelehnt. Prüfe Token und Berechtigung „gist“.' : 'Verbindung fehlgeschlagen: ' + e.message; }
    };
  }
  function joinSheet() {
    const o = overlay('<button class="as-x" id="cl">✕</button><h3>🔑 Sync-Code einfügen</h3><p>Öffne auf dem anderen Gerät „Sync &amp; Backup“ und tippe „Sync-Code kopieren“. Schicke ihn dir selbst (z. B. per AirDrop oder Notizen) und füge ihn hier ein.</p><textarea class="as-in" id="cd" rows="4" placeholder="AS1:…" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea><div class="as-st" id="er" style="display:none"></div><button class="as-b" id="go">Verbinden</button>');
    const q = id => o.querySelector('#' + id); q('cl').onclick = () => o.remove();
    q('go').onclick = async () => {
      try { const c = JSON.parse(atob(q('cd').value.trim().replace(/^AS1:/, ''))); if (!c.t || !c.g) throw 0; S.token = c.t; S.gist = c.g; S.pass = c.p || ''; persist(); o.remove(); await sync(true); open(); }
      catch (e) { q('er').className = 'as-st err'; q('er').style.display = 'block'; q('er').textContent = 'Der Code ist ungültig.'; }
    };
  }

  // ---------- Datei-Backup ----------
  async function shareFile() {
    const txt = JSON.stringify({ app: cfg.name, ts: Date.now(), data: cfg.getData() });
    const f = new File([txt], cfg.name + '-backup-' + new Date().toLocaleDateString('sv-SE') + '.json', { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: (cfg.label || cfg.name) + ' Backup' }); S.lastFile = Date.now(); persist(); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); S.lastFile = Date.now(); persist();
  }
  function loadFile(msg) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const o = JSON.parse(r.result); if (o.app && o.app !== cfg.name) throw new Error('Diese Datei gehört zu „' + o.app + '“.'); if (!o.data) throw new Error('Keine Daten in der Datei.'); if (!confirm('Aktuelle Daten durch das Backup vom ' + new Date(o.ts || Date.now()).toLocaleString('de-DE') + ' ersetzen?')) return; applying = true; try { cfg.setData(o.data); } finally { applying = false; } changed(); msg('✅ Backup wiederhergestellt.'); } catch (e) { msg('⚠️ ' + (e.message || 'Datei nicht lesbar.')); } };
      r.readAsText(f);
    };
    inp.click();
  }

  // ---------- Öffentliche API ----------
  const AppSync = {
    init(c) {
      cfg = c; app(); persist();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); else if (app().ts > app().synced) sync(); });
      window.addEventListener('online', () => sync());
      sync();
    },
    changed, open, sync,
    badge() { return connected() ? (status.k === 'err' ? '⚠️' : '☁️') : '☁️'; },
    _S: () => S
  };
  window.AppSync = AppSync;
  // Startseite ohne App: Sync-Link trotzdem annehmen
  if (location.hash.startsWith('#sync=')) { if (document.body) joinFromHash(); else document.addEventListener('DOMContentLoaded', joinFromHash); }
})();
