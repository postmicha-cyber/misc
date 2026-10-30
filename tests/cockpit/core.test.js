// Unit-Tests für cockpit/core.js. Start: node --test tests/cockpit/
// Jede Testbezeichnung beginnt mit der Nummer aus tests/cockpit/TESTFAELLE.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Core = require('../../cockpit/core.js');
const XLSX = require('../../xlsx.mini.min.js');

const FIX = f => fs.readFileSync(path.join(__dirname, 'fixtures', f));
const TODAY = '2026-10-29';
const readCsv = f => Core.readTable(Core.parseCSV(Core.decode(FIX(f))), {});
function importFile(state, f, today = TODAY) {
  const t = readCsv(f); assert.ok(t.ok, t.err);
  const plan = Core.planImport(state, t.rows);
  const res = Core.applyImport(state, plan, { today, file: f, at: today + 'T10:00:00Z' });
  return { plan, res, t };
}

// ---------- Datenmodell & Reparatur ----------
test('U01 normalize: leerer oder kaputter Stand ergibt gültigen Stand', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}, { projects: 'nope' }, { projects: [null, 5, { name: 7 }] }]) {
    const s = Core.normalize(bad);
    assert.ok(Array.isArray(s.projects)); assert.ok(Array.isArray(s.estimates)); assert.equal(s.app, 'projekt-cockpit');
  }
  const s = Core.normalize({ projects: [{ name: 'A', status: 'kaputt', prio: 9, due: '31.12.2026', tasks: [{ t: '' }, 'x'] }] });
  assert.equal(s.projects[0].status, 'g'); assert.equal(s.projects[0].prio, 2); assert.equal(s.projects[0].due, ''); assert.equal(s.projects[0].tasks.length, 1);
});
test('U02 normalize: doppelte IDs werden eindeutig gemacht', () => {
  const s = Core.normalize({ projects: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] });
  assert.notEqual(s.projects[0].id, s.projects[1].id);
});
test('U03 normalize: Story-Verknüpfung auf gelöschte Story wird geleert, Projekt-Zuordnung auf unbekanntes Projekt ebenso', () => {
  const s = Core.normalize({ projects: [{ id: 'p1', name: 'P' }], estimates: [{ id: 'e', pid: 'gibtsnicht', stories: [{ id: 's1', want: 'x' }], tasks: [{ n: 'a', sid: 's1' }, { n: 'b', sid: 'weg' }] }] });
  assert.equal(s.estimates[0].pid, ''); assert.equal(s.estimates[0].tasks[0].sid, 's1'); assert.equal(s.estimates[0].tasks[1].sid, '');
});
test('U04 normalize ist idempotent', () => {
  const a = Core.normalize({ projects: [{ id: 'p', name: 'P', tasks: [{ id: 't', t: 'x' }] }] });
  assert.deepEqual(Core.normalize(JSON.parse(JSON.stringify(a))), a);
});

// ---------- Backup ----------
test('U10 Backup: Rundreise erhält alle Daten', () => {
  const s = Core.normalize({ projects: [{ id: 'p', name: 'Projekt', notes: 'Ä ö ü ß 😀', tasks: [{ id: 't', t: 'Aufgabe', due: '2026-11-01' }] }], estimates: [{ id: 'e', pid: 'p', title: 'S', tasks: [{ id: 'x', n: 'A', o: 1, m: 2, p: 4 }] }] });
  const txt = JSON.stringify(Core.makeBackup(s, new Date('2026-10-29T10:00:00Z')));
  const v = Core.validateBackup(txt);
  assert.ok(v.ok, v.err); assert.deepEqual(v.data, s); assert.equal(v.counts.projects, 1); assert.equal(v.counts.tasks, 1);
});
test('U11 Backup: beschädigte, fremde und zu neue Dateien werden abgelehnt', () => {
  assert.equal(Core.validateBackup('{kaputt').ok, false);
  assert.match(Core.validateBackup({ app: 'rad-tracker', data: {} }).err, /rad-tracker/);
  assert.equal(Core.validateBackup({ projects: [] }).ok, false);
  assert.match(Core.validateBackup({ app: 'projekt-cockpit', format: 99, data: { projects: [] } }).err, /neueren Version/);
  assert.equal(Core.validateBackup({ app: 'projekt-cockpit', format: 1, data: {} }).ok, false);
});

// ---------- weclapp: Lesen ----------
test('U20 weclapp CSV: Kopfzeile unter Titelzeilen gefunden, alle 16 Spalten zugeordnet', () => {
  const t = readCsv('weclapp-1.csv');
  assert.ok(t.ok); assert.equal(t.hi, 2); assert.equal(Object.keys(t.cols).length, 16); assert.deepEqual(t.missing, []); assert.equal(t.rows.length, 4);
});
test('U21 weclapp: Werte richtig gelesen (Datum, deutsche Zahlen, Tausenderpunkt, „Benutzer“-Präfix, mehrzeilige Zelle)', () => {
  const r = readCsv('weclapp-1.csv').rows;
  assert.equal(r[0].nr, '1001'); assert.equal(r[0].start, '2026-03-01'); assert.equal(r[0].ende, '2026-11-30');
  assert.equal(r[0].plan, 200); assert.equal(r[0].ist, 188.5); assert.equal(r[0].istab, 150);
  assert.equal(r[0].pl, 'Max Muster'); assert.equal(r[0].kom, 'Einführung Rechnungsverarbeitung');
  assert.ok(r[0].akt.includes('\n')); assert.equal(r[2].plan, 1160.5);
});
test('U22 weclapp: abrechenbar und gesamt werden nicht verwechselt (startsWith-Falle)', () => {
  const t = Core.readTable([['Auftragsnummer', 'Kunde', 'Kommission', 'Gebuchter abrechenbarer Aufwand (h)', 'Gebuchter Aufwand (h)'], ['1', 'K', 'X', '5', '9']], {});
  assert.equal(t.rows[0].istab, 5); assert.equal(t.rows[0].ist, 9);
});
test('U23 weclapp: Excel-Datei (xlsx) mit Datumszahlen wird gelesen', () => {
  const ws = XLSX.utils.aoa_to_sheet([['Auftragsnummer', 'Kunde', 'Kommission', 'Projekt Start', 'Geplanter abrechenbarer Aufwand (h)'], ['A-7', 'Kunde X', 'Proj', 46113, 12.5]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const raw = XLSX.utils.sheet_to_json(XLSX.read(buf, { type: 'array' }).Sheets.S, { header: 1, raw: true, defval: '' });
  const t = Core.readTable(raw, {});
  assert.equal(t.rows[0].start, '2026-04-01'); assert.equal(t.rows[0].plan, 12.5);
});
test('U24 weclapp: Datei ohne bekannte Spalten wird verständlich abgelehnt', () => {
  const t = Core.readTable([['a', 'b'], ['1', '2']], {}); assert.equal(t.ok, false); assert.match(t.err, /Spalten/);
});
test('U25 toISO / toNum: Randfälle', () => {
  assert.equal(Core.toISO('31.02.2026'), ''); assert.equal(Core.toISO('1.3.26'), '2026-03-01'); assert.equal(Core.toISO(''), ''); assert.equal(Core.toISO('morgen'), '');
  assert.equal(Core.toNum('1.234,5'), 1234.5); assert.equal(Core.toNum('1,234.5'), 1234.5); assert.equal(Core.toNum(''), null); assert.equal(Core.toNum('12 h'), 12); assert.equal(Core.toNum('abc'), null);
});
test('U26 CSV in Windows-1252 (Umlaute) wird erkannt', () => {
  const bytes = Uint8Array.from([...'Auftragsnummer;Kunde;Kommission\n1;M'].map(c => c.charCodeAt(0)).concat([0xFC], [...'ller;Pr'].map(c => c.charCodeAt(0)), [0xFC], [...'fung'].map(c => c.charCodeAt(0))));
  const t = Core.readTable(Core.parseCSV(Core.decode(bytes)), {});
  assert.equal(t.rows[0].kunde, 'Müller'); assert.equal(t.rows[0].kom, 'Prüfung');
});

// ---------- weclapp: Zusammenführen ----------
test('U30 Erstimport legt Projekte an, Fertig-Phasen werden als fertig markiert', () => {
  const s = Core.empty(); const { res } = importFile(s, 'weclapp-1.csv');
  assert.equal(res.created, 4); assert.equal(s.projects.length, 4);
  assert.equal(s.projects[0].name, 'Nordlicht Handels GmbH – Einführung Rechnungsverarbeitung');
  assert.equal(s.projects[0].wc.plan, 200);
});
test('U31 Erneuter Import derselben Datei ändert nichts (idempotent)', () => {
  const s = Core.empty(); importFile(s, 'weclapp-1.csv');
  const before = JSON.stringify(s.projects.map(p => [p.id, p.name, p.wc.plan, p.log.length]));
  const { res } = importFile(s, 'weclapp-1.csv');
  assert.equal(res.created, 0); assert.equal(res.updated, 0); assert.equal(res.unchanged, 4);
  assert.equal(JSON.stringify(s.projects.map(p => [p.id, p.name, p.wc.plan, p.log.length])), before);
});
test('U32 Neuer Export: lokale Daten bleiben vollständig erhalten', () => {
  const s = Core.empty(); importFile(s, 'weclapp-1.csv');
  const p = s.projects.find(x => x.nr === '1001');
  Object.assign(p, { status: 'y', next: 'Abnahme terminieren', notes: 'Wichtig!', name: 'Mein eigener Name', prio: 1, due: '2026-12-01', pinned: true });
  p.tasks.push({ id: 't1', t: 'Testprotokoll prüfen', due: '2026-11-02', done: false, who: '' });
  p.risks.push({ id: 'r1', n: 'Key-User im Urlaub', w: 3, a: 4, m: 'Vertretung klären' });
  s.estimates.push(Core.newEstimate({ pid: p.id, title: 'Change Request' }));
  const local = JSON.stringify({ status: p.status, next: p.next, notes: p.notes, name: p.name, prio: p.prio, due: p.due, pinned: p.pinned, tasks: p.tasks, risks: p.risks });
  importFile(s, 'weclapp-2.csv');
  const q = s.projects.find(x => x.nr === '1001');
  assert.equal(q.id, p.id);
  assert.equal(JSON.stringify({ status: q.status, next: q.next, notes: q.notes, name: q.name, prio: q.prio, due: q.due, pinned: q.pinned, tasks: q.tasks, risks: q.risks }), local);
  assert.equal(s.estimates[0].pid, p.id);
  assert.equal(q.wc.plan, 240); assert.equal(q.wc.phase, 'Rollout');
});
test('U33 Änderungen aus weclapp werden im Verlauf protokolliert', () => {
  const s = Core.empty(); importFile(s, 'weclapp-1.csv'); importFile(s, 'weclapp-2.csv');
  const h = s.projects.find(x => x.nr === '1001').hist, txt = h.map(Core.histText).join(' | ');
  assert.match(txt, /Phase: Test & Abnahme → Rollout/); assert.match(txt, /Budget \(h\): 200 → 240/);
  assert.ok(h.every(e => e.src === 'weclapp' && e.imp)); assert.equal(new Set(h.filter(e => e.k !== '_created').map(e => e.imp)).size, 1);
});
test('U34 Projekt fehlt im neuen Export: wird NICHT gelöscht, sondern markiert; taucht es wieder auf, wird die Markierung entfernt', () => {
  const s = Core.empty(); importFile(s, 'weclapp-1.csv'); s.projects.find(x => x.nr === '1003').notes = 'behalten';
  const { res } = importFile(s, 'weclapp-2.csv');
  assert.equal(res.missing, 1); assert.equal(res.created, 1);
  const p = s.projects.find(x => x.nr === '1003');
  assert.ok(p); assert.equal(p.notes, 'behalten'); assert.equal(p.wc.missingSince, TODAY);
  assert.equal(s.projects.length, 5);
  importFile(s, 'weclapp-1.csv', '2026-11-05');
  assert.equal(s.projects.find(x => x.nr === '1003').wc.missingSince, '');
});
test('U35 Manuell angelegte Projekte werden vom Import nie verändert', () => {
  const s = Core.empty(); s.projects.push(Core.newProject({ name: 'Internes Projekt', notes: 'x' }, TODAY));
  const snap = JSON.stringify(s.projects[0]);
  importFile(s, 'weclapp-1.csv'); importFile(s, 'weclapp-2.csv');
  assert.equal(JSON.stringify(s.projects.find(p => p.name === 'Internes Projekt')), snap);
});
test('U36 Doppelte Auftragsnummern im Export werden nur einmal übernommen und gemeldet', () => {
  const s = Core.empty();
  const plan = Core.planImport(s, [{ nr: 'X1', kunde: 'K', kom: 'A' }, { nr: 'X1', kunde: 'K', kom: 'B' }]);
  assert.equal(plan.creates.length, 1); assert.deepEqual(plan.dupes, ['X1']);
});
test('U37 planImport verändert den Stand nicht', () => {
  const s = Core.empty(); importFile(s, 'weclapp-1.csv'); const before = JSON.stringify(s);
  Core.planImport(s, readCsv('weclapp-2.csv').rows);
  assert.equal(JSON.stringify(s), before);
});
test('U38 Zeilen ohne Auftragsnummer werden über Kunde + Kommission wiedererkannt', () => {
  const s = Core.empty();
  Core.applyImport(s, Core.planImport(s, [{ nr: '', kunde: 'Kunde A', kom: 'Projekt X', plan: 10 }]), { today: TODAY });
  const p = Core.planImport(s, [{ nr: '', kunde: 'Kunde A', kom: 'Projekt X', plan: 12 }]);
  assert.equal(p.creates.length, 0); assert.equal(p.updates.length, 1);
});

// ---------- Hinweise ----------
test('U40 Hinweise: Budget, Projektende, überfällige Aufgaben, Aktuelles', () => {
  const s = Core.empty(); importFile(s, 'weclapp-1.csv');
  const f = nr => Core.flags(s.projects.find(x => x.nr === nr), s.settings, TODAY).map(x => x.t).join(' | ');
  assert.match(f('1001'), /Kein nächster Schritt/); assert.doesNotMatch(f('1001'), /Budget/);
  assert.match(f('1003'), /Projektende laut weclapp überschritten/);
  assert.match(f('1003'), /„Aktuelles“ in weclapp ist leer/);
  assert.match(f('1002'), /Tage alt/);
  const p = s.projects.find(x => x.nr === '1004'); p.tasks.push({ id: 'a', t: 'x', due: '2026-10-01', done: false });
  assert.equal(Core.severity(Core.flags(p, s.settings, TODAY)), 'r');
});
test('U41 Hinweise: abrechenbar über Budget ist rot', () => {
  const p = Core.newProject({ next: 'x', wc: { plan: 100, istab: 120, ist: 130, akt: '28.10.2026: ok' } }, TODAY);
  assert.equal(Core.severity(Core.flags(p, null, TODAY)), 'r');
});
test('U42 parseAkt: verschiedene Datumsschreibweisen, neuester Eintrag', () => {
  const A = Core.parseAkt('#20.10.2026: Abnahme\n#05.10.2026: Schnittstelle\n1. Sep 2026: Start\n#Allgemeine Notiz', TODAY);
  assert.equal(A.latest.d, '2026-10-20'); assert.equal(A.ent.length, 3); assert.equal(A.notes.length, 1);
  assert.equal(Core.parseAkt('', TODAY).latest, null);
  assert.doesNotThrow(() => Core.parseAkt('31.02.2026: ungültig', TODAY));
});

// ---------- Schätzung ----------
test('U50 PERT: Erwartungswert, Zuschläge in % und fest, Streuung', () => {
  const es = Core.newEstimate({ tasks: [{ o: 2, m: 4, p: 8 }, { o: 1, m: 1, p: 3 }], extras: [{ n: 'PM', type: 'pct', v: 10, on: true }, { n: 'Fix', type: 'fix', v: 2, on: true }, { n: 'Aus', type: 'pct', v: 50, on: false }] });
  const r = Core.calcEstimate(es);
  assert.equal(Math.round(r.base * 1000) / 1000, Math.round((26 / 6 + 8 / 6) * 1000) / 1000);
  assert.equal(Math.round(r.total * 1000), Math.round((r.base * 1.1 + 2) * 1000));
  assert.ok(r.p85 > r.total); assert.equal(r.bad.length, 0);
});
test('U51 PERT: unplausible Werte (O > M) werden gemeldet, leere Werte zählen 0', () => {
  const r = Core.calcEstimate(Core.newEstimate({ tasks: [{ o: 5, m: 3, p: 8 }, { o: '', m: '', p: '' }], extras: [] }));
  assert.equal(r.bad.length, 1); assert.ok(isFinite(r.total));
});
test('U52 Umrechnung Stunden/Tage/Wochen, Story Points bleiben', () => {
  assert.equal(Core.conv(2, 'Tage', 'Stunden'), 16); assert.equal(Core.conv(40, 'Stunden', 'Wochen'), 1); assert.equal(Core.conv(5, 'Story Points', 'Tage'), 5);
});
test('U53 Schätzung duplizieren: neue IDs, Story-Verknüpfungen bleiben stimmig', () => {
  const es = Core.newEstimate({ stories: [{ id: 's', want: 'x' }], tasks: [{ id: 't', n: 'a', sid: 's' }] });
  const c = Core.cloneEstimate(es);
  assert.notEqual(c.id, es.id); assert.notEqual(c.stories[0].id, 's'); assert.equal(c.tasks[0].sid, c.stories[0].id);
});
test('U54 Ähnliche frühere Aufgabe wird gefunden', () => {
  const s = Core.empty(); s.estimates.push(Core.newEstimate({ title: 'Alt', tasks: [{ n: 'Schnittstelle ERP anbinden', o: 2, m: 4, p: 8 }] }));
  const m = Core.bestMatch(s, 'Schnittstelle ERP', 'anders');
  assert.equal(m.t.n, 'Schnittstelle ERP anbinden'); assert.equal(Core.bestMatch(s, 'xy', 'anders'), null);
});

// ---------- Übernahme aus den bisherigen Apps ----------
test('U60 Übernahme aus Projekt-Radar und PM-Rechner, mehrfach ausgeführt ohne Doppelte', () => {
  const radar = { projects: [{ id: 'r1', name: 'Radar-Projekt', status: 'y', prio: 1, next: 'Mail schreiben', area: 'Arbeit', tasks: [{ t: 'A', done: false }], log: [{ d: '2026-10-01', t: 'x' }] }], ideas: [{ t: 'Idee' }] };
  const pm = { est: { projects: [{ id: 'pp', name: 'Radar-Projekt' }], estimates: [{ id: 'e1', pid: 'pp', title: 'Schätzung', unit: 'Tage', tasks: [{ n: 'T', o: 1, m: 2, p: 3 }], stories: [], extras: [] }], lib: { tasks: [{ n: 'Lib-Aufgabe', o: 1, m: 1, p: 1, unit: 'Tage' }], stories: [] } }, cap: { days: 9 } };
  let { state, rep } = Core.migrateFromApps(Core.empty(), radar, pm, TODAY);
  assert.equal(rep.projects, 1); assert.equal(rep.estimates, 1); assert.equal(state.estimates[0].pid, state.projects[0].id); assert.equal(state.tools.cap.days, 9);
  ({ state, rep } = Core.migrateFromApps(state, radar, pm, TODAY));
  assert.equal(rep.projects, 0); assert.equal(rep.estimates, 0); assert.equal(state.projects.length, 1); assert.equal(state.estimates.length, 1);
});

// ---------- Interne Versionen ----------
test('U70 Interne Versionen: höchstens alle 30 Minuten automatisch, Begrenzung der Anzahl', () => {
  const now = Date.now();
  assert.equal(Core.shouldAutoSnapshot([], now), true);
  assert.equal(Core.shouldAutoSnapshot([{ kind: 'auto', at: now - 10 * 60000 }], now), false);
  assert.equal(Core.shouldAutoSnapshot([{ kind: 'auto', at: now - 31 * 60000 }], now), true);
  const L = Array.from({ length: 50 }, (_, i) => ({ kind: i % 2 ? 'auto' : 'vor Import', at: now - i * 1000 }));
  const P = Core.pruneSnapshots(L, 10);
  assert.ok(P.length <= 20); assert.equal(P[0].at, now);
});

// ---------- Erweiterung 2: Ampel, Budget, Kürzel, weclapp-Link, Aktuelles, Kundenexport, Bibliothek ----------
test('U43 Ampel ignoriert weclapp-Laufzeit, „Aktuelles“ und fehlenden nächsten Schritt (nur Hinweise)', () => {
  const p = Core.newProject({ wc: { plan: 100, istab: 10, ist: 10, ende: '2026-01-01', start: '2025-01-01', akt: '' } }, '2026-01-01');
  const F = Core.flags(p, null, TODAY);
  assert.equal(Core.severity(F), 'g');
  assert.ok(F.some(f => f.s === 'n' && /Projektende/.test(f.t)));
  assert.ok(F.some(f => f.s === 'n' && /Aktuelles/.test(f.t)));
});
test('U44 Ampel: Budget sowie eigene Aufgaben und Termine färben', () => {
  const base = o => Core.newProject(Object.assign({ next: 'x' }, o), TODAY);
  assert.equal(Core.severity(Core.flags(base({ wc: { plan: 100, istab: 90 } }), null, TODAY)), 'y');
  assert.equal(Core.severity(Core.flags(base({ wc: { plan: 100, istab: 101 } }), null, TODAY)), 'r');
  assert.equal(Core.severity(Core.flags(base({ tasks: [{ id: 'a', t: 'x', due: '2026-10-30', done: false }] }), null, TODAY)), 'y');
  assert.equal(Core.severity(Core.flags(base({ tasks: [{ id: 'a', t: 'x', due: '2026-10-28', done: false }] }), null, TODAY)), 'r');
  assert.equal(Core.severity(Core.flags(base({ tasks: [{ id: 'a', t: 'x', due: '2026-10-28', done: true }] }), null, TODAY)), 'g');
  assert.equal(Core.severity(Core.flags(base({ due: '2026-10-20' }), null, TODAY)), 'r');
  assert.equal(Core.severity(Core.flags(base({ due: '2026-11-15' }), null, TODAY)), 'g');
  assert.equal(Core.severity(Core.flags(base({ status: 'y' }), null, TODAY)), 'y');
});
test('U45 Restbudget absolut und relativ, Summen über alle Projekte', () => {
  const a = Core.newProject({ wc: { plan: 200, istab: 150, ist: 188 } }), b = Core.newProject({ wc: { plan: 100, istab: 120, ist: 130 } }), c = Core.newProject({});
  const ba = Core.budget(a);
  assert.equal(ba.rest, 50); assert.equal(Math.round(ba.restPct), 25); assert.equal(Core.budget(c), null);
  const T = Core.budgetTotals([a, b, c]);
  assert.equal(T.count, 2); assert.equal(T.plan, 300); assert.equal(T.used, 270); assert.equal(T.rest, 30); assert.equal(T.over, 1);
});
test('U46 Kürzel: erster Buchstabe Vorname + zwei Buchstaben Nachname', () => {
  assert.equal(Core.initials('Michael Albrecht'), 'MAL'); assert.equal(Core.initials('Benutzer Max Muster'), 'MMU');
  assert.equal(Core.initials('Anna Maria Beispiel'), 'ABE'); assert.equal(Core.initials('Muster, Max'), 'MMU');
  assert.equal(Core.initials('Cem'), 'CEM'); assert.equal(Core.initials(''), ''); assert.equal(Core.initials('Jörg Übel'), 'JÜB');
});
test('U47 weclapp-Link zur Suche nach der Auftragsnummer', () => {
  assert.equal(Core.weclappLink('https://tcgprocess.weclapp.com/', 'AUF201581'), 'https://tcgprocess.weclapp.com/app/search?s=AUF201581');
  assert.equal(Core.weclappLink('', 'A B'), 'https://tcgprocess.weclapp.com/app/search?s=A%20B');
  assert.equal(Core.weclappLink('https://x.weclapp.com', ''), '');
});
test('U48 „Aktuelles“: Präfix wird ergänzt, Schreibweise der vorhandenen Einträge übernommen, neuer Eintrag oben', () => {
  assert.equal(Core.aktCompose('', 'Kickoff', TODAY), '29.10.2026: Kickoff');
  assert.equal(Core.aktCompose('#20.10.2026: Alt', 'Neu', TODAY), '#29.10.2026: Neu\n#20.10.2026: Alt');
  assert.equal(Core.aktCompose('20.10.2026: Alt', 'Neu\nzweite Zeile', TODAY), '29.10.2026: Neu zweite Zeile\n20.10.2026: Alt');
  assert.equal(Core.aktCompose('Alt', '   ', TODAY), 'Alt');
  const back = Core.parseAkt(Core.aktCompose('#20.10.2026: Alt', 'Neu', TODAY), TODAY);
  assert.equal(back.latest.d, TODAY); assert.equal(back.latest.t, 'Neu');
});
test('U55 Kundenvariante: Aufgaben + Zuschläge + Puffer ergeben genau den 85-%-Wert', () => {
  const es = Core.newEstimate({ tasks: [{ n: 'A', o: 2, m: 4, p: 8 }, { n: 'B', o: 1, m: 2, p: 6 }], extras: [{ n: 'PM', type: 'pct', v: 10, on: true }, { n: 'Fix', type: 'fix', v: 1, on: true }] });
  const k = Core.customerView(es), r = Core.calcEstimate(es);
  const sum = k.tasks.reduce((a, t) => a + t.e, 0) + k.extras.reduce((a, x) => a + x.amt, 0) + k.buffer;
  assert.equal(Math.round(sum * 1e6), Math.round(k.total * 1e6)); assert.equal(Math.round(k.total * 1e6), Math.round(r.p85 * 1e6));
  assert.ok(!('o' in k.tasks[0]) && !('p' in k.tasks[0]));
});
test('U56 Bibliothek: Aufgaben werden automatisch gemerkt, bewusst gespeicherte nicht überschrieben', () => {
  const s = Core.empty();
  assert.equal(Core.libUpsertTask(s, { n: 'Ohne Werte' }, 'Tage', true), null);
  Core.libUpsertTask(s, { n: 'Workshop', o: 1, m: 2, p: 3 }, 'Tage', true);
  Core.libUpsertTask(s, { n: 'workshop', o: 2, m: 3, p: 5 }, 'Tage', true);
  assert.equal(s.lib.tasks.length, 1); assert.equal(s.lib.tasks[0].m, 3);
  Core.libUpsertTask(s, { n: 'Workshop', o: 1, m: 1, p: 1 }, 'Tage', false);
  Core.libUpsertTask(s, { n: 'Workshop', o: 9, m: 9, p: 9 }, 'Tage', true);
  assert.equal(s.lib.tasks[0].m, 1); assert.equal(s.lib.tasks[0].auto, false);
  Core.libUpsertStory(s, { role: 'Einkauf', want: 'Bestellungen exportieren', ac: ['x', ''] });
  Core.libUpsertStory(s, { role: 'Vertrieb', want: 'bestellungen exportieren' });
  assert.equal(s.lib.stories.length, 1); assert.equal(s.lib.stories[0].role, 'Vertrieb');
  const n = Core.normalize(JSON.parse(JSON.stringify(s))); assert.equal(n.lib.tasks[0].auto, false);
});
test('U57 Neues Feld aktNew übersteht Backup und Reparatur', () => {
  const s = Core.normalize({ projects: [{ id: 'p', name: 'P', aktNew: 'Entwurf' }] });
  assert.equal(s.projects[0].aktNew, 'Entwurf');
  assert.equal(Core.normalize({ projects: [{ id: 'p', name: 'P', aktNew: 7 }] }).projects[0].aktNew, '');
  assert.equal(Core.normalize({ settings: {} }).settings.weclappUrl, 'https://tcgprocess.weclapp.com');
});

// ---------- Erweiterung 3: Änderungshistorie, Import-Korrektheit ----------
const base = { nr: 'A1', kunde: 'Kunde #1', kom: 'Projekt X', phase: 'Umsetzung', status: 'Auftrag bestätigt', plan: 100, ist: 10, istab: 10, akt: '#20.10.2026: alt', pl: 'Max Muster', cons: 'Anna Beispiel' };
const imp = (s, rows, info = {}) => { const pl = Core.planImport(s, rows); return { pl, r: Core.applyImport(s, pl, Object.assign({ today: TODAY }, info)) }; };
test('U80 Automatischer Name folgt der Kommission aus weclapp, ein selbst vergebener Name bleibt', () => {
  const s = Core.empty(); imp(s, [base, Object.assign({}, base, { nr: 'B2', kom: 'Projekt Y' })]);
  const [a, b] = s.projects; b.name = 'Mein Name';
  imp(s, [Object.assign({}, base, { kom: 'Projekt X neu' }), Object.assign({}, base, { nr: 'B2', kom: 'Projekt Y neu' })]);
  assert.equal(a.name, 'Kunde – Projekt X neu'); assert.equal(b.name, 'Mein Name');
  assert.ok(a.hist.some(e => e.k === 'name' && e.to === 'Kunde – Projekt X neu'));
});
test('U81 In weclapp abgeschlossene Projekte: erkannt, als Hinweis gezeigt, nur auf Wunsch auf Fertig gesetzt', () => {
  const s = Core.empty(); imp(s, [base]); const p = s.projects[0];
  const done = Object.assign({}, base, { phase: 'Abgeschlossen' });
  let x = imp(s, [done]); assert.deepEqual(x.pl.done, [p.id]); assert.equal(p.status, 'g');
  assert.ok(Core.flags(p, s.settings, TODAY).some(f => /In weclapp abgeschlossen/.test(f.t)));
  x = imp(s, [done], { closeDone: true }); assert.equal(p.status, 'd'); assert.equal(x.r.closed, 1);
  assert.ok(p.hist.some(e => e.k === 'status' && e.to === 'd'));
});
test('U82 „Aktuelles“: Historie zeigt nur die neuen Einträge', () => {
  const s = Core.empty(); imp(s, [base]);
  imp(s, [Object.assign({}, base, { akt: '#28.10.2026: Abnahme ok\n#20.10.2026: alt' })]);
  const e = s.projects[0].hist.find(x => x.k === 'akt');
  assert.equal(e.to, '28.10.2026: Abnahme ok'); assert.equal(Core.histText(e), 'Aktuelles neu: 28.10.2026: Abnahme ok');
});
test('U83 Leerer Wert, Zahl als Text, Auftragsnummer mit Leerzeichen/anderer Schreibweise', () => {
  const s = Core.empty(); imp(s, [base]);
  let x = imp(s, [Object.assign({}, base, { nr: ' a1 ', plan: '100' })]); assert.equal(x.pl.creates.length, 0); assert.equal(x.r.updated, 0);
  x = imp(s, [Object.assign({}, base, { plan: null })]); assert.equal(s.projects[0].wc.plan, null);
  assert.match(Core.histText(s.projects[0].hist.at(-1)), /Budget \(h\): 100 → –/);
});
test('U84 Import-Liste und Markierung „geändert im letzten Import“', () => {
  const s = Core.empty(); const r1 = imp(s, [base, Object.assign({}, base, { nr: 'B2' })]).r;
  const r2 = imp(s, [Object.assign({}, base, { plan: 120 }), Object.assign({}, base, { nr: 'B2' })]).r;
  assert.equal(s.meta.imports.length, 2); assert.notEqual(r1.id, r2.id);
  assert.equal(s.projects[0].wc.imp, r2.id); assert.equal(s.projects[1].wc.imp, r1.id); assert.equal(s.projects[0].wc.newImp, r1.id);
  const n = Core.normalize(JSON.parse(JSON.stringify(s)));
  assert.equal(n.meta.imports.length, 2); assert.equal(n.projects[0].hist.length, s.projects[0].hist.length); assert.equal(n.projects[0].wc.imp, r2.id);
});
test('U85 Eigene Änderungen: zusammengefasst innerhalb von 10 Minuten, Rücknahme hinterlässt nichts', () => {
  const p = Core.newProject({}, TODAY), t0 = Date.parse('2026-10-29T10:00:00Z'), at = m => new Date(t0 + m * 60000).toISOString();
  Core.recordChange(p, 'next', '', 'A', at(0)); Core.recordChange(p, 'next', 'A', 'AB', at(1)); Core.recordChange(p, 'next', 'AB', 'ABC', at(2));
  assert.equal(p.hist.length, 1); assert.equal(p.hist[0].from, ''); assert.equal(p.hist[0].to, 'ABC');
  Core.recordChange(p, 'next', 'ABC', 'X', at(30)); assert.equal(p.hist.length, 2);
  Core.recordChange(p, 'status', 'g', 'y', at(31)); Core.recordChange(p, 'status', 'y', 'g', at(32));
  assert.equal(p.hist.length, 2);
  assert.equal(Core.histText({ k: 'status', from: 'g', to: 'r', src: 'ich' }), 'Status: Läuft → Blockiert');
});

// ---------- Nächster Schritt ↔ Aktuelles, Aufgaben Projekt ↔ Schätzung ----------
test('U86 Nächster Schritt füllt den Aktuelles-Entwurf, bis dieser selbst umformuliert wird', () => {
  const p = Core.newProject({ wc: { akt: '' } }, TODAY);
  Core.setNext(p, 'A'); Core.setNext(p, 'Ab'); Core.setNext(p, 'Abnahme planen ');
  assert.equal(p.aktNew, 'Abnahme planen'); assert.equal(p.next, 'Abnahme planen ');
  Core.setNext(p, ''); assert.equal(p.aktNew, ''); Core.setNext(p, 'Go-Live'); assert.equal(p.aktNew, 'Go-Live');
  p.aktNew = 'Kunde hat Termin bestätigt'; assert.equal(Core.aktLinked(p), false);
  Core.setNext(p, 'Schulung'); assert.equal(p.aktNew, 'Kunde hat Termin bestätigt', 'eigener Entwurf bleibt');
  p.aktNew = ''; Core.setNext(p, 'Schulung vorbereiten'); assert.equal(p.aktNew, 'Schulung vorbereiten', 'nach „Eingetragen“ wieder verknüpft');
  const own = Core.newProject({}, TODAY); Core.setNext(own, 'X'); assert.equal(own.aktNew, '', 'eigene Projekte ohne weclapp: kein Entwurf');
  const w = Core.newProject({ wc: { akt: '28.10.2026: Workshop gehalten\n15.10.2026: Kickoff' } }, TODAY);
  assert.equal(Core.aktLatest(w, TODAY), 'Workshop gehalten');
});
test('U87 Aufgaben aus der Schätzung ins Projekt und zurück, ohne Doppelte, Fortschritt', () => {
  const s = Core.empty(), p = Core.newProject({ name: 'P' }, TODAY); s.projects.push(p);
  p.tasks.push({ id: 'pt1', t: 'Datenmigration', due: '', done: false, who: '' });
  s.lib.tasks.push({ id: 'l1', n: 'Datenmigration', d: 'Altdaten', o: 8, m: 16, p: 32, unit: 'Stunden', used: 0, auto: false });
  const es = Core.newEstimate({ pid: p.id, unit: 'Tage' }, TODAY); s.estimates.push(es);
  es.tasks.push({ id: 'et1', n: 'Schnittstelle', d: '', sid: '', o: 1, m: 2, p: 3 }, { id: 'et2', n: '', d: '', sid: '', o: '', m: '', p: '' });
  assert.equal(Core.tasksToProject(s, es, ['et1', 'et2']), 1, 'leere Aufgabe wird nicht übernommen');
  assert.equal(Core.tasksToProject(s, es, ['et1']), 0, 'keine Doppelten');
  const lt = Core.linkedTask(s, es, 'et1'); assert.equal(lt.t, 'Schnittstelle'); assert.equal(lt.eid, es.id);
  assert.equal(Core.tasksToEstimate(s, es, ['pt1', lt.id]), 1, 'schon verknüpfte Projektaufgabe wird übersprungen');
  const nt = es.tasks[es.tasks.length - 1]; assert.equal(nt.n, 'Datenmigration'); assert.deepEqual([nt.o, nt.m, nt.p], [1, 2, 4], 'Werte aus der Bibliothek, umgerechnet');
  assert.equal(Core.linkedTask(s, es, nt.id).id, 'pt1');
  lt.done = true; const pr = Core.estProgress(s, es);
  assert.equal(pr.linked, 2); assert.equal(pr.done, 1); assert.equal(pr.doneEff, 2);
  const none = Core.newEstimate({}, TODAY); assert.equal(Core.tasksToProject(s, none, ['x']), 0, 'ohne Projekt nichts');
});
test('U88 Verknüpfungen überstehen Backup und Reparatur; tote Verweise werden geleert', () => {
  const s = Core.empty(), p = Core.newProject({ name: 'P' }, TODAY), q = Core.newProject({ name: 'Q' }, TODAY); s.projects.push(p, q);
  const es = Core.newEstimate({ pid: p.id }, TODAY); es.tasks.push({ id: 'et1', n: 'A', d: '', sid: '', o: 1, m: 1, p: 1 }); s.estimates.push(es);
  p.tasks.push({ id: 'a', t: 'A', due: '', done: false, who: '', eid: es.id, etid: 'et1' }, { id: 'b', t: 'B', due: '', done: false, who: '', eid: es.id, etid: 'weg' }, { id: 'c', t: 'A2', due: '', done: false, who: '', eid: es.id, etid: 'et1' });
  q.tasks.push({ id: 'd', t: 'D', due: '', done: false, who: '', eid: es.id, etid: 'et1' });
  const r = Core.normalize(JSON.parse(JSON.stringify(Core.makeBackup(s).data || s)));
  const pp = r.projects.find(x => x.name === 'P'), qq = r.projects.find(x => x.name === 'Q');
  assert.equal(pp.tasks[0].etid, 'et1'); assert.equal(pp.tasks[1].etid, '', 'gelöschte Aufgabe'); assert.equal(pp.tasks[2].etid, '', 'doppelte Verknüpfung');
  assert.equal(qq.tasks[0].eid, '', 'Schätzung gehört zu anderem Projekt');
  assert.deepEqual(Core.normalize(r), r, 'idempotent');
  const old = Core.normalize({ projects: [{ id: 'x', name: 'Alt', tasks: [{ id: 't', t: 'alt' }] }] });
  assert.equal(old.projects[0].tasks[0].eid, '');
});

// ---------- PM-Suite: Phasen, Backlog, Kunden, Bericht, Kundenliste ----------
test('U90 Phasen: Standardphasen, Fortschritt je Phase, Aufgaben ohne Phase, aktuelle Phase, Verzug', () => {
  const p = Core.addPhases(Core.newProject({ name: 'P' }, TODAY), Core.STD_PHASES.slice(0, 3));
  assert.equal(p.phases.length, 3); assert.equal(Core.phaseName(p), 'Vorbereitung');
  const [a, b] = p.phases; a.done = true; b.end = '2026-10-01';
  p.tasks.push({ id: 't1', t: 'X', due: '', done: true, who: '', ph: b.id }, { id: 't2', t: 'Y', due: '', done: false, who: '', ph: b.id }, { id: 't3', t: 'Z', due: '', done: false, who: '', ph: '' });
  const st = Core.phaseStats(p, TODAY);
  assert.equal(st.length, 4, 'drei Phasen + ohne Phase');
  assert.equal(st[1].pct, 50); assert.equal(st[1].late, true); assert.equal(st[1].current, true);
  assert.equal(st[3].ph, null); assert.equal(st[3].open, 1);
  assert.equal(Core.phaseName(p), 'Konzeption');
  p.phases.forEach(x => x.done = true); assert.equal(Core.phaseName(p), 'Abgeschlossen');
  const w = Core.newProject({ wc: { phase: 'Rollout' } }); assert.equal(Core.phaseName(w), 'Rollout', 'ohne eigene Phasen: weclapp-Phase');
});
test('U91 Phasen und Aufgaben-Zuordnung überstehen Reparatur; alte Stände ohne Phasen', () => {
  const s = Core.normalize({ projects: [{ id: 'p', name: 'P', phases: [{ id: 'ph1', n: 'Test', start: '2026-11-01', end: 'kaputt' }, 'x'], tasks: [{ id: 't', t: 'A', ph: 'ph1' }, { id: 'u', t: 'B', ph: 'weg' }] }] });
  const p = s.projects[0]; assert.equal(p.phases.length, 1); assert.equal(p.phases[0].end, ''); assert.equal(p.tasks[0].ph, 'ph1'); assert.equal(p.tasks[1].ph, '');
  assert.deepEqual(Core.normalize(JSON.parse(JSON.stringify(s))), s);
  assert.deepEqual(Core.normalize({ projects: [{ id: 'q', name: 'Q' }] }).projects[0].phases, []);
});
test('U92 Backlog: Wert/Aufwand-Priorisierung, Verschieben, Auslastung je Person, Teilen als Text', () => {
  const s = Core.empty(), p = Core.newProject({ name: 'Portal', kunde: 'Nordlicht' }, TODAY); s.projects.push(p);
  const a = Core.newBacklogItem({ t: 'Export', val: 5, eff: 1, who: 'Anna', est: 2 }), b = Core.newBacklogItem({ t: 'Redesign', val: 4, eff: 4, who: 'Anna', est: 5, scope: 'proj', ref: p.id }), c = Core.newBacklogItem({ t: 'Kleinkram', val: 1, eff: 2, scope: 'kunde', ref: 'Südwind' });
  s.backlog.push(c, b, a);
  assert.deepEqual(Core.blSort(s.backlog).map(x => x.t), ['Export', 'Redesign', 'Kleinkram']);
  assert.equal(Core.blScore(a), 5); assert.equal(Core.blScopeLabel(s, b), 'Portal'); assert.equal(Core.blKunde(s, b), 'Nordlicht'); assert.equal(Core.blKunde(s, c), 'Südwind');
  Core.moveItem(a, 'now', TODAY); Core.moveItem(b, 'now', TODAY); Core.moveItem(c, 'quatsch');
  assert.equal(c.slot, '');
  assert.deepEqual(Core.teamLoad(s), [{ who: 'Anna', n: 2, est: 7, open: 0 }]);
  Core.moveItem(a, 'done', TODAY); assert.equal(a.doneAt, TODAY); Core.moveItem(a, 'next', TODAY); assert.equal(a.doneAt, '');
  b.tasks.push({ id: 'x', t: 'Entwurf', done: true }, { id: 'y', t: 'Review', done: false });
  const txt = Core.shareText(s, [b], 'Jetzt');
  assert.match(txt, /• Redesign \(Anna\) – ca\. 5 PT \[Portal\]/); assert.match(txt, /☑ Entwurf/); assert.match(txt, /☐ Review/);
});
test('U93 Backlog, Team und Kunden-Notizen überstehen Backup und Reparatur; Verweise auf gelöschte Aufträge werden geleert', () => {
  const s = Core.normalize({ projects: [{ id: 'p', name: 'P' }], team: [{ n: 'Anna' }, { n: 'anna' }, { n: '' }], customers: [{ n: 'Nordlicht', mood: 'r', notes: 'n' }, { n: 'nordlicht' }, { n: 'X', mood: 'blau' }],
    backlog: [{ t: 'A', scope: 'proj', ref: 'p', slot: 'now', val: 9, eff: 0, est: '3' }, { t: 'B', scope: 'proj', ref: 'weg' }, { t: '' }, { t: 'C', scope: 'egal', slot: 'egal', tasks: [{ t: 'x' }, { t: '' }] }] });
  assert.equal(s.team.length, 1); assert.equal(s.customers.length, 2); assert.equal(s.customers[1].mood, '');
  assert.equal(s.backlog.length, 3); assert.equal(s.backlog[0].val, 5); assert.equal(s.backlog[0].eff, 1); assert.equal(s.backlog[0].est, 3);
  assert.equal(s.backlog[1].ref, ''); assert.equal(s.backlog[2].scope, 'prod'); assert.equal(s.backlog[2].slot, ''); assert.equal(s.backlog[2].tasks.length, 1);
  const r = Core.normalize(JSON.parse(JSON.stringify(Core.makeBackup(s).data))); assert.deepEqual(r, s, 'Rundreise und idempotent');
  const old = Core.normalize({ projects: [] }); assert.deepEqual([old.backlog, old.team, old.customers], [[], [], []]);
});
test('U94 Kunden: Projekte, Ampel, Budget, Chancen (gewichtet), Backlog und Stimmung je Kunde', () => {
  const s = Core.empty();
  const a = Core.newProject({ name: 'A', kunde: 'Nordlicht', status: 'r', wc: { plan: 100, istab: 40 } }, TODAY), b = Core.newProject({ name: 'B', kunde: 'nordlicht', next: 'x' }, TODAY), c = Core.newProject({ name: 'C', kunde: 'Südwind', next: 'x' }, TODAY);
  s.projects.push(a, b, c);
  const ch = Core.newEstimate({ kunde: 'Nordlicht', unit: 'Tage', prob: 50, tasks: [{ id: 't', n: 'X', d: '', sid: '', o: 10, m: 10, p: 10 }], extras: [] }, TODAY);
  const lost = Core.newEstimate({ kunde: 'Nordlicht', status: 'rejected' }, TODAY);
  s.estimates.push(ch, lost); s.backlog.push(Core.newBacklogItem({ t: 'Wunsch', scope: 'kunde', ref: 'Südwind' }));
  Core.customerRec(s, 'Südwind').mood = 'y';
  const L = Core.customers(s, TODAY), n = L.find(x => x.key === 'nordlicht'), sw = L.find(x => x.key === 'südwind');
  assert.equal(L[0].key, 'nordlicht', 'rot zuerst'); assert.equal(n.projects.length, 2); assert.equal(n.health, 'r'); assert.equal(n.sev.r, 1);
  assert.equal(n.budget.rest, 60); assert.equal(n.chances.length, 1); assert.equal(n.chanceHours, 80); assert.equal(n.weightedHours, 40);
  assert.equal(sw.health, 'y', 'Stimmung färbt'); assert.equal(sw.backlogOpen, 1);
  assert.equal(Core.customerRec(s, 'SÜDWIND'), s.customers[0], 'gleicher Kunde unabhängig von Schreibweise');
  const p = Core.estimateToProject(s, ch, TODAY);
  assert.equal(ch.pid, p.id); assert.equal(ch.status, 'ordered'); assert.equal(p.kunde, 'Nordlicht');
  assert.equal(Core.customers(s, TODAY).find(x => x.key === 'nordlicht').chances.length, 0, 'gewonnene Chance ist Auftrag');
});
test('U95 Wochenbericht: Zeitraum, Bereich (alle, meine, Kunde), Änderungen, überfällig, Text und HTML', () => {
  const s = Core.empty(); s.me = 'Max Muster';
  const a = Core.newProject({ name: 'Alpha', kunde: 'Nordlicht', next: 'Abnahme', wc: { pl: 'Max Muster', plan: 100, istab: 50 } }, '2026-10-01');
  a.hist.push({ at: '2026-10-27T10:00:00Z', src: 'weclapp', k: 'phase', from: 'Test', to: 'Rollout', imp: 'i' }, { at: '2026-09-01T10:00:00Z', src: 'ich', k: 'next', from: '', to: 'alt', imp: '' });
  a.tasks.push({ id: 't', t: 'Protokoll', due: '2026-10-20', done: false, who: '' });
  const b = Core.newProject({ name: 'Beta <b>', kunde: 'Südwind', next: 'x', wc: { pl: 'Eva' } }, '2026-10-28');
  s.projects.push(a, b); s.estimates.push(Core.newEstimate({ title: 'Chance Z', kunde: 'Südwind' }));
  const R = Core.weekReport(s, { days: 7 }, TODAY);
  assert.equal(R.from, '2026-10-22'); assert.equal(R.kpi.active, 2); assert.equal(R.kpi.neu, 1);
  assert.equal(R.rows[0].p.name, 'Alpha', 'rot (überfällig) zuerst'); assert.equal(R.rows[0].overdue.length, 1);
  assert.deepEqual(R.rows[0].changes, ['Phase: Test → Rollout'], 'nur Änderungen im Zeitraum');
  assert.equal(Core.weekReport(s, { scope: 'me' }, TODAY).rows.length, 1);
  const K = Core.weekReport(s, { scope: 'kunde:südwind' }, TODAY); assert.equal(K.rows.length, 1); assert.equal(K.chances.length, 1);
  assert.equal(Core.weekReport(s, { scope: 'kunde:nordlicht' }, TODAY).chances.length, 0);
  const txt = Core.reportText(R, 'Montag'); assert.match(txt, /Aktiv: 2/); assert.match(txt, /➜ Abnahme/); assert.match(txt, /⏰ überfällig: Protokoll/);
  const html = Core.reportHTML(R); assert.ok(html.includes('Beta &lt;b&gt;')); assert.ok(!html.includes('<b>Beta <b>'));
  assert.equal(Core.reportDue(s, '2026-10-26'), true); s.meta.lastReport = '2026-10-26';
  assert.equal(Core.reportDue(s, '2026-10-30'), false); assert.equal(Core.reportDue(s, '2026-11-02'), true);
  assert.equal(Core.isMonday('2026-10-26'), true);
});
test('U96 Kundenliste: nur gewählte Spalten, keine internen Angaben (Ampel, Notizen, Risiken, Aktuelles, eigener Termin)', () => {
  const p = Core.newProject({ nr: 'A-1', name: 'Portal', kunde: 'Nordlicht', status: 'r', due: '2026-11-11', notes: 'GEHEIM Notiz', next: 'Abnahme vorbereiten',
    risks: [{ id: 'r', n: 'GEHEIM Risiko', w: 5, a: 5, m: '' }], wc: { nr: 'A-1', phase: 'Test', start: '2026-03-01', ende: '2026-11-30', golive: 'KW 46', pl: 'Benutzer Max Muster', akt: 'GEHEIM aktuell', plan: 100, istab: 40 } }, TODAY);
  const L = Core.customerList([p], Core.CL_DEFAULT);
  assert.deepEqual(L.head, ['Auftrag', 'Projekt', 'Phase', 'Status', 'Start', 'Ende', 'GoLive']);
  assert.deepEqual(L.rows[0], ['A-1', 'Portal', 'Test', 'In Arbeit', '01.03.2026', '30.11.2026', 'KW 46'], 'Blockiert wird für den Kunden zu „In Arbeit“');
  const all = JSON.stringify(Core.customerList([p], Object.keys(Core.CL_COLS)));
  assert.ok(!/GEHEIM|11\.11\.2026|Blockiert|🔴/.test(all), 'nie interne Angaben');
  assert.ok(all.includes('Max Muster') && !all.includes('Benutzer'));
  assert.equal(Core.customerList([p], ['rest']).rows[0][0], 60);
  const html = Core.listHTML(L, 'Projekte'), txt = Core.listText(L);
  assert.ok(html.includes('<th') && html.includes('Portal')); assert.equal(txt.split('\n').length, 2);
});
test('U97 Chance: Schätzung mit Kunde ohne Auftrag, Wahrscheinlichkeit wird repariert', () => {
  const s = Core.normalize({ estimates: [{ id: 'e', title: 'CR', kunde: 'Nordlicht', prob: '70' }, { id: 'f', title: 'X', prob: 300 }, { id: 'g', title: 'Y', prob: 'viel' }] });
  assert.equal(s.estimates[0].kunde, 'Nordlicht'); assert.equal(s.estimates[0].prob, 70); assert.equal(s.estimates[1].prob, 100); assert.equal(s.estimates[2].prob, '');
  assert.equal(Core.isChance(s.estimates[0]), true);
});
