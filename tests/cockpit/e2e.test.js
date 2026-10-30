// Browser-Tests (E2E) für das Projekt-Cockpit. Start: node --test tests/cockpit/
// Benötigt Playwright mit Chromium. Jede Testbezeichnung beginnt mit der Nummer aus TESTFAELLE.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, 'fixtures');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv' };
let server, base, browser;

test.before(async () => {
  if (!chromium) return;
  server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/cockpit/index.html';
  browser = await chromium.launch();
});
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });

// Neue, leere Browser-Umgebung je Test; sammelt Fehler und Netzwerkzugriffe nach außen
async function open(opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 860 }, acceptDownloads: true }, opts.ctx || {}));
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage(), errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith(new URL(base).origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  page.on('dialog', d => d.accept());
  await page.goto(base); await page.waitForFunction(() => window.App && App.ready);
  return { ctx, page, errors, external, close: () => ctx.close() };
}
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(App.S())));
async function importFixture(page, file) {
  await page.setInputFiles('#fileImport', path.join(FIX, file));
  await page.waitForSelector('#imOk');
  const kpis = await page.$$eval('.sheet .kpi b', els => els.map(e => +e.textContent));
  await page.click('#imOk'); await page.waitForFunction(() => !document.getElementById('ov').classList.contains('on'));
  await page.evaluate(() => App.flush());
  return { neu: kpis[0], geaendert: kpis[1], unveraendert: kpis[2], fehlt: kpis[3] };
}
const skip = !chromium && 'Playwright nicht installiert';

test('E01 Start mit leerem Browser: Willkommensseite, keine Fehler, kein Netzwerkzugriff nach außen', { skip }, async () => {
  const t = await open();
  assert.match(await t.page.textContent('#view'), /Willkommen im Projekt-Cockpit/);
  await t.page.click('#nav button[data-v="data"]'); await t.page.waitForSelector('#dBk');
  await t.page.click('#nav button[data-v="estimates"]'); await t.page.click('#nav button[data-v="tools"]'); await t.page.click('#nav button[data-v="projects"]');
  assert.deepEqual(t.errors, []); assert.deepEqual(t.external, []);
  await t.close();
});

test('E02 Projekt von Hand anlegen, Aufgabe und nächster Schritt bleiben nach Neuladen erhalten', { skip }, async () => {
  const t = await open(), p = t.page;
  await p.click('#newProjBtn'); await p.fill('#npN', 'Interne Prozessdoku'); await p.fill('#npX', 'Gliederung schreiben'); await p.click('#npOk');
  await p.click('.tabs button[data-pt="tasks"]'); await p.fill('#tN', 'Kapitel 1 entwerfen'); await p.fill('#tD', '2026-11-03'); await p.press('#tN', 'Enter');
  await p.evaluate(() => App.flush());
  await p.reload(); await p.waitForFunction(() => App.ready);
  const s = await state(p);
  assert.equal(s.projects.length, 1); assert.equal(s.projects[0].next, 'Gliederung schreiben'); assert.equal(s.projects[0].tasks[0].t, 'Kapitel 1 entwerfen');
  assert.deepEqual(t.errors, []); await t.close();
});

test('E03 weclapp-Import: Vorschau, Übernahme, zweiter Import erhält lokale Daten, Rückgängig', { skip }, async () => {
  const t = await open(), p = t.page;
  const k1 = await importFixture(p, 'weclapp-1.csv');
  assert.deepEqual(k1, { neu: 4, geaendert: 0, unveraendert: 0, fehlt: 0 });
  let s = await state(p); assert.equal(s.projects.length, 4); assert.equal(s.me, 'Max Muster');
  // lokale Angaben im Projekt 1001 setzen
  const pid = s.projects.find(x => x.nr === '1001').id;
  await p.evaluate(id => App.go('project', { pid: id, ptab: 'over' }), pid);
  await p.click('#oS button[data-k="y"]'); await p.fill('#oX', 'Abnahme terminieren');
  await p.click('.tabs button[data-pt="tasks"]'); await p.fill('#tN', 'Testprotokoll prüfen'); await p.press('#tN', 'Enter');
  await p.click('.tabs button[data-pt="log"]'); await p.fill('#lgN', 'Ansprechpartner: Frau Meier');
  await p.evaluate(() => App.flush());
  const k2 = await importFixture(p, 'weclapp-2.csv');
  assert.deepEqual(k2, { neu: 1, geaendert: 1, unveraendert: 2, fehlt: 1 });
  s = await state(p);
  const q = s.projects.find(x => x.nr === '1001');
  assert.equal(q.status, 'y'); assert.equal(q.next, 'Abnahme terminieren'); assert.equal(q.tasks[0].t, 'Testprotokoll prüfen'); assert.equal(q.notes, 'Ansprechpartner: Frau Meier');
  assert.equal(q.wc.plan, 240); assert.equal(s.projects.length, 5);
  assert.ok(s.projects.find(x => x.nr === '1003').wc.missingSince);
  // Rückgängig über den Toast
  await p.click('#toastB'); await p.waitForFunction(() => App.S().projects.length === 4);
  s = await state(p); assert.equal(s.projects.find(x => x.nr === '1001').wc.plan, 200); assert.equal(s.projects.find(x => x.nr === '1001').next, 'Abnahme terminieren');
  assert.deepEqual(t.errors, []); await t.close();
});

test('E04 Backup herunterladen, alles löschen, Backup einspielen: Stand identisch', { skip }, async () => {
  const t = await open(), p = t.page;
  await importFixture(p, 'weclapp-1.csv');
  await p.evaluate(() => { const s = App.S(); s.projects[0].notes = 'Umlaute äöüß und 😀'; App.commit(); return App.flush(); });
  const before = await state(p);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backupBtn')]);
  const file = path.join(os.tmpdir(), 'cockpit-e2e-' + Date.now() + '.json'); await dl.saveAs(file);
  const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(bk.app, 'projekt-cockpit'); assert.equal(bk.data.projects.length, 4);
  assert.ok((await state(p)).meta.lastBackup);
  await p.click('#nav button[data-v="data"]'); await p.click('#dWipe'); await p.waitForFunction(() => App.S().projects.length === 0);
  await p.setInputFiles('#fileRestore', file); await p.click('#rsOk'); await p.waitForFunction(() => App.S().projects.length === 4);
  const after = await state(p);
  assert.deepEqual(after.projects, before.projects); assert.equal(after.projects[0].notes, 'Umlaute äöüß und 😀');
  // fremde Datei wird abgelehnt
  const bad = path.join(os.tmpdir(), 'cockpit-bad.json'); fs.writeFileSync(bad, '{"app":"rad-tracker"}');
  await p.setInputFiles('#fileRestore', bad); await p.waitForSelector('#vX');
  assert.match(await p.textContent('.sheet'), /rad-tracker/);
  assert.equal((await state(p)).projects.length, 4);
  assert.deepEqual(t.errors, []); await t.close();
});

test('E05 Schätzung im Projekt: Werte, Ergebnis, E-Mail-Kopie (HTML), Excel-Download', { skip }, async () => {
  const t = await open(), p = t.page;
  await p.click('#newProjBtn'); await p.fill('#npN', 'Change Request'); await p.click('#npOk');
  await p.click('#oEst'); await p.fill('#neT', 'CR Export'); await p.click('#neOk');
  await p.click('#tAdd'); const task = p.locator('.task').last();
  await task.locator('[data-k="n"]').fill('Schnittstelle'); await task.locator('[data-k="o"]').fill('2'); await task.locator('[data-k="m"]').fill('4'); await task.locator('[data-k="p"]').fill('8');
  // 4,333 + 10 % PM + 5 % Kommunikation = 4,983 → „5“ Tage
  assert.match(await p.textContent('#resTotal'), /^5 Tage$/);
  await p.click('#xintMail'); await p.waitForFunction(() => /Kopiert/.test(document.getElementById('toastT').textContent));
  const types = await p.evaluate(async () => (await navigator.clipboard.read())[0].types);
  assert.ok(types.includes('text/html'));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#xintXls')]);
  assert.match(dl.suggestedFilename(), /\.xlsx$/);
  const s = await state(p); assert.equal(s.estimates[0].pid, s.projects[0].id);
  assert.deepEqual(t.errors, []); await t.close();
});

test('E06 Ohne IndexedDB: App läuft, warnt und speichert im Zwischenspeicher', { skip }, async () => {
  const t = await open({ init: () => { try { Object.defineProperty(window, 'indexedDB', { value: undefined }); } catch (e) {} } }), p = t.page;
  assert.match(await p.textContent('#banner'), /IndexedDB/);
  await p.click('#newProjBtn'); await p.fill('#npN', 'Ohne DB'); await p.click('#npOk'); await p.evaluate(() => App.flush());
  await p.reload(); await p.waitForFunction(() => App.ready);
  assert.equal((await state(p)).projects[0].name, 'Ohne DB');
  await t.close();
});

test('E07 Beschädigter Speicherinhalt: App startet trotzdem', { skip }, async () => {
  const t = await open({ init: () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('projektCockpit.state', '{kaputt'); localStorage.setItem('projektCockpit.ui', '[[['); } } });
  assert.match(await t.page.textContent('#view'), /Willkommen/);
  assert.deepEqual(t.errors, []); await t.close();
});

test('E08 Zweiter Tab übernimmt Änderungen des ersten', { skip }, async () => {
  const t = await open(), a = t.page, b = await t.ctx.newPage();
  await b.goto(base); await b.waitForFunction(() => App.ready);
  await a.click('#newProjBtn'); await a.fill('#npN', 'Aus Tab A'); await a.click('#npOk'); await a.evaluate(() => App.flush());
  await b.waitForFunction(() => App.S().projects.some(p => p.name === 'Aus Tab A'), null, { timeout: 5000 });
  await t.close();
});

test('E09 Übernahme aus Projekt-Radar und PM-Rechner', { skip }, async () => {
  const radar = { projects: [{ id: 'r1', name: 'Radar-Projekt', status: 'g', prio: 2, next: 'Anrufen', tasks: [{ t: 'Angebot', done: false }], log: [] }], ideas: [] };
  const pm = { est: { projects: [{ id: 'x', name: 'Radar-Projekt' }], estimates: [{ id: 'e1', pid: 'x', title: 'Alt-Schätzung', unit: 'Tage', tasks: [{ n: 'A', o: 1, m: 2, p: 3 }], stories: [], extras: [] }], lib: { tasks: [], stories: [] } } };
  const t = await open(), p = t.page;
  await t.ctx.addInitScript(d => { if (!localStorage.getItem('projektRadar.v1')) { localStorage.setItem('projektRadar.v1', d.r); localStorage.setItem('pmRechner.v1', d.p); } }, { r: JSON.stringify(radar), p: JSON.stringify(pm) });
  await p.reload(); await p.waitForFunction(() => App.ready);
  await p.click('#fr3'); await p.waitForFunction(() => App.S().projects.length === 1);
  const s = await state(p);
  assert.equal(s.projects[0].next, 'Anrufen'); assert.equal(s.estimates[0].pid, s.projects[0].id);
  assert.deepEqual(t.errors, []); await t.close();
});

test('E10 Gelöschtes Projekt über Rückgängig und über interne Version zurückholen', { skip }, async () => {
  const t = await open(), p = t.page;
  await p.click('#newProjBtn'); await p.fill('#npN', 'Wichtig'); await p.click('#npOk');
  await p.click('#oDel'); await p.waitForFunction(() => App.S().projects.length === 0);
  await p.click('#toastB'); await p.waitForFunction(() => App.S().projects.length === 1);
  await p.click('#oDel'); await p.waitForFunction(() => App.S().projects.length === 0);
  await p.click('#nav button[data-v="data"]'); await p.waitForSelector('[data-snap]');
  await p.locator('[data-snap]').first().click(); await p.waitForFunction(() => App.S().projects.length === 1);
  assert.equal((await state(p)).projects[0].name, 'Wichtig');
  assert.deepEqual(t.errors, []); await t.close();
});

test('E11 Handy-Ansicht: Navigation unten, Projekt öffnen', { skip }, async () => {
  const t = await open({ ctx: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }), p = t.page;
  await importFixture(p, 'weclapp-1.csv');
  const navBox = await p.locator('#nav').boundingBox(); assert.ok(navBox.y > 700);
  await p.locator('.card').first().click(); await p.waitForSelector('#oN');
  assert.deepEqual(t.errors, []); await t.close();
});

test('E12 Excel-Import (xlsx) funktioniert im Browser', { skip }, async () => {
  const XLSX = require('../../xlsx.mini.min.js');
  const ws = XLSX.utils.aoa_to_sheet([['Projektliste'], [], ['Auftragsnummer', 'Kunde', 'Kommission', 'Projektleiter', 'Projekt Ende', 'Geplanter abrechenbarer Aufwand (h)'], ['X-1', 'Kunde X', 'Rollout', 'Benutzer Max Muster', 46387, 40]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Liste');
  const file = path.join(os.tmpdir(), 'cockpit-e2e.xlsx'); fs.writeFileSync(file, Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
  const t = await open(), p = t.page;
  await p.waitForFunction(() => !!window.XLSX);
  const k = await importFixture(p, path.relative(FIX, file));
  assert.equal(k.neu, 1);
  const s = await state(p); assert.equal(s.projects[0].wc.ende, '2026-12-31'); assert.equal(s.projects[0].wc.pl, 'Max Muster');
  assert.deepEqual(t.errors, []); await t.close();
});

test('E13 Komplett lokal als Datei geöffnet (file://): Import, Speichern, Neuladen', { skip }, async () => {
  const ctx = await browser.newContext(), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('file://' + path.join(ROOT, 'cockpit', 'index.html')); await page.waitForFunction(() => window.App && App.ready);
  await page.waitForFunction(() => !!window.XLSX);
  await importFixture(page, 'weclapp-1.csv');
  await page.reload(); await page.waitForFunction(() => App.ready);
  assert.equal((await state(page)).projects.length, 4);
  assert.deepEqual(errors, []); await ctx.close();
});

// ---------- Erweiterung 2 ----------
async function seed(p) {
  await importFixture(p, 'weclapp-1.csv');
  await p.evaluate(() => { App.S().settings.weclappUrl = 'https://tcgprocess.weclapp.com'; App.commit(); return App.flush(); });
}
test('E14 Projekte: Filter nach Consultant, Kürzel-Bubbles, Restbudget und weclapp-Link auf der Karte', { skip }, async () => {
  const t = await open(), p = t.page; await seed(p);
  await p.click('#nav button[data-v="projects"]');
  await p.selectOption('#pcons', 'Anna Beispiel');
  assert.equal(await p.locator('.card').count(), 1);
  const card = p.locator('.card').first();
  assert.deepEqual(await card.locator('.av').allTextContents(), ['MMU', 'ABE']);
  assert.match(await card.textContent(), /Rest 50 h · 25 %/);
  assert.equal(await card.locator('a.wl').getAttribute('href'), 'https://tcgprocess.weclapp.com/app/search?s=1001');
  await p.selectOption('#pcons', ''); assert.equal(await p.locator('.card').count(), 4);
  assert.deepEqual(t.errors, []); await t.close();
});
test('E15 Cockpit: Budget aller Projekte, Rot/Gelb-Kacheln filtern, Filter zurücksetzen; weclapp-Laufzeit färbt nicht', { skip }, async () => {
  const t = await open(), p = t.page; await seed(p);
  await p.evaluate(() => { const s = App.S(); s.projects.forEach(x => x.next = 'weiter'); s.projects.find(x => x.nr === '1002').status = 'r'; App.commit(); App.go('home'); });
  // 1003 hat Projektende in der Vergangenheit und leeres „Aktuelles“ → darf nicht gelb sein
  const s = await state(p); const sev = await p.evaluate(() => App.S().projects.map(x => [x.nr, App.projSev(x)]));
  assert.equal(Object.fromEntries(sev)['1003'], 'g');
  assert.match(await p.textContent('#budgetPanel'), /1\.561 h\s*Budget gesamt/);
  assert.match(await p.textContent('#budgetRest'), /h · \d+ %/);
  await p.click('[data-hs="r"]'); await p.waitForSelector('#hsBar');
  assert.equal(await p.locator('#view .panel').first().locator('.it').count(), 1);
  assert.match(await p.textContent('#budgetPanel'), /gefiltert/);
  await p.click('#hsReset'); assert.equal(await p.locator('#hsBar').count(), 0);
  await p.click('[data-hs="y"]'); await p.click('[data-hs="y"]'); assert.equal(await p.locator('#hsBar').count(), 0);
  assert.ok(s.projects.length === 4); assert.deepEqual(t.errors, []); await t.close();
});
test('E16 Schätzungen-Übersicht: Aktionen Öffnen, Export (Kundenvariante), Löschen mit Rückgängig', { skip }, async () => {
  const t = await open(), p = t.page;
  await p.evaluate(() => { const C = App.C, es = C.newEstimate({ title: 'Angebot A', idea: 'REST-Schnittstelle', stories: [{ id: 's1', role: 'Einkauf', want: 'Bestellungen exportieren', benefit: 'schneller', ac: ['CSV-Datei'], prio: 'must' }], tasks: [{ id: 'a', n: 'Schnittstelle', d: 'Token', sid: 's1', o: 2, m: 4, p: 8 }] }); App.S().estimates.push(es); App.commit(); App.go('estimates'); });
  await p.click('[data-ex]'); await p.click('.sheet [data-v="cust"][data-f="mail"]');
  await p.waitForFunction(() => /Kopiert/.test(document.getElementById('toastT').textContent));
  const html = await p.evaluate(async () => { const it = (await navigator.clipboard.read())[0]; return await (await it.getType('text/html')).text(); });
  assert.match(html, /Puffer für Planungssicherheit/); assert.match(html, /Lösung/); assert.match(html, /Bestellungen exportieren/); assert.match(html, /CSV-Datei/);
  assert.doesNotMatch(html, /Optimistisch|Pessimistisch|>O<|Standardabw/);
  const k = await p.evaluate(() => App.C.customerView(App.S().estimates[0]).total.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
  assert.ok(html.includes('<b>' + k + '</b>'));
  await p.click('#exC');
  await p.click('[data-ed]'); await p.waitForFunction(() => App.S().estimates.length === 0);
  await p.click('#toastB'); await p.waitForFunction(() => App.S().estimates.length === 1);
  await p.click('[data-eo]'); await p.waitForSelector('#eT');
  assert.deepEqual(t.errors, []); await t.close();
});
test('E17 Aufgaben: Vorschlagsliste füllt Werte, neue Aufgaben landen automatisch in der Bibliothek, Tab öffnet Story-Auswahl', { skip }, async () => {
  const t = await open(), p = t.page;
  await p.evaluate(() => { const C = App.C; App.S().estimates.push(C.newEstimate({ title: 'Alt', tasks: [{ id: 'x', n: 'Workshop Anforderungen', d: 'mit Fachbereich', o: 1, m: 2, p: 4 }] })); App.S().estimates.push(C.newEstimate({ id: 'neu', title: 'Neu', stories: [{ id: 's1', role: 'A', want: 'B', benefit: '', ac: [], prio: 'must' }, { id: 's2', role: 'C', want: 'D', benefit: '', ac: [], prio: 'must' }] })); App.commit(); App.go('estimate', { eid: 'neu' }); });
  await p.click('#tAdd');
  const n = p.locator('.task').last().locator('[data-k="n"]');
  assert.ok(await p.locator('#dlT option[value="Workshop Anforderungen"]').count());
  await n.fill('Workshop Anforderungen'); await n.dispatchEvent('change');
  await p.waitForFunction(() => App.S().estimates.find(e => e.id === 'neu').tasks[0].m == 2);
  assert.equal(await p.locator('.task').last().locator('[data-k="d"]').inputValue(), 'mit Fachbereich');
  // neue eigene Aufgabe wird automatisch gemerkt
  await p.click('#tAdd'); const box = p.locator('.task').last();
  await box.locator('[data-k="n"]').fill('Datenmigration testen'); await box.locator('[data-k="m"]').fill('3');
  await p.waitForFunction(() => App.S().lib.tasks.some(x => x.n === 'Datenmigration testen' && x.auto), null, { timeout: 4000 });
  // Tab vom Aufgabennamen springt in die Story-Auswahl und wählt die erste Story vor
  await box.locator('[data-k="n"]').focus(); await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.k), 'sid');
  await p.waitForFunction(() => App.S().estimates.find(e => e.id === 'neu').tasks[1].sid === 's1');
  assert.deepEqual(t.errors, []); await t.close();
});
test('E18 Aktuelles fortschreiben: Präfix automatisch, Entwurf bleibt gespeichert, ganzes Feld in die Zwischenablage', { skip }, async () => {
  const t = await open(), p = t.page; await seed(p);
  const pid = (await state(p)).projects.find(x => x.nr === '1001').id;
  await p.evaluate(id => App.go('project', { pid: id, ptab: 'over' }), pid);
  await p.fill('#akIn', 'Abnahmetermin vereinbart');
  const today = await p.evaluate(() => App.C.fmtD(App.C.isoDate()));
  assert.ok((await p.textContent('#akPv')).startsWith('#' + today + ': Abnahmetermin vereinbart\n#20.10.2026: Abnahmetest läuft'));
  await p.evaluate(() => App.flush()); await p.reload(); await p.waitForFunction(() => App.ready);
  assert.equal(await p.inputValue('#akIn'), 'Abnahmetermin vereinbart');
  await p.click('#akCpAll'); await p.waitForFunction(() => /kopiert/.test(document.getElementById('toastT').textContent));
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  assert.ok(clip.startsWith('#' + today + ': Abnahmetermin vereinbart\n#20.10.2026'));
  assert.ok((await state(p)).projects.find(x => x.nr === '1001').log.some(l => l.t === 'Aktuelles: Abnahmetermin vereinbart'));
  await p.click('#akDone'); assert.equal(await p.inputValue('#akIn'), '');
  assert.equal(await p.locator('h2 a.sm').getAttribute('href'), 'https://tcgprocess.weclapp.com/app/search?s=1001');
  assert.deepEqual(t.errors, []); await t.close();
});

// ---------- Erweiterung 3: Änderungshistorie und Bedienung ----------
test('E19 Zweiter Import zeigt „Änderungen“ mit Feld-Diffs; Projekt-Verlauf enthält weclapp- und eigene Änderungen', { skip }, async () => {
  const t = await open(), p = t.page;
  await importFixture(p, 'weclapp-1.csv');
  const pid = (await state(p)).projects.find(x => x.nr === '1001').id;
  await p.evaluate(id => App.go('project', { pid: id, ptab: 'over' }), pid);
  await p.click('#oS button[data-k="y"]'); await p.fill('#oX', 'Abnahme planen');
  await importFixture(p, 'weclapp-2.csv');
  assert.equal(await p.evaluate(() => App.UI.view), 'changes');
  const txt = await p.textContent('#view');
  assert.match(txt, /Phase: Test & Abnahme → Rollout/); assert.match(txt, /Budget \(h\): 200 → 240/); assert.match(txt, /1 neu/); assert.match(txt, /Abnahme planen/);
  await p.evaluate(id => App.go('project', { pid: id, ptab: 'log' }), pid);
  const tl = await p.textContent('#tlList');
  assert.match(tl, /Phase: Test & Abnahme → Rollout/); assert.match(tl, /Status: Läuft → Achtung/); assert.match(tl, /Nächster Schritt: – → Abnahme planen/);
  await p.click('#tlf button[data-f="ich"]'); assert.doesNotMatch(await p.textContent('#tlList'), /Phase:/);
  assert.deepEqual(t.errors, []); await t.close();
});
test('E20 In weclapp abgeschlossenes Projekt: Vorschau bietet „Fertig setzen“ an', { skip }, async () => {
  const t = await open(), p = t.page;
  await importFixture(p, 'weclapp-1.csv');
  await p.setInputFiles('#fileImport', path.join(FIX, 'weclapp-3.csv')); await p.waitForSelector('#imClose');
  assert.match(await p.textContent('.sheet'), /in weclapp abgeschlossen/);
  await p.click('#imOk'); await p.waitForFunction(() => !document.getElementById('ov').classList.contains('on'));
  const q = (await state(p)).projects.find(x => x.nr === '1001');
  assert.equal(q.status, 'd'); assert.ok(q.hist.some(e => e.k === 'status' && e.to === 'd'));
  assert.deepEqual(t.errors, []); await t.close();
});
test('E21 Schnellsuche (Strg+K, /) und Tastenkürzel (N, ?, G P)', { skip }, async () => {
  const t = await open(), p = t.page; await importFixture(p, 'weclapp-1.csv');
  await p.keyboard.press('Control+k'); await p.waitForSelector('#pal');
  await p.keyboard.type('küsten'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => App.UI.view === 'project'); assert.match(await p.textContent('h2'), /Küstenwerk/);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('/'); await p.waitForSelector('#pal'); await p.keyboard.type('backup'); assert.match(await p.textContent('#palL'), /Backup erstellen/); await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => document.getElementById('sheet').contains(document.activeElement)), false);
  await p.keyboard.press('g'); await p.keyboard.press('p'); await p.waitForFunction(() => App.UI.view === 'projects');
  await p.keyboard.press('Shift+?'); await p.waitForSelector('#hX'); await p.keyboard.press('Escape');
  await p.keyboard.press('n'); await p.waitForSelector('#npN');
  assert.deepEqual(t.errors, []); await t.close();
});
test('E22 Browser-Zurück führt zur vorherigen Ansicht', { skip }, async () => {
  const t = await open(), p = t.page; await importFixture(p, 'weclapp-1.csv');
  await p.click('#nav button[data-v="projects"]'); await p.locator('.card').first().click(); await p.waitForFunction(() => App.UI.view === 'project');
  await p.goBack(); await p.waitForFunction(() => App.UI.view === 'projects');
  await p.goForward(); await p.waitForFunction(() => App.UI.view === 'project');
  assert.deepEqual(t.errors, []); await t.close();
});
test('E23 Markierung „geändert/neu“ nach Import, Filter „Letzter Import“, Speicherstatus', { skip }, async () => {
  const t = await open(), p = t.page; await importFixture(p, 'weclapp-1.csv'); await importFixture(p, 'weclapp-2.csv');
  await p.click('#nav button[data-v="projects"]'); await p.click('[data-sh="changed"]');
  assert.equal(await p.locator('.card').count(), 2);
  assert.equal(await p.locator('.card .tag.chg').count(), 1); assert.equal(await p.locator('.card .tag.new').count(), 1);
  assert.match(await p.locator('.card .tag.chg').getAttribute('title'), /Budget \(h\): 200 → 240/);
  await p.waitForFunction(() => /Gespeichert/.test(document.getElementById('saveInd').textContent));
  assert.deepEqual(t.errors, []); await t.close();
});
test('E24 Dialoge: Tab bleibt im Dialog, Esc schließt und gibt den Fokus zurück; Löschen ohne Rückfrage, aber mit Rückgängig', { skip }, async () => {
  const t = await open(), p = t.page;
  await p.focus('#newProjBtn'); await p.keyboard.press('Enter'); await p.waitForSelector('#npN');
  for (let i = 0; i < 12; i++) await p.keyboard.press('Tab');
  assert.ok(await p.evaluate(() => document.getElementById('sheet').contains(document.activeElement)));
  await p.keyboard.press('Escape'); assert.equal(await p.evaluate(() => document.activeElement.id), 'newProjBtn');
  await p.click('#newProjBtn'); await p.fill('#npN', 'Weg damit'); await p.click('#npOk');
  let dialogs = 0; p.on('dialog', () => dialogs++);
  await p.click('#oDel'); await p.waitForFunction(() => App.S().projects.length === 0); assert.equal(dialogs, 0);
  await p.click('#toastB'); await p.waitForFunction(() => App.S().projects.length === 1);
  assert.deepEqual(t.errors, []); await t.close();
});

// ---------- Verknüpfungen ----------
test('E25 Nächster Schritt füllt „Aktuelles“: Entwurf folgt beim Tippen, eigener Text bleibt, Vorschlag aus weclapp', { skip }, async () => {
  const t = await open(), p = t.page; await seed(p);
  const pid = (await state(p)).projects.find(x => x.nr === '1001').id;
  await p.evaluate(id => App.go('project', { pid: id, ptab: 'over' }), pid);
  // ohne nächsten Schritt: jüngster weclapp-Eintrag als Vorschlag, wird nicht erneut für „Aktuelles“ vorgemerkt
  await p.click('#oXa'); assert.equal(await p.inputValue('#oX'), 'Abnahmetest läuft'); assert.equal(await p.inputValue('#akIn'), '');
  await p.fill('#oX', 'Abnahme mit Kunde planen');
  assert.equal(await p.inputValue('#akIn'), 'Abnahme mit Kunde planen');
  const today = await p.evaluate(() => App.C.fmtD(App.C.isoDate()));
  assert.ok((await p.textContent('#akPv')).startsWith('#' + today + ': Abnahme mit Kunde planen'));
  assert.match(await p.textContent('#oXh'), /vorgemerkt/);
  // Entwurf selbst umformuliert: Schritt ändert ihn nicht mehr
  await p.fill('#akIn', 'Abnahmetermin am 5.11. vereinbart'); await p.fill('#oX', 'Abnahmeprotokoll vorbereiten');
  assert.equal(await p.inputValue('#akIn'), 'Abnahmetermin am 5.11. vereinbart'); assert.match(await p.textContent('#oXh'), /eigenständig/);
  // Nach „Eingetragen“ wieder verknüpft
  await p.click('#akDone'); await p.fill('#oX', 'Schulung vorbereiten'); assert.equal(await p.inputValue('#akIn'), 'Schulung vorbereiten');
  // Übersicht zeigt weiter den konkreten Schritt
  await p.click('#nav button[data-v="projects"]'); assert.match(await p.textContent('#view'), /➜ Schulung vorbereiten/);
  await p.evaluate(() => App.flush()); await p.reload(); await p.waitForFunction(() => App.ready);
  const pr = (await state(p)).projects.find(x => x.nr === '1001'); assert.equal(pr.next, 'Schulung vorbereiten'); assert.equal(pr.aktNew, 'Schulung vorbereiten');
  assert.deepEqual(t.errors, []); await t.close();
});
test('E26 Aufgaben verknüpfen: Schätzung → Projekt und Projekt → Schätzung, Fortschritt in der Schätzung', { skip }, async () => {
  const t = await open(), p = t.page; await seed(p);
  const pid = await p.evaluate(() => {
    const s = App.S(), pr = s.projects.find(x => x.nr === '1001');
    pr.tasks.push({ id: 'pt1', t: 'Testdaten aufbereiten', due: '', done: false, who: '', eid: '', etid: '' });
    s.estimates.push(App.C.newEstimate({ id: 'e1', pid: pr.id, title: 'CR Portal', tasks: [{ id: 'a', n: 'Schnittstelle bauen', d: '', sid: '', o: 1, m: 2, p: 3 }, { id: 'b', n: 'Doku', d: '', sid: '', o: 1, m: 1, p: 1 }] }));
    App.commit(); return pr.id;
  });
  await p.evaluate(id => App.go('project', { pid: id, ptab: 'tasks' }), pid);
  await p.click('#tFromE'); await p.locator('#pkL label', { hasText: 'Schnittstelle bauen' }).locator('input').check(); await p.click('#pkOk');
  await p.waitForSelector('.eref'); assert.match(await p.textContent('#pBody'), /Schnittstelle bauen[\s\S]*🧮 CR Portal · 2 Tage/);
  // zweites Mal: schon übernommene Aufgabe ist gesperrt
  await p.click('#tFromE'); assert.equal(await p.locator('#pkL label', { hasText: 'Schnittstelle bauen' }).locator('input').isDisabled(), true); await p.keyboard.press('Escape');
  // Aufgabe im Projekt erledigen, dann in der Schätzung den Fortschritt sehen
  await p.locator('.it', { hasText: 'Schnittstelle bauen' }).locator('[data-tc]').click();
  await p.click('#pBody details summary'); await p.click('.eref'); await p.waitForSelector('#tkP');
  assert.match(await p.textContent('#estProg'), /1 von 1 verknüpften Aufgaben erledigt · 2 von 3/);
  assert.match(await p.textContent('#tkP'), /🔗 Projektaufgabe ✓ erledigt/);
  // Projektaufgabe in die Schätzung übernehmen
  await p.click('#tFromP'); await p.locator('#pkL label', { hasText: 'Testdaten aufbereiten' }).locator('input').check(); await p.click('#pkOk');
  await p.waitForFunction(() => App.S().estimates[0].tasks.length === 3);
  assert.equal(await p.locator('.task').last().locator('[data-k="n"]').inputValue(), 'Testdaten aufbereiten');
  // Ins Projekt übernehmen aus der Schätzung heraus
  await p.click('#tToP'); await p.locator('#pkL label', { hasText: 'Doku' }).locator('input').check(); await p.click('#pkOk');
  await p.evaluate(() => App.flush()); await p.reload(); await p.waitForFunction(() => App.ready);
  const s = await state(p), pr = s.projects.find(x => x.id === pid);
  assert.equal(pr.tasks.filter(x => x.eid === 'e1').length, 3, 'alle drei verknüpft');
  assert.deepEqual(t.errors, []); await t.close();
});
