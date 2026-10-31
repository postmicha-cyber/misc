// Browser-Tests SonnenPilot (Handy-Größe). Benötigt Playwright mit Chromium.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
const { createService, createServer } = require('../../solar/server.js');
const { fakeGrowatt } = require('./helpers.js');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const skip = !chromium && 'Playwright nicht installiert';
let browser, staticSrv, staticBase;

test.before(async () => {
  if (!chromium) return;
  browser = await chromium.launch();
  // Statischer Server wie GitHub Pages (ohne /api) → Demo
  staticSrv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => staticSrv.listen(0, '127.0.0.1', r));
  staticBase = 'http://127.0.0.1:' + staticSrv.address().port;
});
test.after(async () => { if (browser) await browser.close(); if (staticSrv) staticSrv.close(); });

async function open(url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: opts.scheme || 'light' });
  const page = await ctx.newPage(), errors = [], external = [];
  const origin = new URL(url).origin;
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/401|404/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) external.push(r.url()); });
  page.on('dialog', d => d.accept());
  await page.goto(url);
  return { ctx, page, errors, external, close: () => ctx.close() };
}
const ready = page => page.waitForFunction(() => window.App && App.ready && App.S);

test('E01 Demo ohne Server: alle Ansichten, keine Fehler, keine Zugriffe nach außen', { skip }, async () => {
  const t = await open(staticBase + '/solar/app/index.html', { scheme: 'dark' });
  await ready(t.page);
  assert.match(await t.page.textContent('#pill'), /Demo/);
  assert.match(await t.page.textContent('#view'), /Demo/);
  assert.match(await t.page.textContent('#vPv'), /W/);
  for (const v of ['plan', 'history', 'settings', 'now']) {
    await t.page.click(`#nav button[data-v="${v}"]`);
    await t.page.waitForTimeout(100);
  }
  await t.page.click('#nav button[data-v="plan"]');
  assert.equal(await t.page.locator('#cPlan path').count() > 3, true, 'Plan-Diagramm gezeichnet');
  const box = await t.page.locator('#cPlan').boundingBox();
  await t.page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  assert.match(await t.page.textContent('#cPlan-tip'), /Uhr|:\d\d/);
  // Keine horizontale Scrollleiste auf dem Handy
  assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(t.errors, []); assert.deepEqual(t.external, []);
  await t.close();
});

test('E02 Demo: Pause, feste Leistung, Boost und Einstellungen bedienen', { skip }, async () => {
  const t = await open(staticBase + '/solar/app/index.html?demo');
  await ready(t.page);
  await t.page.click('[data-mode="off"]');
  await t.page.waitForFunction(() => App.S.settings.mode === 'off');
  assert.match(await t.page.textContent('#reason'), /pausiert/);
  await t.page.click('[data-mode="auto"]');
  await t.page.click('[data-boost]');
  await t.page.waitForFunction(() => App.S.plan.phase === 'boost');
  assert.match(await t.page.textContent('#view'), /Boost beenden/);
  await t.page.click('[data-boost="0"]');
  await t.page.waitForFunction(() => !App.S.settings.boost);
  await t.page.click('#nav button[data-v="settings"]');
  await t.page.fill('#loadNightW', '140');
  await t.page.click('#addPlane');
  assert.equal(await t.page.locator('#planes .plane').count(), 3);
  await t.page.click('#save');
  await t.page.waitForFunction(() => App.S.settings.loadNightW === 140 && App.S.settings.planes.length === 3);
  assert.deepEqual(t.errors, []);
  await t.close();
});

test('E03 Mit Server: Schlüssel abfragen, falscher Schlüssel abgelehnt, Steuerung erreicht den Speicher', { skip }, async () => {
  const g = fakeGrowatt({ soc: 70, ppv: 0, pac: 150, defaultPower: 150 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonnenpilot-e2e-'));
  const fetchFn = async (url, init) => url.includes('open-meteo') ? { ok: false, status: 503 } : g.fetch(url, init);
  const svc = createService({ env: { GROWATT_USER: 'nutzer', GROWATT_PASSWORD: 'test', APP_KEY: 'geheimerSchluessel' }, dataDir: dir, fetch: fetchFn, log: () => {} });
  await svc.tick();
  const srv = createServer(svc);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const t = await open('http://127.0.0.1:' + srv.address().port + '/');
  try {
    await t.page.waitForSelector('#key');
    await t.page.fill('#key', 'falsch'); await t.page.click('#keyOk');
    await t.page.waitForSelector('text=Schlüssel passt nicht');
    await t.page.fill('#key', 'geheimerSchluessel'); await t.page.click('#keyOk');
    await t.page.waitForSelector('#vPv');
    assert.match(await t.page.textContent('#pill'), /verbunden/);
    assert.match(await t.page.textContent('#view'), /Wetter: Wetterdienst meldet 503/, 'Fehler wird angezeigt');
    await t.page.click('[data-mode="manual"]');
    await t.page.waitForSelector('#manualW');
    await t.page.$eval('#manualW', el => { el.value = '420'; el.dispatchEvent(new Event('change')); });
    await t.page.waitForFunction(() => App.S.device.setW === 420);
    assert.equal(g.st.defaultPower, 420);
    await t.page.click('#nav button[data-v="settings"]');
    assert.match(await t.page.textContent('#view'), /Zeitsegmente/, 'Hinweis: aktive Zeitsegmente in der Shine-App');
    // Schlüssel bleibt gespeichert
    await t.page.reload(); await ready(t.page);
    assert.equal(await t.page.$('#key'), null);
    assert.deepEqual(t.errors, []); assert.deepEqual(t.external, []);
  } finally { await t.close(); srv.close(); }
});
