/* Projekt-Cockpit: Oberfläche (Teil 1: Grundgerüst, Cockpit, Projekte). Teil 2 steckt in app2.js. */
(() => {
  'use strict';
  const C = window.Core, ST = window.Store, $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = x => (Math.round(C.num(x) * 10) / 10).toLocaleString('de-DE');
  const f0 = x => Math.round(C.num(x)).toLocaleString('de-DE');
  const today = () => C.isoDate();
  const fdt = ts => ts ? new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
  const UI_KEY = 'projektCockpit.ui';
  const App = window.App = { C, $, esc, f1, f0, today, fdt };

  // ---------- Zustand ----------
  let S = C.empty();
  const UI = Object.assign({ view: 'home', pid: null, ptab: 'over', eid: null, back: null, q: '', show: 'active', pl: '', cons: '', src: '', sort: 'sev', theme: '', homeSev: '' }, (() => { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch (e) { return {}; } })());
  App.S = () => S; App.UI = UI;
  const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch (e) {} };
  let saveT = null, dirty = false, lastAuto = 0, savingFail = false;
  const tabId = C.uid(), bc = 'BroadcastChannel' in window ? new BroadcastChannel('projektCockpit') : null;

  // Jede Änderung läuft hierüber: zählen, verzögert speichern, gelegentlich interne Version anlegen
  function commit() { S.meta.changes = (S.meta.changes || 0) + 1; dirty = true; saveState('pending'); clearTimeout(saveT); saveT = setTimeout(flush, 400); headerState(); }
  // Speicherstatus wie in Google Docs: „Speichert …“ / „Gespeichert“ / Fehler
  function saveState(k) { const el = $('saveInd'); if (!el) return; el.dataset.k = k; el.textContent = { pending: '● Änderung', saving: '↻ Speichert …', ok: '✓ Gespeichert', err: '⚠ Nicht gespeichert' }[k] || ''; }
  async function flush() {
    clearTimeout(saveT); if (!dirty) return true;
    dirty = false; saveState('saving');
    const ok = await ST.save(S);
    if (!ok) { savingFail = true; banner('r', '⚠️ <b>Speichern fehlgeschlagen.</b> Der Browser verweigert den Speicher (voll oder privat?). Bitte sofort ein <b>Backup</b> herunterladen.'); }
    else if (savingFail) { savingFail = false; banner(); }
    saveState(ok ? 'ok' : 'err');
    if (ok && bc) bc.postMessage({ type: 'saved', tab: tabId, at: S.meta.savedAt });
    if (ok && Date.now() - lastAuto > 30 * 60000) { lastAuto = Date.now(); ST.addSnapshot('auto', 'Automatisch', S, C.pruneSnapshots); }
    headerState();
    return ok;
  }
  App.commit = commit; App.flush = flush;
  App.snapshot = (kind, label) => ST.addSnapshot(kind, label, S, C.pruneSnapshots);
  App.replaceState = async (next, label) => { await App.snapshot('vor ' + label, 'Vor: ' + label); S = C.normalize(next); dirty = true; await flush(); render(); };
  window.addEventListener('pagehide', () => { if (dirty) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) flush(); });
  if (bc) bc.onmessage = async e => {
    if (!e.data || e.data.type !== 'saved' || e.data.tab === tabId) return;
    if (dirty) { banner('y', '⚠️ In einem anderen Tab wurde ebenfalls gespeichert. Bitte nur in <b>einem</b> Tab arbeiten, sonst überschreiben sich Änderungen. <button class="sm" onclick="location.reload()">Neu laden</button>'); return; }
    const r = await ST.load(); if (r.state) { S = C.normalize(r.state); render(); toast('🔄 Stand aus anderem Tab übernommen'); }
  };
  window.addEventListener('unhandledrejection', e => banner('r', '⚠️ Ein Fehler ist aufgetreten: ' + esc(e.reason && e.reason.message || e.reason) + '. Deine Daten sind gespeichert.'));
  window.addEventListener('error', e => banner('r', '⚠️ Ein Fehler ist aufgetreten: ' + esc(e.message) + '. Deine Daten sind gespeichert. <button class="sm" onclick="location.reload()">Neu laden</button>'));

  // ---------- Hilfen ----------
  function banner(kind, html) { const b = $('banner'); if (!html) { b.className = 'note'; b.innerHTML = ''; return; } b.className = 'note on ' + kind; b.innerHTML = html; }
  let toastT;
  function toast(t, label, fn) {
    $('toastT').textContent = t; const b = $('toastB');
    if (label) { b.style.display = ''; b.textContent = label; b.onclick = () => { $('toast').classList.remove('on'); fn(); }; } else b.style.display = 'none';
    $('toast').classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => $('toast').classList.remove('on'), label ? 9000 : 2800);
  }
  let lastFocus = null;
  function sheet(html, wire) {
    if (!$('ov').classList.contains('on')) lastFocus = document.activeElement;
    $('sheet').innerHTML = html; $('ov').classList.add('on'); $('sheet').scrollTop = 0; wire && wire();
    const h = $('sheet').querySelector('h4'); if (h) { h.id = 'sheetTitle'; $('sheet').setAttribute('aria-labelledby', 'sheetTitle'); }
    // sofort fokussieren, sonst gehen schnell getippte Zeichen verloren
    const f = $('sheet').querySelector('[autofocus]') || $('sheet').querySelector('input, select, textarea, button'); if (f) f.focus();
  }
  function closeSheet() {
    if (!$('ov').classList.contains('on')) return;
    $('ov').classList.remove('on');
    // Fokus nie im unsichtbaren Dialog lassen: zurück zum Auslöser, sonst auf den Inhalt
    if ($('sheet').contains(document.activeElement)) document.activeElement.blur();
    const back = lastFocus && document.contains(lastFocus) && lastFocus !== document.body ? lastFocus : $('main');
    try { back.focus({ preventScroll: true }); } catch (e) {}
  }
  // Tab bleibt im offenen Dialog
  $('sheet').addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const F = [...$('sheet').querySelectorAll('a[href], button:not([disabled]), input, select, textarea, summary')].filter(x => x.offsetParent !== null);
    if (!F.length) return; const a = F[0], z = F[F.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  });
  $('ov').onclick = e => { if (e.target === $('ov')) closeSheet(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('ov').classList.contains('on')) closeSheet(); });
  async function copyText(t, msg) { try { await navigator.clipboard.writeText(t); toast(msg || '📋 Kopiert'); } catch (e) { sheet('<h4>Kopieren</h4><textarea id="cpT" rows="6">' + esc(t) + '</textarea><div class="acts"><button class="btn" id="cpX">Schließen</button></div>', () => { $('cpT').select(); $('cpX').onclick = closeSheet; }); } }
  Object.assign(App, { banner, toast, sheet, closeSheet, copyText });
  const byId = id => S.projects.find(p => p.id === id);
  App.byId = byId;
  const projFlags = p => C.flags(p, S.settings, today());
  const sevOrd = { r: 0, y: 1, g: 2 };
  const projSev = p => p.archived ? 'a' : (p.status === 'p' || p.status === 'd') ? p.status : C.severity(projFlags(p));
  App.projSev = projSev;
  const AVC = ['#4257e8', '#c2410c', '#0f766e', '#7c3aed', '#be185d', '#15803d', '#b45309', '#0369a1'];
  const avColor = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVC[h % AVC.length]; };
  // Kürzel-Bubble: PL gefüllt, Consultant umrandet
  const avatar = (name, role) => name ? '<span class="av' + (role === 'cons' ? ' o' : '') + '" style="--c:' + avColor(name) + '" title="' + (role === 'cons' ? 'Consultant' : 'Projektleiter') + ': ' + esc(name) + '">' + esc(C.initials(name)) + '</span>' : '';
  const people = p => p.wc ? '<span class="avs">' + avatar(p.wc.pl, 'pl') + (p.wc.cons && p.wc.cons !== p.wc.pl ? avatar(p.wc.cons, 'cons') : '') + '</span>' : '';
  const bCls = pct => pct > S.settings.budgetR ? 'r' : pct >= S.settings.budgetY ? 'y' : '';
  const budgetLine = b => '<div class="bl"><span>Rest <b class="' + bCls(b.pct) + '">' + f1(b.rest) + ' h</b> · ' + f0(b.restPct) + ' %</span><span class="muted">' + f1(b.used) + ' / ' + f1(b.plan) + ' h</span></div><div class="meter"><i class="' + bCls(b.pct) + '" style="width:' + Math.min(100, Math.max(0, b.pct)) + '%"></i></div>';
  const wcLink = p => { const u = C.weclappLink(S.settings.weclappUrl, p.nr || (p.wc && p.wc.nr)); return u ? '<a class="wl" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" title="In weclapp öffnen">↗ weclapp</a>' : ''; };
  Object.assign(App, { avatar, people, budgetLine });
  const statusTag = p => '<span class="tag">' + C.STATUS[p.status].ic + ' ' + C.STATUS[p.status].n + '</span>';

  // ---------- Navigation ----------
  const NAV_KEYS = ['view', 'pid', 'ptab', 'eid', 'back', 'cid'];
  function go(view, o, fromHistory) {
    Object.assign(UI, { view }, o || {}); saveUI();
    // Browser-Zurück/Vorwärts unterstützen
    if (!fromHistory) { const st = {}; NAV_KEYS.forEach(k => st[k] = UI[k]); try { history.pushState(st, ''); } catch (e) {} }
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', e => { if (e.state && e.state.view) { closeSheet(); go(e.state.view, e.state, true); } });
  App.go = go;
  document.querySelectorAll('#nav button[data-v]').forEach(b => b.onclick = () => b.dataset.v === 'more' ? moreSheet() : go(b.dataset.v, { pid: null, eid: null }));
  const TITLES = { home: 'Cockpit', report: 'Bericht', projects: 'Projekte', customers: 'Kunden', customer: 'Kunde', plan: 'Backlog & Planung', estimates: 'Schätzungen & Chancen', estimate: 'Schätzung', tools: 'Werkzeuge', data: 'Daten', changes: 'Änderungen' };
  const PARENT = { project: 'projects', estimate: 'estimates', customer: 'customers' };
  // Handy: weitere Bereiche über „Mehr“
  function moreSheet() {
    const L = [['report', '📊', 'Bericht', 'Montags-Überblick, Reports'], ['estimates', '🧮', 'Schätzungen & Chancen', 'PERT, Angebote, Chancen'], ['changes', '🕘', 'Änderungen', 'Import- und eigene Änderungen'], ['tools', '🛠', 'Werkzeuge', 'Kapazität, Prognose'], ['data', '💾', 'Daten', 'Backup, Import, Einstellungen']];
    sheet('<h4>Mehr</h4><div class="list">' + L.map(([v, i, n, d]) => '<button class="it" data-mv="' + v + '" style="width:100%;text-align:left"><span style="font-size:20px">' + i + '</span><div class="t"><b>' + n + '</b><small>' + d + '</small></div></button>').join('') + '</div>', () => {
      $('sheet').querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { closeSheet(); go(b.dataset.mv, { pid: null, eid: null }); });
    });
  }
  function render() {
    const pp = UI.view === 'project' && byId(UI.pid);
    document.title = (pp ? pp.name : TITLES[UI.view] || 'Cockpit') + ' – Projekt-Cockpit';
    const cur = PARENT[UI.view] || UI.view, inMore = ['report', 'estimates', 'changes', 'tools', 'data'].includes(cur);
    document.querySelectorAll('#nav button[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === cur || (b.dataset.v === 'more' && inMore)));
    headerState();
    const V = { home, projects, project, customers: () => App.customersView(), customer: () => App.customerView(), plan: () => App.planView(), report: () => App.reportView(), estimates: () => App.estimatesView(), estimate: () => App.estimateEditor(), tools: () => App.toolsView(), data: () => App.dataView(), changes: () => App.changesView() };
    try { (V[UI.view] || home)(); } catch (e) { console.error(e); $('view').innerHTML = '<div class="note r">Diese Ansicht konnte nicht angezeigt werden: ' + esc(e.message) + '<br><button class="btn sec" onclick="App.go(\'home\')">Zum Cockpit</button></div>'; }
  }
  App.render = render;
  function headerState() {
    const lb = S.meta.lastBackup, age = lb ? C.daysBetween(lb.slice(0, 10), today()) : null, has = S.projects.length > 0;
    const col = !has ? 'var(--n)' : lb == null || lb === '' ? 'var(--r)' : age >= S.settings.backupDays ? 'var(--y)' : S.meta.changes > 0 ? 'var(--y)' : 'var(--g)';
    $('backupDot').style.background = col;
    $('backupBtn').title = lb ? 'Letztes Backup: ' + fdt(lb) + (S.meta.changes ? ' · seitdem ' + S.meta.changes + ' Änderungen' : '') : 'Noch kein Backup erstellt';
    const red = S.projects.filter(p => C.isActive(p) && projSev(p) === 'r').length, nb = $('navBadge');
    nb.style.display = red ? '' : 'none'; nb.textContent = red;
    $('navFoot').innerHTML = '🔒 Daten nur in diesem Browser<br>' + (ST.status.lastSave ? 'Gespeichert ' + new Date(ST.status.lastSave).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'Noch nicht gespeichert') + (lb ? '<br>Backup: ' + fdt(lb) : '<br><b style="color:var(--r)">Noch kein Backup</b>');
  }
  App.headerState = headerState;
  $('newProjBtn').onclick = () => newProjectSheet();
  $('backupBtn').onclick = () => App.doBackup();
  $('localBadge').onclick = () => App.storageInfo();
  const applyTheme = () => { const t = UI.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); document.documentElement.dataset.theme = t; };
  $('themeBtn').onclick = () => { UI.theme = (document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark'; saveUI(); applyTheme(); };
  applyTheme();

  // ---------- Cockpit ----------
  function home() {
    if (!S.projects.length) return firstRun();
    const act = S.projects.filter(C.isActive), F = C.focusItems(S, today()), hs = UI.homeSev;
    const sev = act.map(p => ({ p, f: projFlags(p), s: projSev(p) }));
    const red = sev.filter(x => x.s === 'r'), yel = sev.filter(x => x.s === 'y');
    // Kachel-Filter Rot/Gelb wirkt auf alle Listen im Cockpit
    const inSel = p => !hs || projSev(p) === hs, selP = act.filter(inSel);
    const fod = F.od.filter(x => inSel(x.p)), fwk = F.wk.filter(x => inSel(x.p)), fnx = F.nx.filter(x => inSel(x.p));
    const openEst = S.estimates.filter(e => e.status === 'draft' || e.status === 'offered').length;
    const bt = C.budgetTotals(selP);
    let h = '<h2>Guten ' + (new Date().getHours() < 11 ? 'Morgen' : new Date().getHours() < 18 ? 'Tag' : 'Abend') + (S.me ? ', ' + esc(S.me.split(' ')[0]) : '') + '<span class="sp"></span><button class="sm" id="rvBtn">🔁 Wochenreview</button><button class="sm" data-go="report">📊 Bericht</button></h2>';
    const lb = S.meta.lastBackup, age = lb ? C.daysBetween(lb.slice(0, 10), today()) : null;
    if (C.reportDue(S, today()) && (C.isMonday(today()) || !S.meta.lastReport)) h += '<div class="note">📊 <b>' + (C.isMonday(today()) ? 'Montag:' : 'Tipp:') + '</b> Der Wochen-Überblick für die Firma ist in einer Minute fertig. <button class="sm pri" id="repNow">Bericht erstellen</button></div>';
    if (!lb || age >= S.settings.backupDays) h += '<div class="note y">💾 ' + (lb ? 'Letztes Backup vor ' + age + ' Tagen.' : 'Du hast noch kein Backup erstellt.') + ' Ein Klick sichert alles als Datei. <button class="sm pri" id="bkNow">Backup jetzt</button></div>';
    if (act.length > S.settings.wip) h += '<div class="note y">⚠️ <b>' + act.length + ' aktive Projekte</b> bei einem Limit von ' + S.settings.wip + '. Pausiere oder schließe etwas ab, sonst leidet der Fokus.</div>';
    h += '<div class="kpis"><div class="kpi"><b>' + act.length + '</b><span>aktive Projekte</span></div>' +
      '<button class="kpi fk' + (hs === 'r' ? ' on' : '') + '" data-hs="r" aria-pressed="' + (hs === 'r') + '"><b style="color:var(--r)">' + red.length + '</b><span>rot · Filter</span></button>' +
      '<button class="kpi fk' + (hs === 'y' ? ' on' : '') + '" data-hs="y" aria-pressed="' + (hs === 'y') + '"><b style="color:var(--y)">' + yel.length + '</b><span>gelb · Filter</span></button>' +
      '<div class="kpi"><b style="color:' + (fod.length ? 'var(--r)' : 'inherit') + '">' + fod.length + '</b><span>überfällige Aufgaben</span></div><div class="kpi"><b>' + fwk.length + '</b><span>fällig in 7 Tagen</span></div><button class="kpi fk" data-go="estimates"><b>' + openEst + '</b><span>offene Schätzungen · ' + S.estimates.filter(C.isChance).length + ' Chancen</span></button></div>';
    if (hs) h += '<div class="note ' + hs + '" id="hsBar">Filter aktiv: nur <b>' + (hs === 'r' ? 'rote' : 'gelbe') + '</b> Projekte (' + selP.length + '). <button class="sm" id="hsReset">✕ Filter zurücksetzen</button></div>';
    const att = (hs ? sev.filter(x => x.s === hs) : red.concat(yel)).sort((a, b) => sevOrd[a.s] - sevOrd[b.s] || a.p.prio - b.p.prio).slice(0, 15);
    const budP = selP.map(p => ({ p, b: C.budget(p) })).filter(x => x.b).sort((a, b) => a.b.restPct - b.b.restPct);
    h += '<div class="cols"><div><div class="panel"><h3>🔥 Braucht Aufmerksamkeit<span class="sp"></span><span class="cnt">' + att.length + '</span></h3>' +
      (att.length ? '<div class="list">' + att.map(x => '<div class="it" data-open="' + x.p.id + '" style="cursor:pointer"><span class="tag ' + x.s + '">' + (x.s === 'r' ? 'Rot' : 'Gelb') + '</span><div class="t"><b>' + esc(x.p.name) + '</b><small>' + x.f.filter(f => f.s !== 'n').slice(0, 3).map(f => esc(f.t)).join(' · ') + '</small></div>' + people(x.p) + '</div>').join('') + '</div>'
        : '<div class="note g">✅ Keine Auffälligkeiten. Alles läuft ruhig.</div>') + '</div>' +
      '<div class="panel" id="budgetPanel"><h3>💶 Budget' + (hs ? ' (gefiltert)' : ' aller aktiven Projekte') + '<span class="sp"></span><span class="cnt">' + bt.count + '</span></h3>' +
      (bt.count ? '<div class="res" style="margin-bottom:10px"><div><b>' + f0(bt.plan) + ' h</b><span>Budget gesamt</span></div><div><b>' + f0(bt.used) + ' h</b><span>verbraucht (' + f0(bt.pct) + ' %)</span></div><div class="hl"><b id="budgetRest">' + f0(bt.rest) + ' h · ' + f0(bt.restPct) + ' %</b><span>Restbudget' + (bt.over ? ' · ' + bt.over + ' Projekt(e) überzogen' : '') + '</span></div></div>' +
        '<div class="list">' + budP.map(x => '<div class="it" data-open="' + x.p.id + '" style="cursor:pointer;display:block"><div style="display:flex;gap:8px;align-items:center"><b style="flex:1;min-width:0;font-size:14px">' + esc(x.p.name) + '</b>' + people(x.p) + '</div>' + budgetLine(x.b) + '</div>').join('') + '</div>'
        : '<div class="help">Keine Projekte mit Budget aus weclapp.</div>') + '</div></div>' +
      '<div><div class="panel"><h3>⏰ Fällige Aufgaben</h3><div class="list">' +
      (fod.length + fwk.length ? fod.concat(fwk).slice(0, 20).map(x => '<div class="it"><button class="ck" data-ck="' + x.p.id + '|' + x.t.id + '" aria-label="Erledigt"></button><div class="t">' + esc(x.t.t) + '<small style="color:' + (x.d < 0 ? 'var(--r)' : 'inherit') + '">' + esc(x.p.name) + ' · ' + (x.d < 0 ? 'seit ' + (-x.d) + ' T überfällig' : x.d === 0 ? 'heute' : 'in ' + x.d + ' T') + '</small></div></div>').join('') : '<div class="help">Nichts fällig in den nächsten 7 Tagen.</div>') + '</div></div>' +
      '<div class="panel"><h3>➜ Nächste Schritte<span class="sp"></span><span class="cnt">' + fnx.length + '</span></h3><div class="list">' +
      (fnx.length ? fnx.slice(0, 15).map(x => '<div class="it"><button class="ck" data-nx="' + x.p.id + '" title="Erledigt" aria-label="Erledigt"></button><div class="t" data-open="' + x.p.id + '" style="cursor:pointer">' + esc(x.p.next) + '<small>' + esc(x.p.name) + '</small></div></div>').join('') : '<div class="help">Keine nächsten Schritte festgelegt.</div>') + '</div></div>' +
      planPanel() + ideasPanel() + '</div></div>';
    $('view').innerHTML = h;
    wireIdeas();
    if ($('bkNow')) $('bkNow').onclick = () => App.doBackup();
    if ($('repNow')) $('repNow').onclick = () => go('report');
    $('view').querySelectorAll('[data-go]').forEach(el => el.onclick = () => go(el.dataset.go));
    $('rvBtn').onclick = review;
    $('view').querySelectorAll('[data-hs]').forEach(b => b.onclick = () => { UI.homeSev = UI.homeSev === b.dataset.hs ? '' : b.dataset.hs; saveUI(); home(); });
    if ($('hsReset')) $('hsReset').onclick = () => { UI.homeSev = ''; saveUI(); home(); };
    $('view').querySelectorAll('[data-open]').forEach(el => el.onclick = () => go('project', { pid: el.dataset.open, ptab: 'over' }));
    $('view').querySelectorAll('[data-ck]').forEach(b => b.onclick = () => { const [pid, tid] = b.dataset.ck.split('|'), p = byId(pid), t = p.tasks.find(x => x.id === tid); t.done = true; log(p, '✔ ' + t.t); touch(p); render(); toast('✔ Erledigt', 'Rückgängig', () => { t.done = false; touch(p); render(); }); });
    $('view').querySelectorAll('[data-nx]').forEach(b => b.onclick = () => nextDone(byId(b.dataset.nx)));
  }
  function firstRun() {
    const legacy = App.legacyAvailable();
    $('view').innerHTML = '<div class="panel" style="max-width:720px"><div class="empty" style="padding:16px 0"><div class="e">📋</div></div><h3>Willkommen im Projekt-Cockpit</h3>' +
      '<p class="help" style="font-size:14px">Deine kleine Projektmanagement-Suite: Projekte mit Ampel und nächstem Schritt, Aufgaben, Risiken, Schätzungen (PERT, User Stories) und der Import deiner weclapp-Projektliste. <b>Alle Daten bleiben ausschließlich in diesem Browser.</b> Über 💾 sicherst du sie jederzeit als Datei.</p>' +
      '<div class="bar"><button class="btn" id="fr1">📥 weclapp-Export importieren</button><button class="btn sec" id="fr2">＋ Projekt von Hand anlegen</button>' + (legacy ? '<button class="btn sec" id="fr3">🔁 Aus Projekt-Radar / PM-Rechner übernehmen</button>' : '') + '<button class="btn sec" id="fr4">📂 Backup einspielen</button></div></div>';
    $('fr1').onclick = () => $('fileImport').click(); $('fr2').onclick = () => newProjectSheet(); $('fr4').onclick = () => $('fileRestore').click();
    if ($('fr3')) $('fr3').onclick = () => App.migrateLegacy();
  }
  // Team-Plan „Jetzt“ auf dem Cockpit
  function planPanel() {
    const L = S.backlog.filter(x => x.slot === 'now'); if (!L.length && !S.backlog.length) return '';
    return '<div class="panel"><h3>🔥 Team – Jetzt<span class="sp"></span><button class="sm" data-go="plan">Planung ›</button></h3><div class="list">' + (L.length ? L.slice(0, 8).map(x => '<div class="it"><div class="t">' + esc(x.t) + '<small>' + esc(C.blScopeLabel(S, x)) + '</small></div>' + (x.who ? avatar(x.who, 'pl') : '') + '</div>').join('') : '<div class="help">Im „Jetzt“ ist nichts geplant.</div>') + '</div></div>';
  }
  function ideasPanel() {
    return '<div class="panel"><h3>💡 Ideen-Parkplatz<span class="sp"></span><span class="cnt">' + S.ideas.length + '</span></h3><div class="row" style="margin-bottom:6px"><input id="ideaIn" placeholder="Später vielleicht … (Enter)"></div><div class="list">' +
      S.ideas.map(i => '<div class="it"><div class="t">' + esc(i.t) + '</div><button class="sm" data-ib="' + i.id + '" title="Ins Backlog">→ Backlog</button><button class="sm" data-ip="' + i.id + '">→ Projekt</button><button class="x" data-ix="' + i.id + '" aria-label="Löschen">✕</button></div>').join('') + '</div></div>';
  }
  function wireIdeas() {
    const inp = $('ideaIn'); if (!inp) return;
    inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim()) { S.ideas.unshift({ id: C.uid(), t: inp.value.trim() }); commit(); render(); $('ideaIn').focus(); } };
    $('view').querySelectorAll('[data-ix]').forEach(b => b.onclick = () => { S.ideas = S.ideas.filter(i => i.id !== b.dataset.ix); commit(); render(); });
    $('view').querySelectorAll('[data-ib]').forEach(b => b.onclick = () => { const i = S.ideas.find(x => x.id === b.dataset.ib); S.backlog.push(C.newBacklogItem({ t: i.t })); S.ideas = S.ideas.filter(x => x !== i); commit(); render(); toast('🗂 Ins Backlog übernommen'); });
    $('view').querySelectorAll('[data-ip]').forEach(b => b.onclick = () => { const i = S.ideas.find(x => x.id === b.dataset.ip); newProjectSheet({ name: i.t }, () => { S.ideas = S.ideas.filter(x => x !== i); }); });
  }
  function nextDone(p) {
    const old = p.next; log(p, '✔ ' + old); track(p, 'next', old, ''); C.setNext(p, ''); touch(p); render();
    sheet('<h4>Nächster Schritt für „' + esc(p.name) + '“?</h4><input id="nxIn" autofocus placeholder="Was passiert als Nächstes?"><div class="acts"><button class="btn sec" id="nxL">Später</button><button class="btn" id="nxOk">Speichern</button></div>', () => {
      $('nxL').onclick = closeSheet; const ok = () => { const v = $('nxIn').value.trim(); track(p, 'next', p.next, v); C.setNext(p, v); touch(p); closeSheet(); render(); };
      $('nxOk').onclick = ok; $('nxIn').onkeydown = e => { if (e.key === 'Enter') ok(); };
    });
  }
  function review() {
    const list = S.projects.filter(C.isActive).sort((a, b) => a.updated.localeCompare(b.updated)); let i = 0;
    if (!list.length) return toast('Keine aktiven Projekte');
    const step = () => {
      if (i >= list.length) { S.meta.lastReview = today(); commit(); closeSheet(); render(); return toast('✅ Review abgeschlossen'); }
      const p = list[i], fl = projFlags(p); let st = p.status;
      sheet('<div class="help">Review ' + (i + 1) + ' von ' + list.length + '</div><h4>' + esc(p.name) + '</h4>' + (fl.length ? '<div class="help">' + fl.map(f => esc(f.t)).join(' · ') + '</div>' : '') +
        '<div class="chips" id="rvS" style="margin-bottom:10px">' + Object.entries(C.STATUS).map(([k, v]) => '<button data-k="' + k + '" class="' + (k === st ? 'on' : '') + '">' + v.ic + ' ' + v.n + '</button>').join('') + '</div>' +
        '<label class="f"><span>Nächster Schritt</span><input id="rvN" value="' + esc(p.next) + '" autofocus></label>' +
        '<div class="acts"><button class="btn sec" id="rvX">Beenden</button><button class="btn sec" id="rvO">Projekt öffnen</button><button class="btn" id="rvOk">Weiter ›</button></div>', () => {
        $('rvS').querySelectorAll('button').forEach(b => b.onclick = () => { st = b.dataset.k; $('rvS').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
        $('rvX').onclick = () => { closeSheet(); render(); };
        $('rvO').onclick = () => { closeSheet(); go('project', { pid: p.id, ptab: 'over' }); };
        $('rvOk').onclick = () => { if (st !== p.status) { track(p, 'status', p.status, st); p.status = st; } const v = $('rvN').value.trim(); track(p, 'next', p.next, v); C.setNext(p, v); touch(p); i++; step(); };
      });
    };
    step();
  }

  // ---------- Projekte ----------
  const log = (p, t) => p.log.push({ d: today(), t, src: '' });
  const track = (p, k, from, to) => C.recordChange(p, k, from, to);
  App.track = track;
  const touch = p => { p.updated = today(); commit(); };
  App.log = log; App.touch = touch;
  function newProjectSheet(pre, after) {
    const o = Object.assign({ name: '', kunde: '', prio: 2, due: '', next: '' }, pre || {});
    sheet('<h4>＋ Neues Projekt</h4><div class="row"><label class="f"><span>Name *</span><input id="npN" value="' + esc(o.name) + '" autofocus></label><label class="f"><span>Kunde</span><input id="npK" value="' + esc(o.kunde) + '"></label></div>' +
      '<div class="row"><label class="f"><span>Priorität</span><select id="npP"><option value="1">★★★ Hoch</option><option value="2" selected>★★ Mittel</option><option value="3">★ Niedrig</option></select></label><label class="f"><span>Termin</span><input type="date" id="npD" value="' + esc(o.due) + '"></label></div>' +
      '<label class="f"><span>Nächster Schritt</span><input id="npX" placeholder="Was passiert als Erstes?"></label><p class="help" style="margin-top:8px">Projekte aus weclapp kommen am einfachsten über 💾 Daten → weclapp-Import.</p>' +
      '<div class="acts"><button class="btn sec" id="npC">Abbrechen</button><button class="btn" id="npOk">Anlegen</button></div>', () => {
      $('npC').onclick = closeSheet;
      $('npOk').onclick = () => {
        const n = $('npN').value.trim(); if (!n) return $('npN').focus();
        const p = C.newProject({ name: n, kunde: $('npK').value.trim(), prio: +$('npP').value, due: $('npD').value, next: $('npX').value.trim() }, today());
        S.projects.push(p); after && after(); commit(); closeSheet(); go('project', { pid: p.id, ptab: 'over' });
      };
    });
  }
  App.newProjectSheet = newProjectSheet;
  function projects() {
    const li = S.meta.lastImport && S.meta.lastImport.id, q = C.normTxt(UI.q), uniq = k => [...new Set(S.projects.map(p => p.wc && p.wc[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')), pls = uniq('pl'), conss = uniq('cons');
    let L = S.projects.filter(p => {
      if (UI.show === 'active' && !C.isActive(p)) return false;
      if (UI.show === 'paused' && (p.status !== 'p' || p.archived)) return false;
      if (UI.show === 'done' && (p.status !== 'd' || p.archived)) return false;
      if (UI.show === 'archived' && !p.archived) return false;
      if (UI.show === 'missing' && !(p.wc && p.wc.missingSince)) return false;
      if (UI.show === 'changed' && !(li && p.wc && (p.wc.imp === li || p.wc.newImp === li))) return false;
      if (UI.pl === '__me' ? !(S.me && p.wc && p.wc.pl === S.me) : UI.pl && !(p.wc && p.wc.pl === UI.pl)) return false;
      if (UI.cons === '__me' ? !(S.me && p.wc && p.wc.cons === S.me) : UI.cons && !(p.wc && p.wc.cons === UI.cons)) return false;
      if (UI.src === 'wc' && !p.wc) return false; if (UI.src === 'own' && p.wc) return false;
      if (UI.kd && C.custKey(p.kunde) !== UI.kd) return false;
      if (q && !C.normTxt([p.name, p.kunde, p.nr, p.next, p.notes, p.wc && p.wc.cons, p.wc && p.wc.phase].join(' ')).includes(q)) return false;
      return true;
    });
    const sorts = { sev: (a, b) => sevOrd[projSev(a)] - sevOrd[projSev(b)] || a.prio - b.prio || a.name.localeCompare(b.name), name: (a, b) => a.name.localeCompare(b.name), due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999'), upd: (a, b) => b.updated.localeCompare(a.updated) };
    L.sort((a, b) => (b.pinned - a.pinned) || (sorts[UI.sort] || sorts.sev)(a, b));
    const cnt = k => S.projects.filter(p => k === 'changed' ? li && p.wc && (p.wc.imp === li || p.wc.newImp === li) : k === 'missing' ? p.wc && p.wc.missingSince : k === 'archived' ? p.archived : !p.archived && (k === 'active' ? C.isActive(p) : k === 'paused' ? p.status === 'p' : k === 'done' ? p.status === 'd' : true)).length;
    const kds = C.customers(S, today()).filter(c => c.projects.length);
    let h = '<div class="ph"><div><h2>Projekte</h2><p class="sub">Alle Aufträge mit Ampel, Phase, nächstem Schritt und Budget. Filter wirken auch auf die Kundenliste.</p></div><span class="sp"></span>' +
      '<div class="seg" role="group" aria-label="Darstellung"><button id="pvC" class="' + (UI.pview !== 'table' ? 'on' : '') + '" aria-pressed="' + (UI.pview !== 'table') + '">▦ Karten</button><button id="pvT" class="' + (UI.pview === 'table' ? 'on' : '') + '" aria-pressed="' + (UI.pview === 'table') + '">☰ Tabelle</button></div>' +
      '<button class="sm" id="clBtn">📤 Kundenliste</button><button class="sm" id="impBtn">📥 weclapp-Import</button></div>' +
      '<div class="panel"><div class="row" style="margin-bottom:8px"><label class="f" style="flex:2"><span>Suche</span><input id="pq" value="' + esc(UI.q) + '" placeholder="Name, Kunde, Auftragsnr., Notizen …"></label>' +
      '<label class="f"><span>Projektleiter</span><select id="ppl"><option value="">Alle</option>' + (S.me ? '<option value="__me"' + (UI.pl === '__me' ? ' selected' : '') + '>Meine (' + esc(S.me) + ')</option>' : '') + pls.map(n => '<option' + (UI.pl === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></label>' +
      '<label class="f"><span>Consultant</span><select id="pcons"><option value="">Alle</option>' + (S.me ? '<option value="__me"' + (UI.cons === '__me' ? ' selected' : '') + '>Ich (' + esc(S.me) + ')</option>' : '') + conss.map(n => '<option' + (UI.cons === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></label>' +
      '<label class="f"><span>Kunde</span><select id="pkd"><option value="">Alle</option>' + kds.map(c => '<option value="' + esc(c.key) + '"' + (UI.kd === c.key ? ' selected' : '') + '>' + esc(c.n) + '</option>').join('') + '</select></label>' +
      '<label class="f"><span>Quelle</span><select id="psrc"><option value="">Alle</option><option value="wc"' + (UI.src === 'wc' ? ' selected' : '') + '>aus weclapp</option><option value="own"' + (UI.src === 'own' ? ' selected' : '') + '>eigene</option></select></label>' +
      '<label class="f"><span>Sortierung</span><select id="psort">' + [['sev', 'Ampel'], ['name', 'Name'], ['due', 'Termin'], ['upd', 'Zuletzt geändert']].map(([k, n]) => '<option value="' + k + '"' + (UI.sort === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label></div>' +
      '<div class="chips">' + [['active', 'Aktiv'], ['paused', 'Pausiert'], ['done', 'Fertig'], ['changed', '✎ Letzter Import'], ['missing', 'Nicht mehr in weclapp'], ['archived', 'Archiv'], ['all', 'Alle']].map(([k, n]) => '<button data-sh="' + k + '" class="' + (UI.show === k ? 'on' : '') + '">' + n + ' ' + cnt(k) + '</button>').join('') + '</div></div>';
    h += !L.length ? '<div class="empty"><div class="e">📁</div>Keine Projekte in dieser Ansicht.</div>' : UI.pview === 'table' ? table(L) : '<div class="grid">' + L.map(card).join('') + '</div>';
    $('view').innerHTML = h;
    const qi = $('pq'); qi.oninput = () => { UI.q = qi.value; saveUI(); const p = qi.selectionStart; projects(); const n = $('pq'); n.focus(); n.setSelectionRange(p, p); };
    $('ppl').onchange = e => { UI.pl = e.target.value; saveUI(); projects(); };
    $('pcons').onchange = e => { UI.cons = e.target.value; saveUI(); projects(); };
    $('psrc').onchange = e => { UI.src = e.target.value; saveUI(); projects(); };
    $('pkd').onchange = e => { UI.kd = e.target.value; saveUI(); projects(); };
    $('pvC').onclick = () => { UI.pview = 'cards'; saveUI(); projects(); }; $('pvT').onclick = () => { UI.pview = 'table'; saveUI(); projects(); };
    $('clBtn').onclick = () => App.custListSheet(L, UI.kd ? 'Projektübersicht ' + ((kds.find(c => c.key === UI.kd) || {}).n || '') : 'Projektübersicht');
    $('view').querySelectorAll('tr[data-id]').forEach(tr => { const o = () => go('project', { pid: tr.dataset.id, ptab: 'over' }); tr.onclick = e => { if (!e.target.closest('a')) o(); }; tr.onkeydown = e => { if (e.key === 'Enter') o(); }; });
    $('psort').onchange = e => { UI.sort = e.target.value; saveUI(); projects(); };
    $('impBtn').onclick = () => $('fileImport').click();
    $('view').querySelectorAll('[data-sh]').forEach(b => b.onclick = () => { UI.show = b.dataset.sh; saveUI(); projects(); });
    wireCards($('view'));
  }
  // Portfolio-Tabelle für den Multiprojektleiter: alles Wichtige in einer Zeile
  function table(L) {
    return '<div class="panel tw"><table class="t pt"><thead><tr><th></th><th>Projekt</th><th>Kunde</th><th>Phase</th><th>Team</th><th>Nächster Schritt</th><th class="n">Rest</th><th class="n">Aufgaben</th></tr></thead><tbody>' +
      L.map(p => { const sv = projSev(p), b = C.budget(p), open = p.tasks.filter(t => !t.done).length, od = p.tasks.filter(t => !t.done && t.due && t.due < today()).length;
        return '<tr data-id="' + p.id + '" tabindex="0" class="sv-' + sv + '"><td><span class="sdot ' + sv + '" title="' + esc(projFlags(p).filter(f => f.s !== 'n').map(f => f.t).join(' · ') || C.STATUS[p.status].n) + '"></span></td><td><b>' + (p.pinned ? '📌 ' : '') + esc(p.name) + '</b><small>' + esc([p.nr, C.STATUS[p.status].n].filter(Boolean).join(' · ')) + '</small></td><td>' + esc(p.kunde) + '</td><td>' + esc(C.phaseName(p)) + '</td><td>' + people(p) + '</td><td>' + (p.next ? esc(p.next) : '<span class="muted">–</span>') + '</td>' +
          '<td class="n">' + (b ? '<b class="' + bCls(b.pct) + '">' + f0(b.restPct) + ' %</b><small>' + f0(b.rest) + ' h</small>' : '–') + '</td><td class="n">' + open + (od ? ' <span class="tag r">' + od + ' ⏰</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function card(p) {
    const fl = projFlags(p).filter(f => f.s !== 'n'), sv = projSev(p), w = p.wc, pr = C.progress(p), b = C.budget(p);
    const li = S.meta.lastImport && S.meta.lastImport.id, mark = li && w ? (w.newImp === li ? '<span class="tag new">🆕 neu</span>' : w.imp === li ? '<span class="tag chg" title="' + esc(lastChanges(p, li)) + '">✎ geändert</span>' : '') : '';
    return '<div class="card ' + sv + '" data-id="' + p.id + '" role="button" tabindex="0" aria-label="' + esc(p.name) + '"><div class="h"><b>' + (p.pinned ? '📌 ' : '') + esc(p.name) + '</b>' + mark + people(p) + '</div>' +
      '<div class="sub">' + [statusTag(p), p.nr ? esc(p.nr) : '', C.phaseName(p) ? esc(C.phaseName(p)) : '', p.due ? '🏁 ' + C.fmtD(p.due) : '', wcLink(p)].filter(Boolean).join(' · ') + '</div>' +
      (p.next ? '<div class="nx">➜ ' + esc(p.next) + '</div>' : C.isActive(p) ? '<div class="nx none">Kein nächster Schritt</div>' : '') +
      (b ? budgetLine(b) : pr != null ? '<div class="meter" title="Aufgaben ' + pr + ' %"><i style="width:' + pr + '%"></i></div>' : '') +
      (fl.length ? '<div class="fl">' + fl.slice(0, 3).map(f => '<span class="tag ' + f.s + '">' + esc(f.t) + '</span>').join('') + (fl.length > 3 ? '<span class="tag">+' + (fl.length - 3) + '</span>' : '') + '</div>' : '') + '</div>';
  }
  App.card = card; App.wireCards = r => wireCards(r);
  const lastChanges = (p, imp) => p.hist.filter(e => e.imp === imp && e.k !== '_created').map(C.histText).join('\n');
  // Karten sind divs (damit der weclapp-Link darin gültig ist): Klick und Enter öffnen das Projekt
  function wireCards(root) {
    root.querySelectorAll('.card[data-id]').forEach(c => {
      const openIt = () => go('project', { pid: c.dataset.id, ptab: 'over' });
      c.onclick = e => { if (!e.target.closest('a')) openIt(); };
      c.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); openIt(); } };
    });
  }

  // ---------- Projekt-Detail ----------
  function project() {
    const p = byId(UI.pid); if (!p) return go('projects');
    const T = [['over', 'Überblick'], ['tasks', (p.phases.length ? 'Plan' : 'Aufgaben') + ' (' + p.tasks.filter(t => !t.done).length + ')'], ['est', 'Schätzungen (' + S.estimates.filter(e => e.pid === p.id).length + ')'], ['risks', 'Risiken (' + p.risks.length + ')'], ['log', 'Verlauf & Notizen']];
    $('view').innerHTML = '<div class="bar"><button class="sm" id="pBack">‹ Projekte</button></div><h2>' + esc(p.name) + ' ' + statusTag(p) + people(p) + '<span class="sp"></span>' + (p.kunde ? '<button class="sm" id="pCu" title="Kundensicht öffnen">🏢 ' + esc(p.kunde) + '</button>' : '') + (wcLink(p) ? wcLink(p).replace('class="wl"', 'class="sm"') : '') + '<button class="sm" id="pPin">' + (p.pinned ? '📌 Angeheftet' : '📌 Anheften') + '</button></h2>' +
      '<div class="tabs">' + T.map(([k, n]) => '<button data-pt="' + k + '" class="' + (UI.ptab === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div><div id="pBody"></div>';
    $('pBack').onclick = () => go('projects');
    $('pPin').onclick = () => { p.pinned = !p.pinned; touch(p); project(); };
    if ($('pCu')) $('pCu').onclick = () => go('customer', { cid: C.custKey(p.kunde) });
    $('view').querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { UI.ptab = b.dataset.pt; saveUI(); project(); });
    ({ over: pOver, tasks: pTasks, est: pEst, risks: pRisks, log: pLog })[UI.ptab in { over: 1, tasks: 1, est: 1, risks: 1, log: 1 } ? UI.ptab : 'over'](p);
  }
  function pOver(p) {
    const fl = projFlags(p), w = p.wc;
    let h = '<div class="cols"><div><div class="panel"><h3>Stammdaten</h3><div class="row"><label class="f" style="flex:2"><span>Name</span><input id="oN" value="' + esc(p.name) + '"></label><label class="f"><span>Kunde</span><input id="oK" value="' + esc(p.kunde) + '"></label></div>' +
      '<div class="f" style="margin-bottom:10px"><span>Status</span><div class="chips" id="oS">' + Object.entries(C.STATUS).map(([k, v]) => '<button data-k="' + k + '" class="' + (p.status === k ? 'on' : '') + '">' + v.ic + ' ' + v.n + '</button>').join('') + '</div></div>' +
      '<div class="row"><label class="f"><span>Priorität</span><select id="oP">' + [[1, '★★★ Hoch'], [2, '★★ Mittel'], [3, '★ Niedrig']].map(([k, n]) => '<option value="' + k + '"' + (p.prio === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label><label class="f"><span>Mein Termin</span><input type="date" id="oD" value="' + esc(p.due) + '"></label></div>' +
      '<label class="f"><span>➜ Nächster Schritt</span><input id="oX" value="' + esc(p.next) + '" placeholder="Was ist der nächste konkrete Schritt?"></label>' +
      (w ? '<div class="help" id="oXh" style="margin:4px 0 0">' + nextHint(p) + '</div>' : '') + '</div>' +
      (w && p.status !== 'd' && fl.some(f => /In weclapp abgeschlossen/.test(f.t)) ? '<div class="note g">✅ In weclapp ist dieses Projekt abgeschlossen. <button class="sm pri" id="oClose">Hier auch abschließen</button></div>' : '') +
      (fl.length ? '<div class="panel"><h3>Hinweise</h3>' + fl.map(f => '<div class="note ' + (f.s === 'n' ? '' : f.s) + '" style="margin-bottom:6px;padding:7px 10px">' + esc(f.t) + '</div>').join('') + '</div>' : '<div class="note g">✅ Keine Auffälligkeiten.</div>') + '</div><div>';
    if (w) {
      const ap = w.plan > 0 && w.istab != null ? w.istab / w.plan * 100 : null, gp = w.plan > 0 && w.ist != null ? w.ist / w.plan * 100 : null;
      const tp = w.start && w.ende && w.ende > w.start ? Math.max(0, Math.min(100, C.daysBetween(w.start, today()) / C.daysBetween(w.start, w.ende) * 100)) : null;
      const A = C.parseAkt(w.akt, today());
      h += '<div class="panel"><h3>🔗 weclapp<span class="sp"></span>' + wcLink(p) + ' <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:600">Stand ' + fdt(w.importedAt) + '</span></h3>' +
        (w.missingSince ? '<div class="note y">Seit ' + C.fmtD(w.missingSince) + ' nicht mehr im Export. Abgeschlossen? Dann auf „Fertig“ setzen oder archivieren.</div>' : '') +
        '<div class="kv"><span>Auftrag</span><b>' + esc(w.nr || p.nr) + '</b><span>Kunde</span><div>' + esc(w.kunde) + '</div><span>Kommission</span><div>' + esc(w.kom) + '</div><span>Typ / Phase</span><div>' + esc([w.typ, w.phase].filter(Boolean).join(' · ')) + '</div>' +
        '<span>PL / Consultant</span><div>' + esc(w.pl || '–') + ' / ' + esc(w.cons || '–') + '</div><span>Status</span><div>' + esc(w.status || '–') + '</div>' + (w.golive ? '<span>GoLive</span><div>' + esc(w.golive) + '</div>' : '') + '</div>' +
        (C.budget(p) ? '<div style="margin-top:10px">' + budgetLine(C.budget(p)) + '<div class="help" style="margin:4px 0 0">Budget ' + f1(w.plan) + ' h · abrechenbar gebucht ' + f1(w.istab) + ' h' + (ap != null ? ' (' + Math.round(ap) + ' %)' : '') + ' · gesamt gebucht ' + f1(w.ist) + ' h' + (gp != null ? ' (' + Math.round(gp) + ' %)' : '') + '</div></div>' : '') +
        (tp != null ? '<div style="margin-top:8px;font-size:13px">Laufzeit ' + C.fmtD(w.start) + ' – ' + C.fmtD(w.ende) + ' · ' + Math.round(tp) + ' % vergangen</div><div class="meter"><i style="width:' + tp + '%;background:var(--acc)"></i></div>' : '') +
        '<h3 style="margin-top:14px">Aktuelles (aus weclapp)</h3>' + (A.ent.length || A.notes.length ? '<div class="list">' + A.ent.slice(0, 6).map(e => '<div class="it"><div class="t">' + esc(e.t || '(nur Datum)') + '<small>' + C.fmtD(e.d) + '</small></div></div>').join('') + A.notes.slice(0, 3).map(n => '<div class="it"><div class="t muted">' + esc(n) + '</div></div>').join('') + '</div>' : '<div class="help">Leer.</div>') +
        '<h3 style="margin-top:14px">✍️ Aktuelles fortschreiben</h3><label class="f"><span>Neuer Eintrag (Datum wird automatisch vorangestellt, wird gespeichert)</span><textarea id="akIn" rows="2" placeholder="z. B. Abnahmetermin mit Kunde vereinbart">' + esc(p.aktNew) + '</textarea></label>' +
        '<div class="help" style="margin:6px 0 4px">Vorschau des Feldes „Aktuelles“ für weclapp:</div><pre id="akPv" class="akpv"></pre>' +
        '<div class="bar" style="margin:8px 0 0"><button class="sm pri" id="akCpAll">📋 Ganzes Feld kopieren</button><button class="sm" id="akCpNew">📋 Nur neuen Eintrag kopieren</button>' + (wcLink(p) ? wcLink(p).replace('class="wl"', 'class="sm"') : '') + '<button class="sm" id="akDone" title="Eintrag ist in weclapp, Feld leeren">✓ Eingetragen</button></div></div>';
    } else h += '<div class="panel"><h3>🔗 weclapp</h3><div class="help">Eigenes Projekt, nicht aus weclapp. Beim Import wird es nie verändert.</div></div>';
    h += '<div class="panel"><h3>Verwalten</h3><div class="bar" style="margin:0"><button class="sm" id="oArc">' + (p.archived ? '📤 Aus Archiv holen' : '🗄 Archivieren') + '</button><button class="sm" id="oEst">🧮 Neue Schätzung</button><button class="sm" id="oDel" style="color:var(--r)">🗑 Löschen</button></div></div></div></div>';
    $('pBody').innerHTML = h;
    const bind = (id, k, num) => $(id).onchange = $(id).oninput = e => { const v = num ? +e.target.value : e.target.value; if (k !== 'kunde') track(p, k, p[k], v); p[k] = v; touch(p); };
    bind('oN', 'name'); bind('oK', 'kunde'); bind('oP', 'prio', true); bind('oD', 'due');
    // Nächster Schritt schreibt (solange verknüpft) auch den Entwurf für „Aktuelles“ mit
    $('oX').oninput = $('oX').onchange = e => { const v = e.target.value, was = C.aktLinked(p); track(p, 'next', p.next, v); C.setNext(p, v); touch(p); if (was && $('akIn')) { $('akIn').value = p.aktNew; $('akIn').oninput.call($('akIn'), { sync: 1 }); } hint(); };
    // Vorschlag übernimmt nur den Schritt; der Text steht ja schon in weclapp und wird nicht erneut vorgemerkt
    const hint = () => { if (!$('oXh')) return; $('oXh').innerHTML = nextHint(p); if ($('oXa')) $('oXa').onclick = () => { const v = C.aktLatest(p, today()); track(p, 'next', p.next, v); p.next = v; touch(p); project(); toast('➜ Als nächster Schritt übernommen'); }; };
    hint();
    $('oN').onblur = () => { if (!p.name.trim()) { p.name = p.nr || 'Ohne Namen'; touch(p); } project(); };
    $('oS').querySelectorAll('button').forEach(b => b.onclick = () => { if (p.status === b.dataset.k) return; track(p, 'status', p.status, b.dataset.k); p.status = b.dataset.k; touch(p); project(); if (p.status === 'd') toast('🎉 Projekt abgeschlossen'); });
    if ($('akIn')) {
      const pv = () => { $('akPv').textContent = C.aktCompose(w.akt, $('akIn').value, today()) || '(leer)'; };
      $('akIn').oninput = e => { p.aktNew = $('akIn').value; commit(); pv(); if (!(e && e.sync)) hint(); }; pv();
      const noted = t => { if (!p.log.some(l => l.d === today() && l.t === 'Aktuelles: ' + t)) { log(p, 'Aktuelles: ' + t); touch(p); } };
      $('akCpAll').onclick = () => { const t = $('akIn').value.trim(); if (!t) return $('akIn').focus(); copyText(C.aktCompose(w.akt, t, today()), '📋 Ganzes Feld „Aktuelles“ kopiert – in weclapp ersetzen'); noted(t); };
      $('akCpNew').onclick = () => { const t = $('akIn').value.trim(); if (!t) return $('akIn').focus(); const line = C.aktPrefix(w.akt, today()) + t.replace(/\s*\n\s*/g, ' '); copyText(line, '📋 „' + line + '“ kopiert'); noted(t); };
      $('akDone').onclick = () => { const t = $('akIn').value.trim(); if (t) noted(t); p.aktNew = ''; touch(p); project(); toast('✓ Eintrag erledigt'); };
    }
    if ($('oClose')) $('oClose').onclick = () => { track(p, 'status', p.status, 'd'); p.status = 'd'; touch(p); project(); toast('🎉 Projekt abgeschlossen'); };
    $('oArc').onclick = () => { p.archived = !p.archived; log(p, p.archived ? 'Archiviert' : 'Aus Archiv geholt'); touch(p); project(); };
    $('oEst').onclick = () => App.newEstimate(p.id);
    $('oDel').onclick = async () => {
      await App.snapshot('vor Löschen', 'Vor Löschen: ' + p.name);
      const idx = S.projects.indexOf(p), est = S.estimates.filter(e => e.pid === p.id);
      S.projects.splice(idx, 1); est.forEach(e => e.pid = ''); commit(); go('projects');
      toast('🗑 „' + p.name + '“ gelöscht', 'Rückgängig', () => { S.projects.splice(idx, 0, p); est.forEach(e => e.pid = p.id); commit(); go('project', { pid: p.id }); });
    };
  }
  function nextHint(p) {
    if (!p.next.trim()) { const l = C.aktLatest(p, today()); return l ? 'Vorschlag aus weclapp-„Aktuelles“: <button class="sm" id="oXa">➜ ' + esc(l.length > 60 ? l.slice(0, 60) + '…' : l) + '</button>' : 'Wird auch als neuer Eintrag für „Aktuelles“ vorgemerkt.'; }
    return C.aktLinked(p) ? '🔗 Wird als neuer Eintrag für „Aktuelles“ vorgemerkt (rechts kopieren).' : '✍️ Der Aktuelles-Entwurf ist eigenständig formuliert und folgt dem Schritt nicht mehr. Nach „✓ Eingetragen“ ist er wieder verknüpft.';
  }
  // Plan des Einzelprojekts: Phasen mit ihren Aufgaben, dazu Aufgaben ohne Phase; Themen aus dem Backlog des Auftrags
  function pTasks(p) {
    const ests = S.estimates.filter(e => e.pid === p.id && e.tasks.some(t => t.n)), ph = p.phases, bl = S.backlog.filter(x => x.scope === 'proj' && x.ref === p.id && x.slot !== 'done');
    const estRef = t => { const e = t.eid && S.estimates.find(x => x.id === t.eid), et = e && e.tasks.find(x => x.id === t.etid); return et ? '<a href="#" class="eref" data-eo="' + e.id + '" title="Verknüpfte Aufgabe der Schätzung öffnen">🧮 ' + esc(e.title) + ' · ' + f1(C.tE(et)) + ' ' + esc(e.unit) + '</a>' : ''; };
    const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');
    const row = t => '<div class="it ' + (t.done ? 'done' : '') + '"><button class="ck ' + (t.done ? 'on' : '') + '" data-tc="' + t.id + '" aria-label="' + (t.done ? 'Wieder öffnen' : 'Erledigt') + '">' + (t.done ? '✓' : '') + '</button><div class="t">' + esc(t.t) + '<small>' + [t.due ? (t.done ? '' : t.due < today() ? '⏰ überfällig · ' : '') + C.fmtD(t.due) : '', t.who ? '👤 ' + esc(t.who) : '', estRef(t)].filter(Boolean).join(' · ') + '</small></div><button class="x" data-te="' + t.id + '" aria-label="Bearbeiten">✏️</button><button class="x" data-tx="' + t.id + '" aria-label="Löschen">✕</button></div>';
    const group = L => { const open = L.filter(t => !t.done).sort(byDue), done = L.filter(t => t.done); return '<div class="list">' + (open.length ? open.map(row).join('') : '<div class="help">Keine offenen Aufgaben.</div>') + '</div>' + (done.length ? '<details style="margin-top:6px"><summary>Erledigt (' + done.length + ')</summary><div class="list">' + done.map(row).join('') + '</div></details>' : ''); };
    let h = '<div class="panel"><div class="row"><label class="f" style="flex:3"><span>Neue Aufgabe</span><input id="tN" placeholder="Was ist zu tun? (Enter)"></label>' +
      (ph.length ? '<label class="f"><span>Phase</span><select id="tP"><option value="">Ohne Phase</option>' + ph.map(x => '<option value="' + x.id + '"' + (UI.tph === x.id ? ' selected' : '') + '>' + esc(x.n) + '</option>').join('') + '</select></label>' : '') +
      '<label class="f"><span>Fällig</span><input type="date" id="tD"></label><label class="f"><span>Wer</span><input id="tW" list="dlTeam" placeholder="optional"><datalist id="dlTeam">' + S.team.map(m => '<option value="' + esc(m.n) + '">').join('') + '</datalist></label><button class="btn" id="tAdd">＋</button></div>' +
      '<div class="bar" style="margin:0 0 8px"><button class="sm" id="phAdd">＋ Phase</button>' + (ph.length ? '' : '<button class="sm" id="phStd">🧭 Standardphasen anlegen</button>') + (ests.length ? '<button class="sm" id="tFromE">🧮 Aus Schätzung übernehmen</button>' : '') + (p.tasks.some(t => !t.done) ? '<button class="sm" id="tShare">📋 Offene Aufgaben teilen</button>' : '') + '</div>';
    if (!ph.length) h += group(p.tasks) + '</div>';
    else {
      h += '</div>' + phaseBar(p);
      C.phaseStats(p, today()).forEach(g => {
        if (!g.ph && !g.total) return;
        h += '<div class="panel phase' + (g.current ? ' cur' : '') + (g.ph && g.ph.done ? ' ok' : '') + '"><h3>' + (g.ph ? (g.ph.done ? '✅ ' : g.current ? '▶ ' : '○ ') + esc(g.ph.n) : '📌 Ohne Phase') +
          (g.ph && (g.ph.start || g.ph.end) ? '<span class="muted" style="text-transform:none;letter-spacing:0;font-weight:600">' + [C.fmtD(g.ph.start), C.fmtD(g.ph.end)].filter(Boolean).join(' – ') + '</span>' : '') + (g.late ? '<span class="tag r">Termin überschritten</span>' : '') + (g.current ? '<span class="tag new">aktuell</span>' : '') +
          '<span class="sp"></span><span class="cnt">' + g.done + '/' + g.total + '</span>' + (g.ph ? '<button class="sm" data-pd="' + g.ph.id + '">' + (g.ph.done ? '↺ Wieder öffnen' : '✓ Phase abschließen') + '</button><button class="x" data-pe="' + g.ph.id + '" aria-label="Phase bearbeiten">✏️</button>' : '') + '</h3>' +
          (g.total ? '<div class="meter" style="margin:-4px 0 8px"><i style="width:' + g.pct + '%"></i></div>' : '') + group(g.tasks) + '</div>';
      });
    }
    h += '<div class="panel"><h3>🗂 Themen im Backlog dieses Auftrags<span class="sp"></span><span class="cnt">' + bl.length + '</span><button class="sm" data-go="plan">Planung ›</button></h3><div class="row" style="margin-bottom:6px"><input id="pbIn" placeholder="Thema / Wunsch des Kunden erfassen (Enter)"></div>' +
      (bl.length ? '<div class="list">' + C.blSort(bl).map(x => '<div class="it" data-bl="' + x.id + '" style="cursor:pointer"><span class="tag">' + C.BL_SLOTS[x.slot] + '</span><div class="t">' + esc(x.t) + '<small>⚡ ' + f1(C.blScore(x)) + (x.who ? ' · ' + esc(x.who) : '') + '</small></div></div>').join('') + '</div>' : '<div class="help">Wünsche und Ideen zu diesem Auftrag sammeln, bewerten und im Team einplanen.</div>') + '</div>';
    $('pBody').innerHTML = h;
    const curName = () => C.phaseName(p), setPh = (fn) => { const was = curName(); fn(); track(p, 'ph', was, curName()); touch(p); project(); };
    const add = () => { const t = $('tN').value.trim(); if (!t) return $('tN').focus(); const phv = $('tP') ? $('tP').value : ''; UI.tph = phv; saveUI(); p.tasks.push({ id: C.uid(), t, due: $('tD').value, done: false, who: $('tW').value.trim(), eid: '', etid: '', ph: phv }); touch(p); project(); $('tN').focus(); };
    $('pBody').querySelectorAll('[data-eo]').forEach(a => a.onclick = e => { e.preventDefault(); go('estimate', { eid: a.dataset.eo, back: { view: 'project', pid: p.id, ptab: 'tasks' } }); });
    $('pBody').querySelectorAll('[data-go]').forEach(el => el.onclick = () => { UI.blScope = 'proj'; go(el.dataset.go); });
    if ($('tFromE')) $('tFromE').onclick = () => App.pickTasks('toProject', ests, p);
    if ($('tShare')) $('tShare').onclick = () => copyText(shareTasks(p), '📋 Offene Aufgaben kopiert – in Teams oder E-Mail einfügen');
    if ($('phStd')) $('phStd').onclick = () => setPh(() => C.addPhases(p, C.STD_PHASES));
    $('phAdd').onclick = () => phaseSheet(p, null, setPh);
    $('pBody').querySelectorAll('[data-pe]').forEach(b => b.onclick = () => phaseSheet(p, ph.find(x => x.id === b.dataset.pe), setPh));
    $('pBody').querySelectorAll('[data-pd]').forEach(b => b.onclick = () => setPh(() => { const x = ph.find(y => y.id === b.dataset.pd); x.done = !x.done; if (x.done) log(p, '✅ Phase „' + x.n + '“ abgeschlossen'); }));
    $('pbIn').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { S.backlog.push(C.newBacklogItem({ t: e.target.value.trim(), scope: 'proj', ref: p.id })); commit(); project(); $('pbIn').focus(); } };
    $('pBody').querySelectorAll('.it[data-bl]').forEach(el => el.onclick = () => App.itemSheet(S.backlog.find(x => x.id === el.dataset.bl), project));
    $('tAdd').onclick = add; $('tN').onkeydown = e => { if (e.key === 'Enter') add(); };
    $('pBody').querySelectorAll('[data-tc]').forEach(b => b.onclick = () => { const t = p.tasks.find(x => x.id === b.dataset.tc); t.done = !t.done; if (t.done) log(p, '✔ ' + t.t); touch(p); project(); });
    $('pBody').querySelectorAll('[data-tx]').forEach(b => b.onclick = () => { const i = p.tasks.findIndex(x => x.id === b.dataset.tx), t = p.tasks[i]; p.tasks.splice(i, 1); touch(p); project(); toast('Aufgabe gelöscht', 'Rückgängig', () => { p.tasks.splice(i, 0, t); touch(p); project(); }); });
    $('pBody').querySelectorAll('[data-te]').forEach(b => b.onclick = () => {
      const t = p.tasks.find(x => x.id === b.dataset.te);
      sheet('<h4>Aufgabe bearbeiten</h4><label class="f"><span>Aufgabe</span><input id="teN" value="' + esc(t.t) + '" autofocus></label><div class="row" style="margin-top:10px">' + (ph.length ? '<label class="f"><span>Phase</span><select id="teP"><option value="">Ohne Phase</option>' + ph.map(x => '<option value="' + x.id + '"' + (t.ph === x.id ? ' selected' : '') + '>' + esc(x.n) + '</option>').join('') + '</select></label>' : '') + '<label class="f"><span>Fällig</span><input type="date" id="teD" value="' + esc(t.due) + '"></label><label class="f"><span>Wer</span><input id="teW" list="dlTeam" value="' + esc(t.who) + '"></label></div><div class="acts"><button class="btn sec" id="teC">Abbrechen</button><button class="btn" id="teOk">Speichern</button></div>', () => {
        $('teC').onclick = closeSheet; $('teOk').onclick = () => { t.t = $('teN').value.trim() || t.t; t.due = $('teD').value; t.who = $('teW').value.trim(); if ($('teP')) t.ph = $('teP').value; touch(p); closeSheet(); project(); };
      });
    });
  }
  // Zeitstrahl der Phasen (nur wenn Termine gepflegt sind)
  function phaseBar(p) {
    const D = p.phases.filter(x => x.start && x.end && x.end >= x.start); if (!D.length) return '';
    const a = D.map(x => x.start).sort()[0], z = D.map(x => x.end).sort().pop(), span = Math.max(1, C.daysBetween(a, z) + 1), t = today();
    const pos = d => Math.max(0, Math.min(100, C.daysBetween(a, d) / span * 100));
    return '<div class="panel"><h3>🗓 Zeitplan<span class="sp"></span><span class="muted" style="text-transform:none;letter-spacing:0">' + C.fmtD(a) + ' – ' + C.fmtD(z) + '</span></h3><div class="gantt">' +
      D.map(x => '<div class="gr"><span>' + esc(x.n) + '</span><div class="gt"><i class="' + (x.done ? 'ok' : x.end < t ? 'late' : '') + '" style="left:' + pos(x.start) + '%;width:' + Math.max(1.5, (C.daysBetween(x.start, x.end) + 1) / span * 100) + '%"></i>' + (t >= a && t <= z ? '<b style="left:' + pos(t) + '%" title="Heute"></b>' : '') + '</div></div>').join('') + '</div></div>';
  }
  function phaseSheet(p, x, setPh) {
    const isNew = !x;
    sheet('<h4>' + (isNew ? '＋ Neue Phase' : 'Phase bearbeiten') + '</h4><label class="f"><span>Name</span><input id="phN" value="' + esc(x ? x.n : '') + '" autofocus placeholder="z. B. Konzeption"></label><div class="row" style="margin-top:10px"><label class="f"><span>Start</span><input type="date" id="phS" value="' + esc(x ? x.start : '') + '"></label><label class="f"><span>Ende</span><input type="date" id="phE" value="' + esc(x ? x.end : '') + '"></label></div>' +
      '<div class="acts">' + (isNew ? '' : '<button class="btn red" id="phX">🗑 Löschen</button><span style="flex:1"></span>') + '<button class="btn sec" id="phC">Abbrechen</button><button class="btn" id="phOk">Speichern</button></div>', () => {
      $('phC').onclick = closeSheet;
      $('phOk').onclick = () => { const n = $('phN').value.trim(); if (!n) return $('phN').focus(); closeSheet(); setPh(() => { const v = { n, start: $('phS').value, end: $('phE').value }; if (isNew) p.phases.push(Object.assign({ id: C.uid(), done: false }, v)); else Object.assign(x, v); }); };
      if ($('phX')) $('phX').onclick = () => { const i = p.phases.indexOf(x), T = p.tasks.filter(t => t.ph === x.id); closeSheet(); setPh(() => { p.phases.splice(i, 1); T.forEach(t => t.ph = ''); }); toast('Phase gelöscht, Aufgaben bleiben (ohne Phase)', 'Rückgängig', () => setPh(() => { p.phases.splice(i, 0, x); T.forEach(t => t.ph = x.id); })); };
    });
  }
  // Offene Aufgaben als Text zum Teilen (nach Phase gruppiert)
  function shareTasks(p) {
    const L = ['Offene Aufgaben – ' + p.name + ' (' + C.fmtD(today()) + ')'];
    C.phaseStats(p, today()).forEach(g => { const o = g.tasks.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')); if (!o.length) return; if (p.phases.length) L.push('', g.ph ? g.ph.n : 'Ohne Phase'); o.forEach(t => L.push('☐ ' + t.t + [t.who ? ' – ' + t.who : '', t.due ? ' – bis ' + C.fmtD(t.due) : ''].join(''))); });
    return L.join('\n');
  }
  function pEst(p) {
    const L = S.estimates.filter(e => e.pid === p.id).sort((a, b) => b.updated - a.updated);
    $('pBody').innerHTML = '<div class="panel"><div class="bar"><button class="btn" id="eNew">＋ Neue Schätzung</button></div>' + (L.length ? '<div class="list">' + L.map(e => { const r = C.calcEstimate(e); return '<div class="it" data-e="' + e.id + '" style="cursor:pointer"><div class="t"><b>' + esc(e.title) + '</b><small>' + C.EST_STATUS[e.status] + ' · ' + C.fmtD(e.date) + ' · ' + e.tasks.length + ' Aufgaben</small></div><b>' + f1(r.total) + ' ' + esc(e.unit) + '</b></div>'; }).join('') + '</div>' : '<div class="help">Noch keine Schätzung für dieses Projekt.</div>') + '</div>';
    $('eNew').onclick = () => App.newEstimate(p.id);
    $('pBody').querySelectorAll('[data-e]').forEach(el => el.onclick = () => go('estimate', { eid: el.dataset.e, back: { view: 'project', pid: p.id, ptab: 'est' } }));
  }
  const rcol = s => s >= 15 ? 'var(--r)' : s >= 8 ? 'var(--y)' : 'var(--g)';
  function pRisks(p) {
    let w = 3, a = 3;
    const heat = () => { let h = '<div class="heat">'; for (let y = 5; y >= 1; y--) { h += '<div class="ax">' + y + '</div>'; for (let x = 1; x <= 5; x++) { const n = p.risks.filter(r => r.w === y && r.a === x).length; h += '<div style="background:' + rcol(x * y) + ';opacity:' + (n ? 1 : .25) + ';color:#fff">' + (n || '') + '</div>'; } } return h + '<div></div>' + [1, 2, 3, 4, 5].map(x => '<div class="ax">' + x + '</div>').join('') + '</div><div class="help" style="margin-top:4px">↑ Wahrscheinlichkeit · Auswirkung →</div>'; };
    const seg = (id, get, set) => { $(id).innerHTML = [1, 2, 3, 4, 5].map(i => '<button data-i="' + i + '" class="' + (get() === i ? 'on' : '') + '">' + i + '</button>').join(''); $(id).querySelectorAll('button').forEach(b => b.onclick = () => { set(+b.dataset.i); seg(id, get, set); }); };
    $('pBody').innerHTML = '<div class="cols"><div class="panel"><h3>Risiken (Score = W × A)</h3><div class="list">' + (p.risks.length ? p.risks.slice().sort((x, y) => y.w * y.a - x.w * x.a).map(r => '<div class="it"><span class="tag" style="background:' + rcol(r.w * r.a) + ';color:#fff;border:0">' + r.w * r.a + '</span><div class="t">' + esc(r.n) + '<small>W' + r.w + ' · A' + r.a + (r.m ? ' · Maßnahme: ' + esc(r.m) : '') + '</small></div><button class="x" data-rx="' + r.id + '">✕</button></div>').join('') : '<div class="help">Noch keine Risiken erfasst.</div>') + '</div></div>' +
      '<div><div class="panel"><h3>Matrix</h3>' + heat() + '</div><div class="panel"><h3>Neues Risiko</h3><label class="f"><span>Was kann schiefgehen?</span><input id="rN"></label><div class="f" style="margin:8px 0"><span>Wahrscheinlichkeit</span><div class="chips" id="rW"></div></div><div class="f" style="margin-bottom:8px"><span>Auswirkung</span><div class="chips" id="rA"></div></div><label class="f"><span>Gegenmaßnahme</span><input id="rM"></label><button class="btn wide" id="rAdd" style="margin-top:10px">＋ Risiko</button></div></div></div>';
    seg('rW', () => w, v => w = v); seg('rA', () => a, v => a = v);
    $('rAdd').onclick = () => { const n = $('rN').value.trim(); if (!n) return $('rN').focus(); p.risks.push({ id: C.uid(), n, w, a, m: $('rM').value.trim() }); touch(p); project(); };
    $('pBody').querySelectorAll('[data-rx]').forEach(b => b.onclick = () => { p.risks = p.risks.filter(r => r.id !== b.dataset.rx); touch(p); project(); });
  }
  // Zeitleiste: strukturierte Änderungen (weclapp und eigene) plus Journal-Einträge, neueste zuerst
  function timeline(p) {
    const H = p.hist.map(e => ({ at: e.at, d: e.at.slice(0, 10), src: e.src, txt: C.histText(e), kind: 'hist' }));
    const L = p.log.filter(l => !(l.src === 'weclapp' && /^weclapp: /.test(l.t))).map((l, i) => ({ at: l.d + 'T00:00:00.' + String(i).padStart(3, '0') + 'Z', d: l.d, src: l.src === 'weclapp' ? 'weclapp' : 'note', txt: l.t, kind: 'log' }));
    const old = p.log.filter(l => l.src === 'weclapp' && /^weclapp: /.test(l.t)).map(l => ({ at: l.d + 'T00:00:00Z', d: l.d, src: 'weclapp', txt: l.t.replace(/^weclapp: /, ''), kind: 'log' }));
    return H.concat(L, old).sort((a, b) => b.at.localeCompare(a.at));
  }
  App.timeline = timeline;
  function pLog(p) {
    const f = UI.tlf || 'all', T = timeline(p).filter(x => f === 'all' || x.src === f);
    const ic = { weclapp: '🔗', ich: '✏️', note: '📝' };
    $('pBody').innerHTML = '<div class="cols"><div class="panel"><h3>Verlauf<span class="sp"></span></h3><div class="row"><input id="lgIn" placeholder="Kurze Notiz ins Journal (Enter)"></div>' +
      '<div class="chips" id="tlf" style="margin-bottom:8px">' + [['all', 'Alle'], ['weclapp', '🔗 weclapp'], ['ich', '✏️ Meine Änderungen'], ['note', '📝 Journal']].map(([k, n]) => '<button data-f="' + k + '" class="' + (f === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' +
      '<div class="list" id="tlList">' + (T.length ? T.slice(0, 150).map(x => '<div class="it tl-' + x.src + '"><span aria-hidden="true">' + ic[x.src] + '</span><div class="t">' + esc(x.txt) + '<small>' + C.fmtD(x.d) + (x.kind === 'hist' && x.at.length > 12 ? ', ' + new Date(x.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '') + ' · ' + ({ weclapp: 'weclapp', ich: 'ich', note: 'Journal' })[x.src] + '</small></div></div>').join('') : '<div class="help">Noch keine Einträge.</div>') + '</div></div>' +
      '<div class="panel"><h3>Notizen</h3><textarea id="lgN" rows="12" placeholder="Kontext, Entscheidungen, Ansprechpartner, Links …">' + esc(p.notes) + '</textarea></div></div>';
    $('lgN').oninput = e => { p.notes = e.target.value; touch(p); };
    $('lgIn').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { log(p, e.target.value.trim()); touch(p); project(); $('lgIn').focus(); } };
    $('tlf').querySelectorAll('button').forEach(b => b.onclick = () => { UI.tlf = b.dataset.f; saveUI(); pLog(p); });
  }

  // ---------- Start ----------
  async function boot() {
    await ST.init();
    const r = await ST.load();
    S = C.normalize(r.state || C.empty());
    try { const snaps = await ST.snapshots(); const a = snaps.filter(x => x.kind === 'auto')[0]; lastAuto = a ? a.at : 0; } catch (e) {}
    if (!ST.status.idb) banner('y', '⚠️ Der Browser stellt keine Datenbank (IndexedDB) bereit. Gespeichert wird nur im kleineren Zwischenspeicher. Bitte regelmäßig Backups machen.');
    App.ready = true;
    render();
  }
  App.boot = boot;
  App.setState = s => { S = s; };
})();
