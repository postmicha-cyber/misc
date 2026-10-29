/* Projekt-Cockpit: lokaler Speicher.
 * Hauptspeicher ist IndexedDB, dazu eine Sicherheitskopie im localStorage. Beim Laden gewinnt der neuere Stand.
 * Nichts davon verlässt den Browser. Interne Versionen (Snapshots) liegen ebenfalls in IndexedDB.
 */
(function (root) {
  'use strict';
  const DB = 'projektCockpit', LS_STATE = 'projektCockpit.state', LS_SNAPS = 'projektCockpit.snaps';
  let db = null, idbOk = false;
  const status = { idb: false, mirror: true, persisted: null, lastSave: 0, lastError: '' };

  function openDb() {
    return new Promise(res => {
      try {
        if (!root.indexedDB) return res(null);
        const rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); if (!d.objectStoreNames.contains('snaps')) d.createObjectStore('snaps', { keyPath: 'at' }); };
        rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); rq.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
  }
  const tx = (store, mode, fn) => new Promise((res, rej) => {
    try { const t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }
    catch (e) { rej(e); }
  });
  const get = (store, key) => new Promise((res, rej) => { try { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
  const all = store => new Promise((res, rej) => { try { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });

  async function init() {
    db = await openDb(); idbOk = !!db; status.idb = idbOk;
    try { if (navigator.storage && navigator.storage.persist) status.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch (e) { status.persisted = null; }
    return status;
  }
  async function load() {
    let a = null, b = null;
    if (idbOk) { try { a = await get('kv', 'state'); } catch (e) { status.lastError = 'IndexedDB: ' + e.message; } }
    try { const t = localStorage.getItem(LS_STATE); if (t) b = JSON.parse(t); } catch (e) { /* Sicherheitskopie unlesbar */ }
    const at = x => x && x.meta && x.meta.savedAt || 0;
    if (a && b) return at(b) > at(a) ? { state: b, source: 'Sicherheitskopie' } : { state: a, source: 'IndexedDB' };
    return a ? { state: a, source: 'IndexedDB' } : b ? { state: b, source: 'Sicherheitskopie' } : { state: null, source: 'neu' };
  }
  async function save(state) {
    state.meta.savedAt = Date.now();
    let ok = false;
    if (idbOk) { try { await tx('kv', 'readwrite', s => s.put(state, 'state')); ok = true; } catch (e) { status.lastError = 'IndexedDB: ' + (e && e.message); } }
    try { localStorage.setItem(LS_STATE, JSON.stringify(state)); status.mirror = true; ok = true; } catch (e) { status.mirror = false; }
    if (ok) status.lastSave = state.meta.savedAt;
    return ok;
  }
  // ---------- interne Versionen ----------
  async function snapshots() {
    if (idbOk) { try { return (await all('snaps')).sort((x, y) => y.at - x.at); } catch (e) { return []; } }
    try { return JSON.parse(localStorage.getItem(LS_SNAPS) || '[]'); } catch (e) { return []; }
  }
  async function addSnapshot(kind, label, state, prune) {
    const snap = { at: Date.now(), kind, label, counts: root.Core.counts(state), data: JSON.parse(JSON.stringify(state)) };
    if (idbOk) {
      try {
        await tx('snaps', 'readwrite', s => s.put(snap));
        const list = await snapshots(), keep = new Set(prune(list).map(x => x.at));
        const drop = list.filter(x => !keep.has(x.at));
        if (drop.length) await tx('snaps', 'readwrite', s => drop.forEach(x => s.delete(x.at)));
        return true;
      } catch (e) { status.lastError = 'Version: ' + e.message; return false; }
    }
    try { const L = prune([snap].concat(await snapshots())).slice(0, 6); localStorage.setItem(LS_SNAPS, JSON.stringify(L)); return true; } catch (e) { return false; }
  }
  // ---------- Backup-Ordner (Chrome/Edge: File System Access API) ----------
  const canFolder = () => typeof root.showDirectoryPicker === 'function';
  async function getDir() { if (!idbOk) return null; try { return (await get('kv', 'backupDir')) || null; } catch (e) { return null; } }
  async function setDir(h) { if (idbOk) await tx('kv', 'readwrite', s => h ? s.put(h, 'backupDir') : s.delete('backupDir')); }
  async function writeToDir(handle, name, text) {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Kein Schreibzugriff auf den Ordner');
    const fh = await handle.getFileHandle(name, { create: true }), w = await fh.createWritable();
    await w.write(text); await w.close();
  }
  async function wipe() {
    if (idbOk) { try { await tx('kv', 'readwrite', s => s.delete('state')); } catch (e) {} }
    try { localStorage.removeItem(LS_STATE); } catch (e) {}
  }
  async function estimate() { try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { return null; } }

  root.Store = { init, load, save, snapshots, addSnapshot, canFolder, getDir, setDir, writeToDir, wipe, estimate, status };
})(typeof self !== 'undefined' ? self : this);
