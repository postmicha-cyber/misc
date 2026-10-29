/* Projekt-Cockpit: Kernlogik ohne Oberfläche.
 * Alles hier ist reine Datenverarbeitung (kein DOM, kein Speicher), damit es mit Unit-Tests
 * in Node geprüft werden kann (tests/cockpit/core.test.js). Die Oberfläche steckt in app.js.
 */
(function (root) {
  'use strict';
  const FORMAT = 1, APP = 'projekt-cockpit';
  const uid = () => Math.random().toString(36).slice(2, 10);
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const arr = v => Array.isArray(v) ? v : [];
  const str = v => (v == null ? '' : String(v)).trim();
  const num = (v, d = 0) => { const x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : d; };
  const pad = n => String(n).padStart(2, '0');
  const isoOf = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  const isoDate = (d = new Date()) => isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const validIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dOf = iso => validIso(iso) ? new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) : null;
  const daysBetween = (a, b) => Math.round((dOf(b) - dOf(a)) / 864e5);
  const fmtD = iso => validIso(iso) ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '';

  // ---------------- Datenmodell ----------------
  const STATUS = { g: { n: 'Läuft', ic: '🟢', ord: 1 }, y: { n: 'Achtung', ic: '🟡', ord: 1 }, r: { n: 'Blockiert', ic: '🔴', ord: 0 }, p: { n: 'Pausiert', ic: '⏸', ord: 3 }, d: { n: 'Fertig', ic: '✅', ord: 4 } };
  const EST_STATUS = { draft: 'Entwurf', agreed: 'Abgestimmt', offered: 'Angeboten', ordered: 'Beauftragt', rejected: 'Abgelehnt' };
  const PRIO = { must: 'Must', should: 'Should', could: 'Could', wont: 'Won’t' };
  const UNITS = ['Stunden', 'Tage', 'Wochen', 'Story Points'];
  const HOURS = { Stunden: 1, Tage: 8, Wochen: 40 };
  const DEFAULT_SETTINGS = { wip: 8, stale: 14, budgetY: 85, budgetR: 100, aktStale: 14, backupDays: 7, soonDays: 3, done: 'abgeschlossen, fertig, erledigt, storniert, beendet', weclappUrl: 'https://tcgprocess.weclapp.com' };
  const EXTRAS = () => [
    { id: uid(), n: 'Projektmanagement', type: 'pct', v: 10, on: true }, { id: uid(), n: 'Kommunikation & Abstimmung', type: 'pct', v: 5, on: true },
    { id: uid(), n: 'Test & Qualitätssicherung', type: 'pct', v: 10, on: false }, { id: uid(), n: 'Dokumentation', type: 'pct', v: 5, on: false },
    { id: uid(), n: 'Einarbeitung / Setup', type: 'fix', v: 0, on: false }
  ];

  function empty() {
    return {
      app: APP, format: FORMAT, me: '', settings: Object.assign({}, DEFAULT_SETTINGS),
      projects: [], estimates: [], lib: { tasks: [], stories: [] }, ideas: [],
      tools: { cap: { days: 10, focus: 70, members: [{ n: 'Person 1', av: 100, off: 0 }], refVel: '', refPt: '' }, fc: { backlog: 100, velos: [20, 22, 18], weeks: 2, start: isoDate(), growth: 0 } },
      meta: { lastBackup: '', changes: 0, lastImport: null, colMap: {}, lastReview: '', created: new Date().toISOString() }
    };
  }
  function newProject(o, today) {
    const t = today || isoDate();
    return Object.assign({ id: uid(), nr: '', name: 'Neues Projekt', kunde: '', status: 'g', prio: 2, due: '', next: '', notes: '', aktNew: '', tasks: [], log: [{ d: t, t: 'Projekt angelegt' }], hist: [], risks: [], pinned: false, archived: false, created: t, updated: t, wc: null }, o || {});
  }
  function newEstimate(o, today) {
    return Object.assign({ id: uid(), pid: '', title: 'Neue Schätzung', status: 'draft', date: today || isoDate(), source: '', unit: 'Tage', idea: '', stories: [], tasks: [], extras: EXTRAS(), tpl: false, created: Date.now(), updated: Date.now() }, o || {});
  }

  // Repariert und vervollständigt einen Stand, egal wie unvollständig er ist. Wirft nie.
  function normalize(input) {
    const s = empty(), src = isObj(input) ? input : {};
    s.me = str(src.me);
    s.settings = Object.assign({}, DEFAULT_SETTINGS, isObj(src.settings) ? src.settings : {});
    const seen = new Set();
    const id = v => { let x = str(v) || uid(); while (seen.has(x)) x = uid(); seen.add(x); return x; };
    s.projects = arr(src.projects).filter(isObj).map(p => {
      const q = newProject({}, validIso(p.created) ? p.created : undefined);
      Object.assign(q, {
        id: id(p.id), nr: str(p.nr), name: str(p.name) || str(p.nr) || 'Ohne Namen', kunde: str(p.kunde),
        status: STATUS[p.status] ? p.status : 'g', prio: [1, 2, 3].includes(p.prio) ? p.prio : 2, due: validIso(p.due) ? p.due : '',
        next: str(p.next), notes: typeof p.notes === 'string' ? p.notes : '', aktNew: typeof p.aktNew === 'string' ? p.aktNew : '', pinned: !!p.pinned, archived: !!p.archived,
        created: validIso(p.created) ? p.created : q.created, updated: validIso(p.updated) ? p.updated : q.updated,
        tasks: arr(p.tasks).filter(isObj).map(t => ({ id: id(t.id), t: str(t.t) || 'Aufgabe', due: validIso(t.due) ? t.due : '', done: !!t.done, who: str(t.who) })),
        log: arr(p.log).filter(isObj).map(l => ({ d: validIso(l.d) ? l.d : q.created, t: str(l.t), src: str(l.src) })).filter(l => l.t),
        hist: arr(p.hist).filter(x => isObj(x) && str(x.k)).map(x => ({ at: str(x.at), src: x.src === 'weclapp' ? 'weclapp' : 'ich', k: str(x.k), from: hv(x.from), to: hv(x.to), imp: str(x.imp) })).slice(-HIST_MAX),
        risks: arr(p.risks).filter(isObj).map(r => ({ id: id(r.id), n: str(r.n) || 'Risiko', w: clamp(r.w), a: clamp(r.a), m: str(r.m) })),
        wc: isObj(p.wc) ? normWc(p.wc) : null
      });
      return q;
    });
    const pids = new Set(s.projects.map(p => p.id));
    s.estimates = arr(src.estimates).filter(isObj).map(e => {
      const q = newEstimate();
      const stories = arr(e.stories).filter(isObj).map(x => ({ id: id(x.id), role: str(x.role), want: str(x.want), benefit: str(x.benefit), ac: arr(x.ac).map(str).filter(Boolean), prio: PRIO[x.prio] ? x.prio : 'must' }));
      const sids = new Set(stories.map(x => x.id));
      Object.assign(q, {
        id: id(e.id), pid: pids.has(e.pid) ? e.pid : '', title: str(e.title) || 'Schätzung', status: EST_STATUS[e.status] ? e.status : 'draft',
        date: validIso(e.date) ? e.date : q.date, source: str(e.source), unit: UNITS.includes(e.unit) ? e.unit : 'Tage', idea: typeof e.idea === 'string' ? e.idea : '', tpl: !!e.tpl,
        created: num(e.created, Date.now()), updated: num(e.updated, Date.now()), stories,
        tasks: arr(e.tasks).filter(isObj).map(t => ({ id: id(t.id), n: str(t.n), d: typeof t.d === 'string' ? t.d : '', sid: sids.has(t.sid) ? t.sid : '', o: numOr(t.o), m: numOr(t.m), p: numOr(t.p) })),
        extras: Array.isArray(e.extras) ? e.extras.filter(isObj).map(x => ({ id: id(x.id), n: str(x.n) || 'Zuschlag', type: x.type === 'fix' ? 'fix' : 'pct', v: num(x.v), on: !!x.on })) : EXTRAS()
      });
      return q;
    });
    const lib = isObj(src.lib) ? src.lib : {};
    s.lib.tasks = arr(lib.tasks).filter(isObj).map(t => ({ id: id(t.id), n: str(t.n), d: str(t.d), o: num(t.o), m: num(t.m), p: num(t.p), unit: UNITS.includes(t.unit) ? t.unit : 'Tage', used: num(t.used), auto: !!t.auto })).filter(t => t.n);
    s.lib.stories = arr(lib.stories).filter(isObj).map(x => ({ id: id(x.id), role: str(x.role), want: str(x.want), benefit: str(x.benefit), ac: arr(x.ac).map(str).filter(Boolean), prio: PRIO[x.prio] ? x.prio : 'must' })).filter(x => x.want);
    s.ideas = arr(src.ideas).filter(isObj).map(i => ({ id: id(i.id), t: str(i.t) })).filter(i => i.t);
    if (isObj(src.tools)) { if (isObj(src.tools.cap)) s.tools.cap = Object.assign(s.tools.cap, src.tools.cap); if (isObj(src.tools.fc)) s.tools.fc = Object.assign(s.tools.fc, src.tools.fc); }
    s.tools.cap.members = arr(s.tools.cap.members).filter(isObj);
    s.tools.fc.velos = arr(s.tools.fc.velos);
    if (isObj(src.meta)) s.meta = Object.assign(s.meta, src.meta, { colMap: isObj(src.meta.colMap) ? src.meta.colMap : {} });
    s.meta.imports = arr(s.meta.imports).filter(x => isObj(x) && str(x.id)).slice(-IMPORTS_MAX);
    return s;
  }
  const HIST_MAX = 400, IMPORTS_MAX = 100;
  const hv = v => v == null ? '' : typeof v === 'number' ? v : String(v).slice(0, 2000);
  const clamp = v => Math.max(1, Math.min(5, Math.round(num(v, 3))));
  const numOr = v => v === '' || v == null ? '' : num(v);
  const WC_KEYS = ['nr', 'datum', 'kunde', 'kom', 'akt', 'typ', 'phase', 'golive', 'pl', 'cons', 'status', 'plan', 'ist', 'istab', 'start', 'ende'];
  function normWc(w) {
    const o = {};
    WC_KEYS.forEach(k => { o[k] = ['plan', 'ist', 'istab'].includes(k) ? (w[k] == null || w[k] === '' ? null : num(w[k], null)) : str(w[k]); });
    o.importedAt = str(w.importedAt); o.missingSince = str(w.missingSince); o.imp = str(w.imp); o.newImp = str(w.newImp);
    return o;
  }

  // ---------------- Backup ----------------
  function makeBackup(state, now) {
    return { app: APP, format: FORMAT, exportedAt: (now || new Date()).toISOString(), counts: counts(state), data: state };
  }
  const counts = s => ({ projects: arr(s.projects).length, tasks: arr(s.projects).reduce((a, p) => a + arr(p.tasks).length, 0), estimates: arr(s.estimates).length });
  function validateBackup(obj) {
    if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch (e) { return { ok: false, err: 'Die Datei ist kein gültiges JSON (beschädigt oder falsche Datei).' }; } }
    if (!isObj(obj)) return { ok: false, err: 'Unbekanntes Dateiformat.' };
    if (obj.app !== APP) return { ok: false, err: obj.app ? 'Diese Datei gehört zu „' + obj.app + '“, nicht zum Projekt-Cockpit.' : 'Das ist kein Projekt-Cockpit-Backup.' };
    if (num(obj.format) > FORMAT) return { ok: false, err: 'Das Backup stammt aus einer neueren Version (Format ' + obj.format + '). Bitte die App aktualisieren.' };
    if (!isObj(obj.data) || !Array.isArray(obj.data.projects)) return { ok: false, err: 'Im Backup fehlen die Projektdaten.' };
    const data = normalize(obj.data);
    return { ok: true, data, exportedAt: str(obj.exportedAt), counts: counts(data) };
  }

  // ---------------- weclapp-Import ----------------
  const FIELDS = [
    { k: 'nr', l: 'Auftragsnummer', a: ['auftragsnummer', 'auftragsnr', 'auftragnr'] },
    { k: 'datum', l: 'Auftragsdatum', a: ['auftragsdatum'] },
    { k: 'kunde', l: 'Kunde', a: ['kunde'] },
    { k: 'kom', l: 'Kommission', a: ['kommission', 'bezeichnung', 'projekt'] },
    { k: 'akt', l: 'Aktuelles', a: ['aktuelles', 'aktuell'] },
    { k: 'typ', l: 'Auftrag Typ', a: ['auftragtyp', 'auftragstyp', 'typ'] },
    { k: 'phase', l: 'Phase', a: ['phase'] },
    { k: 'golive', l: 'GoLive Ziel', a: ['golive'] },
    { k: 'pl', l: 'Projektleiter', a: ['projektleiter', 'pl'] },
    { k: 'cons', l: 'Consultant', a: ['consultant', 'berater', 'bearbeiter'] },
    { k: 'status', l: 'Status', a: ['status'] },
    { k: 'plan', l: 'Geplanter abrechenbarer Aufwand (h)', a: ['geplanterabrechenbareraufwand', 'geplanteraufwand', 'plan'] },
    { k: 'ist', l: 'Gebuchter Aufwand (h)', a: ['gebuchteraufwand'] },
    { k: 'istab', l: 'Gebuchter abrechenbarer Aufwand (h)', a: ['gebuchterabrechenbareraufwand'] },
    { k: 'start', l: 'Projekt Start', a: ['projektstart', 'start'] },
    { k: 'ende', l: 'Projekt Ende', a: ['projektende', 'ende'] }
  ];
  const normH = s => String(s == null ? '' : s).toLowerCase().replace(/\(h\)/g, '').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
  function autoMap(header, saved) {
    const nh = header.map(normH), used = new Set(), cols = {};
    if (isObj(saved)) FIELDS.forEach(f => { const s = saved[f.k]; if (s) { const i = nh.indexOf(s); if (i >= 0 && !used.has(i)) { cols[f.k] = i; used.add(i); } } });
    const pass = exact => FIELDS.forEach(f => {
      if (cols[f.k] !== undefined) return;
      for (let i = 0; i < nh.length; i++) {
        if (used.has(i) || !nh[i]) continue;
        // „gebuchteraufwand“ darf nicht die Spalte „gebuchterabrechenbareraufwand“ schnappen (startsWith-Falle)
        if (f.a.some(a => exact ? nh[i] === a : nh[i].startsWith(a))) { cols[f.k] = i; used.add(i); return; }
      }
    });
    pass(true); pass(false);
    return cols;
  }
  function findHeader(raw, saved) {
    let hi = -1, best = 0;
    for (let i = 0; i < Math.min(raw.length, 15); i++) { const n = Object.keys(autoMap(arr(raw[i]).map(String), saved)).length; if (n > best) { best = n; hi = i; } }
    return best >= 3 ? { hi, cols: autoMap(raw[hi].map(String), saved) } : null;
  }
  function decode(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1252').decode(u); }
  }
  function parseCSV(text) {
    const nl = text.search(/\r?\n/), first = nl < 0 ? text : text.slice(0, nl);
    const cnt = c => first.split(c).length - 1;
    const delim = cnt(';') >= cnt('\t') && cnt(';') >= cnt(',') ? ';' : cnt('\t') >= cnt(',') ? '\t' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function toISO(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return isoDate(v);
    if (typeof v === 'number') { if (v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); } return ''; }
    const s = String(v).trim(); let m;
    const ok = (y, mo, d) => { const dt = new Date(y, mo - 1, d); return dt.getMonth() === mo - 1 && dt.getDate() === d ? isoOf(y, mo, d) : ''; };
    if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})/.exec(s))) return ok(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return ok(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return ok(+m[3], +m[1], +m[2]);
    return '';
  }
  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v == null ? '' : v).trim().replace(/\s/g, '').replace(/h$/i, ''); if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else s = s.replace(',', '.');
    const n = parseFloat(s); return isFinite(n) ? n : null;
  }
  const person = v => str(v).replace(/^Benutzer\s+/i, '');
  function buildRows(raw, hi, cols) {
    const out = [];
    for (let r = hi + 1; r < raw.length; r++) {
      const a = arr(raw[r]), g = k => cols[k] === undefined ? '' : a[cols[k]];
      const gl = g('golive');
      const o = { nr: str(g('nr')), datum: toISO(g('datum')), kunde: str(g('kunde')), kom: str(g('kom')), akt: String(g('akt') == null ? '' : g('akt')).replace(/\r/g, '').trim(), typ: str(g('typ')), phase: str(g('phase')),
        golive: typeof gl === 'number' ? fmtD(toISO(gl)) || str(gl) : str(gl), pl: person(g('pl')), cons: person(g('cons')), status: str(g('status')),
        plan: toNum(g('plan')), ist: toNum(g('ist')), istab: toNum(g('istab')), start: toISO(g('start')), ende: toISO(g('ende')) };
      if (!o.nr && !o.kunde && !o.kom) continue;
      out.push(o);
    }
    return out;
  }
  // Liest eine Datei (CSV-Text oder Tabellen-Zeilen) und liefert erkannte Zeilen + Spaltenzuordnung
  function readTable(raw, savedMap) {
    const h = findHeader(raw, savedMap);
    if (!h) return { ok: false, err: 'Keine bekannten weclapp-Spalten gefunden (z. B. Auftragsnummer, Kunde, Kommission).' };
    const rows = buildRows(raw, h.hi, h.cols);
    return { ok: true, hi: h.hi, cols: h.cols, header: raw[h.hi].map(String), rows, missing: FIELDS.filter(f => h.cols[f.k] === undefined).map(f => f.l) };
  }

  const shortKunde = s => String(s || '').replace(/\s*#\d+.*$/, '').trim();
  const wcName = r => [shortKunde(r.kunde), r.kom].filter(Boolean).join(' – ') || r.nr;
  const rowKey = r => str(r.nr) ? 'nr:' + str(r.nr).toLowerCase() : 'kk:' + normH(r.kunde) + '|' + normH(r.kom);
  const projKey = p => str(p.nr) ? 'nr:' + str(p.nr).toLowerCase() : p.wc ? 'kk:' + normH(p.wc.kunde) + '|' + normH(p.wc.kom) : null;
  const WC_LABEL = { kunde: 'Kunde', kom: 'Kommission', typ: 'Typ', phase: 'Phase', golive: 'GoLive', pl: 'Projektleiter', cons: 'Consultant', status: 'Status', plan: 'Budget (h)', ist: 'Gebucht gesamt (h)', istab: 'Gebucht abrechenbar (h)', start: 'Start', ende: 'Ende', datum: 'Auftragsdatum', akt: 'Aktuelles' };
  // Plan erstellen, ohne etwas zu verändern: was ist neu, was ändert sich, was fehlt im Export
  function planImport(state, rows) {
    const byKey = new Map();
    state.projects.forEach(p => { const k = projKey(p); if (k && !byKey.has(k)) byKey.set(k, p); });
    const plan = { creates: [], updates: [], unchanged: [], missing: [], dupes: [], reappear: [], done: [] }, seen = new Set();
    rows.forEach(r => {
      const k = rowKey(r);
      if (seen.has(k)) { plan.dupes.push(r.nr || wcName(r)); return; }
      seen.add(k);
      const p = byKey.get(k);
      if (!p) { plan.creates.push(r); return; }
      const ch = [];
      Object.keys(WC_LABEL).forEach(f => { const a = p.wc ? p.wc[f] : undefined, b = r[f]; if (!same(a, b)) ch.push({ k: f, from: a == null ? '' : a, to: b == null ? '' : b }); });
      if (p.wc && p.wc.missingSince) plan.reappear.push(p.id);
      if (ch.length || !p.wc || p.wc.missingSince) plan.updates.push({ pid: p.id, row: r, changes: ch }); else plan.unchanged.push(p.id);
      if (p.status !== 'd' && !p.archived && isDoneRow(r, state.settings)) plan.done.push(p.id);
    });
    state.projects.forEach(p => { const k = projKey(p); if (p.wc && k && !seen.has(k) && !p.wc.missingSince) plan.missing.push(p.id); });
    return plan;
  }
  const same = (a, b) => (a == null || a === '' ? '' : String(a)) === (b == null || b === '' ? '' : String(b));
  // Führt den Plan aus. Lokale Felder (Ampel, nächster Schritt, Aufgaben, Notizen, Schätzungen, Risiken …) bleiben unangetastet.
  // Führt den Plan aus. Lokale Felder (Ampel, nächster Schritt, Aufgaben, Notizen, Schätzungen, Risiken …) bleiben unangetastet.
  // Ausnahmen: der automatisch erzeugte Name/Kunde folgt weclapp, solange er nicht selbst geändert wurde;
  // „Fertig“ wird nur gesetzt, wenn info.closeDone ausdrücklich gewählt ist.
  // Jede Änderung landet strukturiert in p.hist (Feld, vorher, nachher, Import-ID).
  function applyImport(state, plan, info) {
    const s = state, t = info && info.today || isoDate(), at = info && info.at || new Date().toISOString(), file = info && info.file || '';
    const imp = info && info.id || 'i' + uid(), H = (p, k, from, to) => addHist(p, { at, src: 'weclapp', k, from, to, imp });
    let created = 0, updated = 0, closed = 0;
    plan.creates.forEach(r => {
      const done = isDoneRow(r, s.settings);
      const p = newProject({ nr: str(r.nr), name: wcName(r), kunde: shortKunde(r.kunde), status: done ? 'd' : 'g', wc: Object.assign(normWc(r), { importedAt: at, imp, newImp: imp }), log: [] }, t);
      H(p, '_created', '', file);
      s.projects.push(p); created++;
    });
    plan.updates.forEach(u => {
      const p = s.projects.find(x => x.id === u.pid); if (!p) return;
      const old = p.wc || {}, wasMissing = old.missingSince;
      // automatisch erzeugten Namen/Kunden mitziehen, eigene Bezeichnungen bleiben
      if (p.wc && p.name === wcName(old) && wcName(u.row) !== p.name) { H(p, 'name', p.name, wcName(u.row)); p.name = wcName(u.row); }
      if (p.wc && p.kunde === shortKunde(old.kunde) && shortKunde(u.row.kunde) !== p.kunde) p.kunde = shortKunde(u.row.kunde);
      if (!p.kunde) p.kunde = shortKunde(u.row.kunde);
      if (!str(p.nr) && u.row.nr) p.nr = str(u.row.nr);
      u.changes.forEach(c => c.k === 'akt' ? H(p, 'akt', '', aktDiff(old.akt, u.row.akt, t)) : H(p, c.k === 'status' ? 'status_wc' : c.k, c.from, c.to));
      if (wasMissing) H(p, '_back', '', '');
      p.wc = Object.assign(normWc(u.row), { importedAt: at, missingSince: '', imp: u.changes.length ? imp : old.imp || '', newImp: old.newImp || '' });
      if (u.changes.length) updated++;
    });
    plan.unchanged.forEach(id => { const p = s.projects.find(x => x.id === id); if (p && p.wc) p.wc.importedAt = at; });
    plan.missing.forEach(id => { const p = s.projects.find(x => x.id === id); if (p && p.wc) { p.wc.missingSince = t; H(p, '_missing', '', ''); } });
    if (info && info.closeDone) plan.done.forEach(id => { const p = s.projects.find(x => x.id === id); if (p && p.status !== 'd') { H(p, 'status', p.status, 'd'); p.status = 'd'; closed++; } });
    const res = { id: imp, at, file, created, updated, unchanged: plan.unchanged.length, missing: plan.missing.length, done: plan.done.length, closed };
    s.meta.lastImport = res;
    s.meta.imports = arr(s.meta.imports).concat([res]).slice(-IMPORTS_MAX);
    return res;
  }
  function addHist(p, e) { p.hist = arr(p.hist); p.hist.push({ at: e.at || new Date().toISOString(), src: e.src === 'weclapp' ? 'weclapp' : 'ich', k: e.k, from: hv(e.from), to: hv(e.to), imp: str(e.imp) }); if (p.hist.length > HIST_MAX) p.hist.splice(0, p.hist.length - HIST_MAX); }
  // Eigene Änderung festhalten; mehrere Änderungen am selben Feld innerhalb von 10 Minuten werden zusammengefasst
  function recordChange(p, k, from, to, at) {
    const now = at || new Date().toISOString(); p.hist = arr(p.hist);
    const last = p.hist[p.hist.length - 1];
    if (last && last.src === 'ich' && last.k === k && Date.parse(now) - Date.parse(last.at) < 10 * 60000) {
      last.to = hv(to); last.at = now;
      if (same(last.from, last.to)) p.hist.pop();
      return;
    }
    if (same(from, to)) return;
    addHist(p, { at: now, src: 'ich', k, from, to });
  }
  // Neue Einträge in „Aktuelles“ (gegenüber dem alten Stand) als lesbarer Text
  function aktDiff(oldText, newText, today) {
    const key = e => e.d + '|' + e.t, A = parseAkt(oldText, today), B = parseAkt(newText, today), seen = new Set(A.ent.map(key));
    const fresh = B.ent.filter(e => !seen.has(key(e))).map(e => fmtD(e.d) + ': ' + e.t);
    if (fresh.length) return fresh.join('\n').slice(0, 2000);
    return String(newText || '').trim() ? String(newText).trim().split('\n')[0].slice(0, 300) : '(geleert)';
  }
  const HIST_LABEL = Object.assign({ status: 'Status', next: 'Nächster Schritt', due: 'Mein Termin', prio: 'Priorität', name: 'Name', _created: 'Aus weclapp importiert', _missing: 'Nicht mehr im weclapp-Export', _back: 'Wieder im weclapp-Export' }, WC_LABEL_PLAIN());
  function WC_LABEL_PLAIN() { return { kunde: 'Kunde', kom: 'Kommission', typ: 'Typ', phase: 'Phase', golive: 'GoLive', pl: 'Projektleiter', cons: 'Consultant', status_wc: 'Status (weclapp)', plan: 'Budget (h)', ist: 'Gebucht gesamt (h)', istab: 'Gebucht abrechenbar (h)', start: 'Start', ende: 'Ende', datum: 'Auftragsdatum', akt: 'Aktuelles' }; }
  // Lesbare Darstellung eines Historien-Eintrags
  function histText(e) {
    const lbl = HIST_LABEL[e.k] || e.k;
    const v = x => x === '' || x == null ? '–' : e.k === 'status' && STATUS[x] ? STATUS[x].n : e.k === 'prio' ? ({ 1: 'Hoch', 2: 'Mittel', 3: 'Niedrig' })[x] || x : e.k === 'due' ? fmtD(x) || x : fmtVal(e.k, x);
    if (e.k.startsWith('_')) return lbl + (e.k === '_created' && e.to ? ' (' + e.to + ')' : '');
    if (e.k === 'akt') return 'Aktuelles neu: ' + e.to;
    return lbl + ': ' + v(e.from) + ' → ' + v(e.to);
  }
  const fmtVal = (k, v) => ['start', 'ende', 'datum'].includes(k) ? fmtD(v) || v : ['plan', 'ist', 'istab'].includes(k) ? String(Math.round(num(v) * 10) / 10).replace('.', ',') : v;
  const isDoneRow = (r, settings) => { const w = String((settings || DEFAULT_SETTINGS).done).toLowerCase().split(',').map(x => x.trim()).filter(Boolean), t = (r.phase + ' ' + r.status).toLowerCase(); return w.some(x => t.includes(x)); };

  // ---------------- „Aktuelles“ lesen ----------------
  const MON = { jan: 1, feb: 2, 'mär': 3, mae: 3, mar: 3, mrz: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
  const HEAD = new RegExp('^[\\s#*\\-•·>\\[\\(]*(?:(?:stand|update|aktuell|vom|am|ab)\\s*[:\\-]?\\s*)?' +
    '(?:(\\d{4})-(\\d{1,2})-(\\d{1,2})|(\\d{1,2})\\s*[./]\\s*(\\d{1,2})(?:\\s*[./]\\s*(\\d{4}|\\d{2}))?(?!\\d)\\.?' +
    '|(\\d{1,2})\\.?\\s*(jan|feb|mär|mae|mar|mrz|apr|mai|may|jun|jul|aug|sep|okt|oct|nov|dez|dec)[a-zä]*\\.?\\s*(\\d{4}|\\d{2})?(?!\\d))' +
    '[\\s\\]\\)#]*(?:\\([^)]{0,30}\\)\\s*)?[:\\-–—]?\\s*#?\\s*([\\s\\S]*)$', 'i');
  const SPLIT = /(?=#\s*(?:\d{1,2}\s*[./]\s*\d{1,2}|\d{4}-\d{1,2}-\d{1,2}))/;
  function parseAkt(text, today) {
    const out = { ent: [], notes: [], latest: null };
    try {
      const t0 = dOf(today || isoDate()), src = String(text || '');
      if (!src.trim()) return out;
      const chunks = [];
      src.replace(/\r/g, '').split('\n').forEach(line => line.split(SPLIT).forEach(p => { if (p.trim()) chunks.push(p.trim()); }));
      let cur = null;
      chunks.forEach(ch => {
        const m = HEAD.exec(ch); let date = null, rest = ch;
        if (m) {
          let y, mo, d;
          if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; } else if (m[4]) { d = +m[4]; mo = +m[5]; if (m[6]) y = m[6].length === 2 ? 2000 + +m[6] : +m[6]; } else { d = +m[7]; mo = MON[m[8].toLowerCase()]; if (m[9]) y = m[9].length === 2 ? 2000 + +m[9] : +m[9]; }
          if (!y) { let dt = new Date(t0.getFullYear(), mo - 1, d); if (dt - t0 > 30 * 864e5) dt = new Date(t0.getFullYear() - 1, mo - 1, d); if (dt.getMonth() === mo - 1 && dt.getDate() === d) date = dt; }
          else { const dt = new Date(y, mo - 1, d); if (dt.getMonth() === mo - 1 && dt.getDate() === d && y >= 2010 && y <= t0.getFullYear() + 2) date = dt; }
          if (date) rest = m[10];
        }
        if (date) { cur = { d: isoDate(date), t: (rest || '').trim() }; out.ent.push(cur); }
        else if (/^\s*#/.test(ch) || !cur) { cur = null; out.notes.push(ch.replace(/^[\s#]+/, '')); }
        else cur.t += (cur.t ? ' ' : '') + ch;
      });
      const real = out.ent.filter(e => daysBetween(isoDate(t0), e.d) <= 7);
      out.latest = real.reduce((a, e) => !a || e.d > a.d ? e : a, null);
      out.ent.sort((a, b) => b.d.localeCompare(a.d));
    } catch (e) { /* unlesbarer Text bleibt als Rohtext sichtbar */ }
    return out;
  }

  // ---------------- Hinweise & Ampel ----------------
  const isActive = p => !p.archived && p.status !== 'p' && p.status !== 'd';
  const progress = p => p.tasks.length ? Math.round(p.tasks.filter(t => t.done).length / p.tasks.length * 100) : null;
  // Ampel: gelb/rot nur durch Budget, eigene Aufgaben, eigene Termine und den selbst gesetzten Status.
  // Projektstart/-ende aus weclapp, „Aktuelles“, fehlender nächster Schritt usw. erscheinen nur als Hinweis (n).
  function flags(p, settings, today) {
    const c = Object.assign({}, DEFAULT_SETTINGS, settings || {}), t = today || isoDate(), F = [], add = (s, x) => F.push({ s, t: x });
    if (p.archived) return F;
    if (p.status === 'r') add('r', '🔴 Als blockiert markiert');
    if (p.status === 'y') add('y', '🟡 Als „Achtung“ markiert');
    const open = p.tasks.filter(x => !x.done && x.due), od = open.filter(x => x.due < t).length, soon = open.filter(x => x.due >= t && daysBetween(t, x.due) <= c.soonDays).length;
    if (od) add('r', '⏰ ' + od + ' überfällige Aufgabe' + (od > 1 ? 'n' : ''));
    if (soon) add('y', '⏳ ' + soon + ' Aufgabe' + (soon > 1 ? 'n' : '') + ' in den nächsten ' + c.soonDays + ' Tagen fällig');
    if (p.due && p.status !== 'd') { const d = daysBetween(t, p.due); if (d < 0) add('r', '🏁 Mein Termin überschritten (' + fmtD(p.due) + ')'); else if (d <= c.soonDays) add('y', '🏁 Mein Termin in ' + d + ' Tagen (' + fmtD(p.due) + ')'); }
    const w = p.wc, b = budget(p);
    if (b && !w.missingSince) {
      if (b.pct > c.budgetR) add('r', '💶 Abrechenbar über Budget (' + Math.round(b.pct) + ' %)');
      else if (b.pct >= c.budgetY) add('y', '💶 Budget zu ' + Math.round(b.pct) + ' % verbraucht');
      if (b.pctAll != null && b.pctAll > c.budgetR && b.pctAll - b.pct >= 5) add(b.pct > c.budgetR ? 'y' : 'r', '💸 Gesamtaufwand ' + Math.round(b.pctAll) + ' % des Budgets');
    }
    if (w && !w.missingSince) {
      const done = isDoneRow(w, c) || p.status === 'd';
      if (w.ende && w.ende < t && !done) add('n', '📅 Projektende laut weclapp überschritten (' + fmtD(w.ende) + ')');
      if (!done && isActive(p)) {
        const A = parseAkt(w.akt, t);
        if (!w.akt) add('n', '✍️ „Aktuelles“ in weclapp ist leer');
        else if (A.latest && daysBetween(A.latest.d, t) >= c.aktStale) add('n', '✍️ „Aktuelles“ ' + daysBetween(A.latest.d, t) + ' Tage alt');
      }
    }
    if (w && !w.missingSince && p.status !== 'd' && isDoneRow(w, c)) add('n', '✅ In weclapp abgeschlossen (' + (w.phase || w.status) + ') – hier noch offen');
    if (w && w.missingSince) add('n', 'ℹ️ Seit ' + fmtD(w.missingSince) + ' nicht mehr im weclapp-Export');
    if (isActive(p)) {
      if (!p.next) add('n', '➜ Kein nächster Schritt festgelegt');
      const sd = daysBetween(p.updated, t); if (sd >= c.stale) add('n', '🕒 ' + sd + ' Tage ohne Update');
      const crit = p.risks.filter(r => r.w * r.a >= 15).length; if (crit) add('n', '⚠️ ' + crit + ' kritische(s) Risiko');
    }
    return F;
  }
  // Budget aus weclapp: geplant (abrechenbar) gegen gebucht abrechenbar; Rest absolut und relativ
  function budget(p) {
    const w = p && p.wc; if (!w || !(w.plan > 0)) return null;
    const used = w.istab != null ? w.istab : (w.ist != null ? w.ist : 0);
    return { plan: w.plan, used, rest: w.plan - used, pct: used / w.plan * 100, restPct: (w.plan - used) / w.plan * 100, usedAll: w.ist, pctAll: w.ist != null ? w.ist / w.plan * 100 : null };
  }
  function budgetTotals(projects) {
    const L = arr(projects).map(budget).filter(Boolean), plan = L.reduce((a, b) => a + b.plan, 0), used = L.reduce((a, b) => a + b.used, 0);
    return { count: L.length, plan, used, rest: plan - used, pct: plan ? used / plan * 100 : 0, restPct: plan ? (plan - used) / plan * 100 : 0, over: L.filter(b => b.rest < 0).length };
  }
  // Kürzel: erster Buchstabe des Vornamens + erste zwei des Nachnamens (Max Albrecht → MAL)
  function initials(name) {
    let s = str(name).replace(/^Benutzer\s+/i, '');
    if (s.includes(',')) { const [a, b] = s.split(','); s = (b || '').trim() + ' ' + a.trim(); }
    const w = s.split(/\s+/).filter(x => /[A-Za-zÄÖÜäöüß]/.test(x));
    if (!w.length) return '';
    if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    return (w[0][0] + w[w.length - 1].slice(0, 2)).toUpperCase();
  }
  const weclappLink = (base, nr) => nr ? String(base || DEFAULT_SETTINGS.weclappUrl).trim().replace(/\/+$/, '') + '/app/search?s=' + encodeURIComponent(nr) : '';
  // „Aktuelles“: neuer Eintrag mit Datums-Präfix oben anfügen; Schreibweise (# davor oder nicht) wie die vorhandenen Einträge
  function aktPrefix(existing, today) {
    const first = String(existing || '').split('\n').map(x => x.trim()).find(Boolean) || '';
    return (/^#\s*\d/.test(first) ? '#' : '') + fmtD(today || isoDate()) + ': ';
  }
  function aktCompose(existing, text, today) {
    const t = str(text); if (!t) return String(existing || '');
    const line = aktPrefix(existing, today) + t.replace(/\s*\n\s*/g, ' ');
    return existing && String(existing).trim() ? line + '\n' + String(existing).replace(/^\s+/, '') : line;
  }
  const severity = F => F.some(f => f.s === 'r') ? 'r' : F.some(f => f.s === 'y') ? 'y' : 'g';
  function focusItems(state, today) {
    const t = today || isoDate(), od = [], wk = [], nx = [];
    state.projects.filter(isActive).forEach(p => {
      p.tasks.filter(x => !x.done && x.due).forEach(x => { const d = daysBetween(t, x.due); if (d < 0) od.push({ p, t: x, d }); else if (d <= 7) wk.push({ p, t: x, d }); });
      if (p.next) nx.push({ p });
    });
    od.sort((a, b) => a.d - b.d); wk.sort((a, b) => a.d - b.d);
    nx.sort((a, b) => (STATUS[a.p.status].ord - STATUS[b.p.status].ord) || a.p.prio - b.p.prio);
    return { od, wk, nx };
  }

  // ---------------- Schätzung (PERT) ----------------
  const tE = t => (num(t.o) + 4 * num(t.m) + num(t.p)) / 6;
  const tV = t => Math.pow((num(t.p) - num(t.o)) / 6, 2);
  function calcEstimate(es) {
    const base = es.tasks.reduce((a, t) => a + tE(t), 0), varc = es.tasks.reduce((a, t) => a + tV(t), 0);
    const ex = es.extras.filter(x => x.on).map(x => ({ x, amt: x.type === 'pct' ? base * num(x.v) / 100 : num(x.v) }));
    const pct = es.extras.filter(x => x.on && x.type === 'pct').reduce((a, x) => a + num(x.v), 0) / 100;
    const total = base + ex.reduce((a, e) => a + e.amt, 0), sd = Math.sqrt(varc) * (1 + pct);
    return { base, ex, total, sd, p85: total + 1.04 * sd, r68: [Math.max(0, total - sd), total + sd], r95: [Math.max(0, total - 2 * sd), total + 2 * sd],
      bad: es.tasks.filter(t => !(num(t.o) <= num(t.m) && num(t.m) <= num(t.p))) };
  }
  function customerView(es) {
    const r = calcEstimate(es), buffer = Math.max(0, r.p85 - r.total);
    return { tasks: es.tasks.map(t => ({ n: t.n, d: t.d, sid: t.sid, e: tE(t) })), base: r.base, extras: r.ex.map(e => ({ n: e.x.n, pct: e.x.type === 'pct' ? num(e.x.v) : null, amt: e.amt })), buffer, total: r.total + buffer };
  }
  // Bibliothek: Aufgaben und Stories werden beim Eintragen automatisch gemerkt (gleicher Name = aktualisieren)
  function libUpsertTask(state, t, unit, auto) {
    if (!str(t.n) || !(num(t.m) || num(t.p))) return null;
    const L = state.lib.tasks, ex = L.find(x => normTxt(x.n) === normTxt(t.n));
    if (ex && auto && !ex.auto) return ex;   // bewusst gespeicherte Einträge nicht automatisch überschreiben
    const item = { n: str(t.n), d: str(t.d), o: num(t.o), m: num(t.m), p: num(t.p), unit: UNITS.includes(unit) ? unit : 'Tage', auto: !!auto };
    if (ex) return Object.assign(ex, item);
    const n = Object.assign({ id: uid(), used: 0 }, item); L.push(n); return n;
  }
  function libUpsertStory(state, s) {
    if (!str(s.want)) return null;
    const L = state.lib.stories, ex = L.find(x => normTxt(x.want) === normTxt(s.want));
    const item = { role: str(s.role), want: str(s.want), benefit: str(s.benefit), ac: arr(s.ac).map(str).filter(Boolean), prio: PRIO[s.prio] ? s.prio : 'must' };
    if (ex) return Object.assign(ex, item);
    const n = Object.assign({ id: uid() }, item); L.push(n); return n;
  }
  const conv = (v, from, to) => (from === to || !HOURS[from] || !HOURS[to]) ? num(v) : Math.round(num(v) * HOURS[from] / HOURS[to] * 100) / 100;
  const storyText = s => 'Als ' + (s.role || '…') + ' möchte ich ' + (s.want || '…') + (s.benefit ? ', damit ' + s.benefit : '') + '.';
  function cloneEstimate(src) {
    const c = JSON.parse(JSON.stringify(src)), map = {};
    c.id = uid(); c.created = c.updated = Date.now();
    c.stories.forEach(s => { const o = s.id; s.id = uid(); map[o] = s.id; });
    c.tasks.forEach(t => { t.id = uid(); t.sid = map[t.sid] || ''; });
    c.extras.forEach(x => x.id = uid());
    return c;
  }
  const normTxt = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß ]/g, ' ').replace(/\s+/g, ' ').trim();
  // Ähnlichste bekannte Aufgabe (Bibliothek oder andere Schätzungen) zu einem Namen
  function bestMatch(state, name, exceptId) {
    const q = normTxt(name); if (q.length < 3) return null;
    const words = q.split(' ').filter(w => w.length > 2), L = state.lib.tasks.map(t => ({ t, unit: t.unit, from: 'Bibliothek', lib: true }));
    state.estimates.forEach(x => { if (x.id !== exceptId) x.tasks.forEach(t => { if (t.n && (num(t.m) || num(t.p))) L.push({ t, unit: x.unit, from: x.title }); }); });
    let best = null, bs = 0;
    L.forEach(k => { const kn = normTxt(k.t.n); let s = kn.includes(q) ? 3 : 0; words.forEach(w => { if (kn.includes(w)) s += 1; }); if (k.lib) s += .5; if (s > bs) { bs = s; best = k; } });
    return bs >= 2 ? best : null;
  }

  // ---------------- Übernahme aus den bisherigen Apps ----------------
  // radar = Daten aus „Projekt-Radar“ (projektRadar.v1), pm = Daten aus „PM-Rechner“ (pmRechner.v1)
  function migrateFromApps(state, radar, pm, today) {
    const s = state, t = today || isoDate(), rep = { projects: 0, estimates: 0, lib: 0, ideas: 0 };
    const names = new Map(s.projects.map(p => [normTxt(p.name), p]));
    if (isObj(radar)) {
      arr(radar.projects).filter(isObj).forEach(rp => {
        if (names.has(normTxt(rp.name)) || s.projects.some(p => p.importedFrom === 'radar:' + rp.id)) return;
        const p = newProject({ name: str(rp.name) || 'Projekt', kunde: '', status: STATUS[rp.status] ? rp.status : 'g', prio: [1, 2, 3].includes(rp.prio) ? rp.prio : 2, due: validIso(rp.due) ? rp.due : '', next: str(rp.next),
          notes: [rp.area ? 'Bereich: ' + rp.area : '', typeof rp.notes === 'string' ? rp.notes : ''].filter(Boolean).join('\n'),
          tasks: arr(rp.tasks).filter(isObj).map(x => ({ id: uid(), t: str(x.t) || 'Aufgabe', due: validIso(x.due) ? x.due : '', done: !!x.done, who: '' })),
          log: arr(rp.log).filter(isObj).map(l => ({ d: validIso(l.d) ? l.d : t, t: str(l.t), src: '' })).filter(l => l.t).concat([{ d: t, t: 'Aus Projekt-Radar übernommen', src: '' }]),
          created: validIso(rp.created) ? rp.created : t, updated: validIso(rp.updated) ? rp.updated : t }, t);
        p.importedFrom = 'radar:' + rp.id;
        s.projects.push(p); names.set(normTxt(p.name), p); rep.projects++;
      });
      arr(radar.ideas).filter(isObj).forEach(i => { if (str(i.t) && !s.ideas.some(x => x.t === str(i.t))) { s.ideas.push({ id: uid(), t: str(i.t) }); rep.ideas++; } });
    }
    if (isObj(pm) && isObj(pm.est)) {
      const pmProj = new Map(arr(pm.est.projects).filter(isObj).map(p => [p.id, str(p.name)]));
      arr(pm.est.estimates).filter(isObj).forEach(e => {
        if (s.estimates.some(x => x.importedFrom === 'pm:' + e.id)) return;
        let pid = '';
        const pname = pmProj.get(e.pid);
        if (pname) { let p = names.get(normTxt(pname)); if (!p) { p = newProject({ name: pname, log: [{ d: t, t: 'Aus PM-Rechner übernommen', src: '' }] }, t); s.projects.push(p); names.set(normTxt(pname), p); rep.projects++; } pid = p.id; }
        const ne = Object.assign(JSON.parse(JSON.stringify(e)), { pid, importedFrom: 'pm:' + e.id });
        s.estimates.push(ne); rep.estimates++;
      });
      const L = isObj(pm.est.lib) ? pm.est.lib : {};
      arr(L.tasks).forEach(x => { if (isObj(x) && str(x.n) && !s.lib.tasks.some(y => normTxt(y.n) === normTxt(x.n))) { s.lib.tasks.push(Object.assign({}, x, { id: uid() })); rep.lib++; } });
      arr(L.stories).forEach(x => { if (isObj(x) && str(x.want) && !s.lib.stories.some(y => normTxt(y.want) === normTxt(x.want))) { s.lib.stories.push(Object.assign({}, x, { id: uid() })); rep.lib++; } });
      if (isObj(pm.cap)) s.tools.cap = Object.assign({}, s.tools.cap, pm.cap);
      if (isObj(pm.fc)) s.tools.fc = Object.assign({}, s.tools.fc, pm.fc);
    }
    const n = normalize(s);
    // importedFrom-Markierungen erhalten (normalize kennt sie nicht)
    n.projects.forEach((p, i) => { if (s.projects[i] && s.projects[i].importedFrom) p.importedFrom = s.projects[i].importedFrom; });
    n.estimates.forEach((e, i) => { if (s.estimates[i] && s.estimates[i].importedFrom) e.importedFrom = s.estimates[i].importedFrom; });
    return { state: n, rep };
  }

  // ---------------- Interne Versionen ----------------
  // Behält die neuesten `keep` Stände; automatische höchstens alle `minGapMin` Minuten
  function shouldAutoSnapshot(list, now, minGapMin = 30) {
    const autos = arr(list).filter(x => x.kind === 'auto');
    if (!autos.length) return true;
    return now - Math.max(...autos.map(x => x.at)) >= minGapMin * 60000;
  }
  function pruneSnapshots(list, keep = 30) {
    const L = arr(list).slice().sort((a, b) => b.at - a.at);
    const manual = L.filter(x => x.kind !== 'auto').slice(0, keep), auto = L.filter(x => x.kind === 'auto').slice(0, keep);
    return manual.concat(auto).sort((a, b) => b.at - a.at).slice(0, keep * 2);
  }

  const Core = {
    FORMAT, APP, STATUS, EST_STATUS, PRIO, UNITS, HOURS, FIELDS, DEFAULT_SETTINGS, WC_LABEL,
    uid, isoDate, fmtD, daysBetween, validIso, num,
    empty, normalize, newProject, newEstimate, EXTRAS,
    makeBackup, validateBackup, counts,
    normH, autoMap, findHeader, decode, parseCSV, toISO, toNum, buildRows, readTable, planImport, applyImport, wcName, shortKunde,
    recordChange, addHist, histText, aktDiff, HIST_LABEL,
    parseAkt, flags, severity, isActive, progress, focusItems, budget, budgetTotals, initials, weclappLink, aktPrefix, aktCompose, customerView, libUpsertTask, libUpsertStory,
    tE, tV, calcEstimate, conv, storyText, cloneEstimate, bestMatch, normTxt,
    migrateFromApps, shouldAutoSnapshot, pruneSnapshots
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core; else root.Core = Core;
})(typeof self !== 'undefined' ? self : this);
