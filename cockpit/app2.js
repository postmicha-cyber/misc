/* Projekt-Cockpit: Oberfläche (Teil 2: Schätzungen, Werkzeuge, Daten & Import). */
(() => {
  'use strict';
  const A = window.App, C = A.C, ST = window.Store, $ = A.$, esc = A.esc, f1 = A.f1, f0 = A.f0, today = A.today;
  const S = () => A.S(), UI = A.UI;
  const short = u => ({ Stunden: 'h', Tage: 'PT', Wochen: 'Wo', 'Story Points': 'SP' })[u] || u;
  const projName = pid => { const p = A.byId(pid); return p ? p.name : 'Ohne Projekt'; };
  const storyNo = (es, sid) => { const i = es.stories.findIndex(s => s.id === sid); return i < 0 ? '' : 'US' + (i + 1); };
  const touchE = es => { es.updated = Date.now(); A.commit(); };

  // ================= Schätzungen =================
  A.newEstimate = pid => {
    const tpls = S().estimates.filter(x => x.tpl);
    A.sheet('<h4>＋ Neue Schätzung</h4><label class="f"><span>Titel</span><input id="neT" autofocus placeholder="z. B. Change Request Lieferantenportal"></label>' +
      '<div class="row" style="margin-top:10px"><label class="f"><span>Projekt</span><select id="neP">' + projOpts(pid) + '</select></label><label class="f"><span>Einheit</span><select id="neU">' + C.UNITS.map(u => '<option' + (u === 'Tage' ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></label></div>' +
      '<label class="f"><span>Anfrage von / Quelle</span><input id="neS" placeholder="z. B. Mail von Frau Meier vom 28.10."></label>' +
      (tpls.length ? '<label class="f" style="margin-top:10px"><span>Starten mit</span><select id="neB"><option value="">Leer</option>' + tpls.map(t => '<option value="' + t.id + '">Vorlage: ' + esc(t.title) + '</option>').join('') + '</select></label>' : '') +
      '<div class="acts"><button class="btn sec" id="neC">Abbrechen</button><button class="btn" id="neOk">Anlegen</button></div>', () => {
      $('neC').onclick = A.closeSheet;
      $('neOk').onclick = () => {
        const base = $('neB') && $('neB').value ? S().estimates.find(x => x.id === $('neB').value) : null;
        const es = base ? C.cloneEstimate(base) : C.newEstimate({}, today());
        Object.assign(es, { title: $('neT').value.trim() || (base ? base.title : 'Neue Schätzung'), pid: $('neP').value, source: $('neS').value.trim(), date: today(), status: 'draft', tpl: false });
        if (!base) es.unit = $('neU').value; else if ($('neU').value !== es.unit) convertEst(es, $('neU').value);
        S().estimates.push(es); A.commit(); A.closeSheet();
        A.go('estimate', { eid: es.id, back: pid ? { view: 'project', pid, ptab: 'est' } : { view: 'estimates' } });
      };
    });
  };
  const projOpts = sel => '<option value="">Ohne Projekt</option>' + S().projects.filter(p => !p.archived || p.id === sel).slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
  function convertEst(es, to) {
    es.tasks.forEach(t => { ['o', 'm', 'p'].forEach(k => { if (t[k] !== '') t[k] = C.conv(t[k], es.unit, to); }); });
    es.extras.forEach(x => { if (x.type === 'fix') x.v = C.conv(x.v, es.unit, to); });
    es.unit = to;
  }
  A.estimatesView = () => {
    const q = C.normTxt(UI.estQ || '');
    const L = S().estimates.filter(e => !q || C.normTxt([e.title, e.source, e.idea, projName(e.pid), ...e.tasks.map(t => t.n + ' ' + t.d), ...e.stories.map(C.storyText)].join(' ')).includes(q)).sort((a, b) => b.updated - a.updated);
    const groups = new Map(); L.forEach(e => { const k = e.pid || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); });
    let h = '<h2>Schätzungen<span class="sp"></span><button class="sm" id="libBtn">📚 Bibliothek</button><button class="sm pri" id="esNew">＋ Neue Schätzung</button></h2>' +
      '<div class="panel"><input id="esQ" value="' + esc(UI.estQ || '') + '" placeholder="🔎 Schätzungen, Aufgaben, Stories durchsuchen …"></div>';
    if (!S().estimates.length) h += '<div class="empty"><div class="e">🧮</div>Noch keine Schätzung. Lege eine an – am besten direkt im Projekt unter „Schätzungen“.</div>';
    h += '<div class="grid">' + [...groups.entries()].map(([pid, es]) => '<div class="panel"><h3>📁 ' + esc(projName(pid)) + '<span class="sp"></span><span class="cnt">' + es.length + '</span></h3><div class="list">' +
      es.map(e => { const r = C.calcEstimate(e); return '<div class="it" data-e="' + e.id + '" style="cursor:pointer"><div class="t"><b>' + (e.tpl ? '📌 ' : '') + esc(e.title) + '</b><small>' + C.EST_STATUS[e.status] + ' · ' + C.fmtD(e.date) + ' · 85 %: ' + f1(r.p85) + '</small></div><b>' + f1(r.total) + ' ' + esc(short(e.unit)) + '</b></div>'; }).join('') + '</div></div>').join('') + '</div>';
    $('view').innerHTML = h;
    const qi = $('esQ'); qi.oninput = () => { UI.estQ = qi.value; const p = qi.selectionStart; A.estimatesView(); const n = $('esQ'); n.focus(); n.setSelectionRange(p, p); };
    $('esNew').onclick = () => A.newEstimate(''); $('libBtn').onclick = libSheet;
    $('view').querySelectorAll('[data-e]').forEach(el => el.onclick = () => A.go('estimate', { eid: el.dataset.e, back: { view: 'estimates' } }));
  };
  const cur = () => S().estimates.find(e => e.id === UI.eid);
  A.estimateEditor = () => {
    const es = cur(); if (!es) return A.go('estimates');
    $('view').innerHTML = '<div class="bar"><button class="sm" id="eBack">‹ Zurück</button></div><h2>🧮 ' + esc(es.title) + '</h2>' +
      '<div class="cols"><div>' +
      '<div class="panel"><div class="row"><label class="f" style="flex:2"><span>Titel</span><input id="eT" value="' + esc(es.title) + '"></label><label class="f"><span>Projekt</span><select id="eP">' + projOpts(es.pid) + '</select></label></div>' +
      '<div class="row" style="margin:0"><label class="f"><span>Status</span><select id="eS">' + Object.entries(C.EST_STATUS).map(([k, v]) => '<option value="' + k + '"' + (k === es.status ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label><label class="f"><span>Anfrage von / Quelle</span><input id="eQ" value="' + esc(es.source) + '"></label><label class="f"><span>Stand</span><input type="date" id="eD" value="' + esc(es.date) + '"></label><label class="f"><span>Einheit</span><select id="eU">' + C.UNITS.map(u => '<option' + (u === es.unit ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></label></div></div>' +
      '<div class="panel"><h3>💡 Lösungsidee / grobes Design</h3><textarea id="eI" rows="3" placeholder="Was ist gefordert, wie lösen wir es grob? Annahmen und Abgrenzungen.">' + esc(es.idea) + '</textarea></div>' +
      '<div class="panel" id="stP"></div><div class="panel" id="tkP"></div><div class="panel" id="exP"></div>' +
      '<div class="panel"><h3>Weiteres</h3><div class="bar" style="margin:0"><button class="sm" id="eDup">⧉ Duplizieren</button><button class="sm" id="eTpl">' + (es.tpl ? '📌 Vorlage: an' : '📌 Als Vorlage') + '</button><button class="sm" id="eDel" style="color:var(--r)">🗑 Löschen</button></div></div>' +
      '</div><div style="position:sticky;top:70px"><div class="panel" id="outP"></div></div></div>';
    $('eBack').onclick = () => A.go(UI.back && UI.back.view || 'estimates', UI.back || {});
    const bind = (id, k, re) => $(id).oninput = $(id).onchange = e => { es[k] = e.target.value; touchE(es); if (re) A.estimateEditor(); else renderOut(); };
    bind('eT', 'title'); bind('eQ', 'source'); bind('eD', 'date'); bind('eI', 'idea'); bind('eS', 'status'); bind('eP', 'pid');
    $('eU').onchange = e => { const to = e.target.value; if (es.tasks.length && C.HOURS[es.unit] && C.HOURS[to] && confirm('Werte von ' + es.unit + ' in ' + to + ' umrechnen (1 Tag = 8 h, 1 Woche = 5 Tage)?')) convertEst(es, to); else es.unit = to; touchE(es); A.estimateEditor(); };
    $('eDup').onclick = () => { const c = C.cloneEstimate(es); Object.assign(c, { title: es.title + ' (Kopie)', tpl: false, status: 'draft', date: today() }); S().estimates.push(c); A.commit(); A.go('estimate', { eid: c.id }); A.toast('Kopie angelegt'); };
    $('eTpl').onclick = () => { es.tpl = !es.tpl; touchE(es); A.estimateEditor(); A.toast(es.tpl ? '📌 Steht bei „Neue Schätzung“ als Vorlage bereit' : 'Keine Vorlage mehr'); };
    $('eDel').onclick = async () => { if (!confirm('Schätzung „' + es.title + '“ löschen?')) return; await A.snapshot('vor Löschen', 'Vor Löschen: Schätzung ' + es.title); const i = S().estimates.indexOf(es); S().estimates.splice(i, 1); A.commit(); A.go(UI.back && UI.back.view || 'estimates', UI.back || {}); A.toast('Schätzung gelöscht', 'Rückgängig', () => { S().estimates.splice(i, 0, es); A.commit(); A.go('estimate', { eid: es.id }); }); };
    wireExport(); renderStories(); renderTasks(); renderExtras(); renderOut();
  };
  function renderStories() {
    const es = cur();
    $('stP').innerHTML = '<h3>📝 Anforderungen (User Stories)<span class="sp"></span><span class="cnt">' + es.stories.length + '</span></h3>' +
      es.stories.map((s, i) => { const L = es.tasks.filter(t => t.sid === s.id), e = L.reduce((a, t) => a + C.tE(t), 0);
        return '<div class="story"><div class="t"><b style="color:var(--acc)">US' + (i + 1) + ' · ' + C.PRIO[s.prio] + '</b><br>' + esc(C.storyText(s)) + (s.ac.length ? '<small>✔ ' + s.ac.map(esc).join('<br>✔ ') + '</small>' : '') + '<small>' + L.length + ' Aufgaben · ' + f1(e) + ' ' + esc(short(es.unit)) + '</small></div><div style="display:flex;flex-direction:column;gap:6px"><button class="sm" data-se="' + s.id + '">✏️</button><button class="sm" data-st="' + s.id + '" title="Aufgabe zu dieser Story">＋</button></div></div>'; }).join('') +
      '<button class="btn sec wide" id="sAdd">＋ User Story</button>';
    $('sAdd').onclick = () => storySheet(null);
    $('stP').querySelectorAll('[data-se]').forEach(b => b.onclick = () => storySheet(es.stories.find(s => s.id === b.dataset.se)));
    $('stP').querySelectorAll('[data-st]').forEach(b => b.onclick = () => addTask({ sid: b.dataset.st }));
  }
  function storySheet(s) {
    const es = cur(), isNew = !s, w = s ? JSON.parse(JSON.stringify(s)) : { id: C.uid(), role: '', want: '', benefit: '', ac: [], prio: 'must' };
    const roles = [...new Set(S().estimates.flatMap(x => x.stories.map(y => y.role)).concat(['Kunde', 'Sachbearbeiter:in', 'Projektleiter:in', 'Administrator:in']).filter(Boolean))].slice(0, 8);
    A.sheet('<h4>' + (isNew ? '📝 Neue User Story' : '✏️ User Story') + '</h4><div class="help">Vorlage: <b>Als</b> [Rolle] <b>möchte ich</b> [Ziel], <b>damit</b> [Nutzen]. Beschreibe das <i>Was</i>, nicht das <i>Wie</i>; klein und testbar.</div>' +
      '<label class="f"><span>Als …</span><input id="sR" value="' + esc(w.role) + '" autofocus></label><div class="chips" id="sRc" style="margin:6px 0 10px">' + roles.map(r => '<button>' + esc(r) + '</button>').join('') + '</div>' +
      '<label class="f"><span>möchte ich …</span><textarea id="sW">' + esc(w.want) + '</textarea></label><label class="f" style="margin-top:8px"><span>damit …</span><textarea id="sB">' + esc(w.benefit) + '</textarea></label>' +
      '<div class="note" id="sPv" style="margin-top:10px"></div><label class="f"><span>Akzeptanzkriterien (eins pro Zeile)</span><textarea id="sA" rows="3">' + esc(w.ac.join('\n')) + '</textarea></label>' +
      '<div class="chips" style="margin:6px 0 10px"><button id="sG">＋ Gegeben … wenn … dann …</button><button id="sF">＋ Fehlerfall</button></div>' +
      '<div class="f"><span>Priorität (MoSCoW)</span><div class="chips" id="sP">' + Object.entries(C.PRIO).map(([k, v]) => '<button data-p="' + k + '" class="' + (w.prio === k ? 'on' : '') + '">' + v + '</button>').join('') + '</div></div>' +
      '<label class="pick" style="border:0;margin-top:8px"><input type="checkbox" id="sL"><div>Auch in der Bibliothek speichern<small>zur Wiederverwendung in anderen Schätzungen</small></div></label>' +
      '<div class="acts">' + (isNew ? '' : '<button class="btn red" id="sX">Löschen</button>') + '<button class="btn sec" id="sC">Abbrechen</button><button class="btn" id="sOk">Speichern</button></div>', () => {
      const read = () => { w.role = $('sR').value.trim(); w.want = $('sW').value.trim(); w.benefit = $('sB').value.trim(); w.ac = $('sA').value.split('\n').map(x => x.trim()).filter(Boolean); };
      const pv = () => { read(); $('sPv').textContent = C.storyText(w); }; ['sR', 'sW', 'sB'].forEach(id => $(id).oninput = pv); pv();
      $('sRc').querySelectorAll('button').forEach(b => b.onclick = () => { $('sR').value = b.textContent; pv(); });
      const add = t => { const a = $('sA'); a.value = (a.value.trim() ? a.value.trim() + '\n' : '') + t; a.focus(); };
      $('sG').onclick = () => add('Gegeben …, wenn …, dann …'); $('sF').onclick = () => add('Wenn … fehlschlägt, dann sehe ich eine verständliche Meldung');
      $('sP').querySelectorAll('button').forEach(b => b.onclick = () => { w.prio = b.dataset.p; $('sP').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
      $('sC').onclick = A.closeSheet;
      if ($('sX')) $('sX').onclick = () => { es.stories = es.stories.filter(x => x.id !== w.id); es.tasks.forEach(t => { if (t.sid === w.id) t.sid = ''; }); touchE(es); A.closeSheet(); A.estimateEditor(); };
      $('sOk').onclick = () => {
        read(); if (!w.want) return $('sW').focus();
        if (isNew) es.stories.push(w); else Object.assign(s, w);
        if ($('sL').checked) { const L = S().lib.stories, ex = L.find(x => C.normTxt(x.want) === C.normTxt(w.want)); const item = { role: w.role, want: w.want, benefit: w.benefit, ac: w.ac.slice(), prio: w.prio }; if (ex) Object.assign(ex, item); else L.push(Object.assign({ id: C.uid() }, item)); }
        touchE(es); A.closeSheet(); renderStories(); renderTasks(); A.toast('📝 Story gespeichert');
      };
    });
  }
  function addTask(o) {
    const es = cur(); es.tasks.push(Object.assign({ id: C.uid(), n: '', d: '', sid: '', o: '', m: '', p: '' }, o)); touchE(es); renderTasks(); renderStories(); renderOut();
    const L = $('tkP').querySelectorAll('input[data-k="n"]'), el = L[L.length - 1]; el.focus(); el.scrollIntoView({ block: 'center' });
  }
  function renderTasks() {
    const es = cur(), u = short(es.unit);
    $('tkP').innerHTML = '<h3>🔧 Aufgaben<span class="sp"></span><span class="cnt">' + es.tasks.length + '</span></h3><div class="help">O = optimistisch, M = wahrscheinlich, P = pessimistisch. Erwartungswert = (O + 4·M + P) ÷ 6. Beim Tippen werden ähnliche frühere Aufgaben vorgeschlagen.</div>' +
      es.tasks.map((t, i) => '<div class="task" data-id="' + t.id + '"><div class="row" style="margin-bottom:6px"><label class="f" style="flex:3"><span>' + (i + 1) + '. Aufgabe</span><input data-k="n" value="' + esc(t.n) + '"></label>' +
        (es.stories.length ? '<label class="f"><span>Story</span><select data-k="sid"><option value="">–</option>' + es.stories.map((s, j) => '<option value="' + s.id + '"' + (s.id === t.sid ? ' selected' : '') + '>US' + (j + 1) + '</option>').join('') + '</select></label>' : '') + '</div>' +
        '<label class="f" style="margin-bottom:6px"><span>Beschreibung</span><textarea data-k="d" rows="1">' + esc(t.d) + '</textarea></label>' +
        '<div class="g4"><label class="f" style="min-width:0"><span>O</span><input inputmode="decimal" data-k="o" value="' + esc(t.o) + '"></label><label class="f" style="min-width:0"><span>M</span><input inputmode="decimal" data-k="m" value="' + esc(t.m) + '"></label><label class="f" style="min-width:0"><span>P</span><input inputmode="decimal" data-k="p" value="' + esc(t.p) + '"></label><div class="ev"><b data-ev>' + f1(C.tE(t)) + '</b><small>' + esc(u) + ' erw.</small></div></div>' +
        '<div class="bar" style="margin:8px 0 0;justify-content:flex-end"><button class="sm" data-a="up">↑</button><button class="sm" data-a="lib" title="In Bibliothek">⭐</button><button class="sm" data-a="cp" title="Duplizieren">⧉</button><button class="sm" data-a="rm" title="Löschen">✕</button></div><div data-sug></div></div>').join('') +
      '<div class="bar" style="margin:0"><button class="btn" id="tAdd">＋ Aufgabe</button><button class="btn sec" id="tReuse">📚 Wiederverwenden</button></div>';
    $('tAdd').onclick = () => addTask({}); $('tReuse').onclick = reuseSheet;
    $('tkP').querySelectorAll('.task').forEach(box => {
      const t = es.tasks.find(x => x.id === box.dataset.id);
      box.querySelectorAll('[data-k]').forEach(inp => inp.oninput = inp.onchange = () => {
        const k = inp.dataset.k; t[k] = inp.value; touchE(es);
        if ('omp'.includes(k)) box.querySelector('[data-ev]').textContent = f1(C.tE(t));
        if (k === 'n') suggest(box, t); if (k === 'sid') renderStories(); renderOut();
      });
      box.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
        const i = es.tasks.indexOf(t), a = b.dataset.a;
        if (a === 'rm') { es.tasks.splice(i, 1); touchE(es); renderTasks(); renderStories(); renderOut(); return A.toast('Aufgabe gelöscht', 'Rückgängig', () => { es.tasks.splice(i, 0, t); touchE(es); A.estimateEditor(); }); }
        if (a === 'up' && i > 0) { es.tasks.splice(i, 1); es.tasks.splice(i - 1, 0, t); }
        if (a === 'cp') es.tasks.splice(i + 1, 0, Object.assign({}, t, { id: C.uid(), n: t.n + ' (Kopie)' }));
        if (a === 'lib') { if (!t.n) return A.toast('Erst einen Namen eintragen'); const L = S().lib.tasks, ex = L.find(x => C.normTxt(x.n) === C.normTxt(t.n)), item = { n: t.n, d: t.d, o: C.num(t.o), m: C.num(t.m), p: C.num(t.p), unit: es.unit }; if (ex) Object.assign(ex, item); else L.push(Object.assign({ id: C.uid(), used: 0 }, item)); A.commit(); return A.toast('⭐ In der Bibliothek gespeichert'); }
        touchE(es); renderTasks(); renderStories(); renderOut();
      });
    });
  }
  let sugT;
  function suggest(box, t) {
    clearTimeout(sugT);
    sugT = setTimeout(() => {
      const host = box.querySelector('[data-sug]'), es = cur(), k = C.bestMatch(S(), t.n, es.id);
      if (!k || (C.num(t.m) && C.num(t.m) === C.conv(k.t.m, k.unit, es.unit))) { host.innerHTML = ''; return; }
      host.innerHTML = '<div class="sug"><span>💡 Früher: <b>' + esc(k.t.n) + '</b> · ' + [k.t.o, k.t.m, k.t.p].map(x => f1(C.conv(x, k.unit, es.unit))).join(' / ') + ' ' + esc(short(es.unit)) + ' <span class="muted">(' + esc(k.from) + ')</span></span><button class="sm pri">Übernehmen</button></div>';
      host.querySelector('button').onclick = () => { ['o', 'm', 'p'].forEach(x => t[x] = C.conv(k.t[x], k.unit, es.unit)); if (!t.d && k.t.d) t.d = k.t.d; touchE(es); renderTasks(); renderOut(); A.toast('Werte übernommen'); };
    }, 300);
  }
  function renderExtras() {
    const es = cur(), r = C.calcEstimate(es);
    $('exP').innerHTML = '<h3>🧩 Allgemeine Aufwände</h3><div class="help">Zuschläge, die keiner Aufgabe gehören. % bezieht sich auf die Summe der Aufgaben.</div>' +
      es.extras.map(x => '<div class="xr" data-id="' + x.id + '"><input type="checkbox" data-k="on"' + (x.on ? ' checked' : '') + '><input data-k="n" value="' + esc(x.n) + '"><div style="display:flex;gap:4px"><input data-k="v" inputmode="decimal" value="' + esc(x.v) + '" style="text-align:right"><select data-k="type" style="width:58px;flex:none"><option value="pct"' + (x.type === 'pct' ? ' selected' : '') + '>%</option><option value="fix"' + (x.type === 'fix' ? ' selected' : '') + '>' + esc(short(es.unit)) + '</option></select></div><span data-amt style="text-align:right;font-weight:700" class="muted">' + (x.on ? '+' + f1(x.type === 'pct' ? r.base * C.num(x.v) / 100 : C.num(x.v)) : '–') + '</span><button class="x" data-rm>✕</button></div>').join('') +
      '<button class="btn sec wide" id="xAdd" style="margin-top:6px">＋ Aufwand</button>';
    $('xAdd').onclick = () => { es.extras.push({ id: C.uid(), n: 'Sonstiges', type: 'fix', v: 1, on: true }); touchE(es); renderExtras(); renderOut(); };
    $('exP').querySelectorAll('.xr').forEach(row => {
      const x = es.extras.find(y => y.id === row.dataset.id);
      row.querySelectorAll('[data-k]').forEach(inp => inp.oninput = inp.onchange = () => { const k = inp.dataset.k; x[k] = k === 'on' ? inp.checked : inp.value; touchE(es); if (k === 'on' || k === 'type') renderExtras(); renderOut(); });
      row.querySelector('[data-rm]').onclick = () => { es.extras = es.extras.filter(y => y !== x); touchE(es); renderExtras(); renderOut(); };
    });
  }
  function renderOut() {
    const es = cur(), r = C.calcEstimate(es), u = es.unit;
    if ($('exP')) $('exP').querySelectorAll('.xr').forEach(row => { const x = es.extras.find(y => y.id === row.dataset.id); row.querySelector('[data-amt]').textContent = x.on ? '+' + f1(x.type === 'pct' ? r.base * C.num(x.v) / 100 : C.num(x.v)) : '–'; });
    $('outNums').innerHTML = '<div class="res"><div class="hl"><b id="resTotal">' + f1(r.total) + ' ' + esc(u) + '</b><span>Gesamt (Erwartungswert)</span></div><div><b>' + f1(r.p85) + '</b><span>mit 85 % Sicherheit</span></div><div><b>± ' + f1(r.sd) + '</b><span>Standardabw.</span></div><div><b>' + f1(r.r68[0]) + '–' + f1(r.r68[1]) + '</b><span>Bereich 68 %</span></div><div><b>' + f1(r.r95[0]) + '–' + f1(r.r95[1]) + '</b><span>Bereich 95 %</span></div></div>' +
      '<table class="t" style="margin-top:10px"><tr><td>Aufgaben (' + es.tasks.length + ')</td><td class="n">' + f1(r.base) + '</td></tr>' + r.ex.map(e => '<tr><td>' + esc(e.x.n) + (e.x.type === 'pct' ? ' (' + f1(e.x.v) + ' %)' : '') + '</td><td class="n">+' + f1(e.amt) + '</td></tr>').join('') + '<tr><td><b>Gesamt</b></td><td class="n"><b>' + f1(r.total) + ' ' + esc(short(u)) + '</b></td></tr></table>' +
      (r.bad.length ? '<div class="note y" style="margin-top:10px">⚠️ Nicht O ≤ M ≤ P: ' + r.bad.map(t => esc(t.n || 'ohne Namen')).join(', ') + '</div>' : '<div class="help" style="margin-top:10px">Für Zusagen den 85-%-Wert nehmen, intern mit dem Erwartungswert planen.</div>');
  }
  // Export-Buttons werden nur einmal gebaut, damit ein Klick direkt nach dem Tippen nicht verloren geht
  function wireExport() {
    const es = cur();
    $('outP').innerHTML = '<h3>Ergebnis</h3><div id="outNums"></div><h3 style="margin-top:12px">Export</h3><div class="bar" style="margin:0"><button class="sm pri" id="xMail">📋 Für E-Mail kopieren</button><button class="sm" id="xXls">📊 Excel</button><button class="sm" id="xPrint">🖨 Drucken / PDF</button></div>';
    $('xMail').onclick = () => copyRich(reportHTML(cur()), reportText(cur()));
    $('xXls').onclick = () => exportXlsx(cur());
    $('xPrint').onclick = () => { const es = cur(), w = window.open('', '_blank'); if (!w) return A.toast('Pop-up blockiert'); w.document.write('<!doctype html><html lang="de"><head><meta charset="utf-8"><title>' + esc(es.title) + '</title></head><body style="margin:24px">' + reportHTML(es) + '<script>setTimeout(()=>print(),300)<\/script></body></html>'); w.document.close(); };
  }
  function reportText(es) {
    const r = C.calcEstimate(es), u = es.unit, L = ['Schätzung: ' + es.title, 'Projekt: ' + projName(es.pid) + ' · Stand: ' + C.fmtD(es.date) + ' · Status: ' + C.EST_STATUS[es.status] + (es.source ? ' · Quelle: ' + es.source : ''), '',
      'Ergebnis: ' + f1(r.total) + ' ' + u + ' (Erwartungswert), mit 85 % Sicherheit ' + f1(r.p85) + ' ' + u, ''];
    if (es.idea) L.push('Lösungsidee:', es.idea, '');
    if (es.stories.length) { L.push('Anforderungen:'); es.stories.forEach((s, i) => { L.push('US' + (i + 1) + ' [' + C.PRIO[s.prio] + '] ' + C.storyText(s)); s.ac.forEach(a => L.push('   ✔ ' + a)); }); L.push(''); }
    L.push('Aufgaben (O / M / P → erwartet, in ' + u + '):');
    es.tasks.forEach((t, i) => { L.push((i + 1) + '. ' + (t.n || 'ohne Namen') + (t.sid ? ' (' + storyNo(es, t.sid) + ')' : '') + ': ' + [t.o, t.m, t.p].map(f1).join(' / ') + ' → ' + f1(C.tE(t))); if (t.d) L.push('   ' + t.d); });
    L.push('Summe Aufgaben: ' + f1(r.base) + ' ' + u); r.ex.forEach(e => L.push('+ ' + e.x.n + ': ' + f1(e.amt) + ' ' + u)); L.push('Gesamt: ' + f1(r.total) + ' ' + u + ' · 85 %: ' + f1(r.p85) + ' ' + u);
    return L.join('\n');
  }
  function reportHTML(es) {
    const r = C.calcEstimate(es), u = esc(es.unit), td = 'style="border:1px solid #c8cfe0;padding:5px 8px;vertical-align:top"', tn = 'style="border:1px solid #c8cfe0;padding:5px 8px;text-align:right;white-space:nowrap"', th = 'style="border:1px solid #c8cfe0;padding:5px 8px;background:#eef1fb;text-align:left"';
    let h = '<div style="font-family:Segoe UI,Calibri,Arial,sans-serif;font-size:14px;color:#1b2033"><h2 style="font-size:18px;margin:0 0 4px">Schätzung: ' + esc(es.title) + '</h2><div style="color:#5a6380;margin-bottom:10px">Projekt: ' + esc(projName(es.pid)) + ' · Stand: ' + C.fmtD(es.date) + ' · Status: ' + C.EST_STATUS[es.status] + (es.source ? ' · Quelle: ' + esc(es.source) : '') + '</div>' +
      '<table style="border-collapse:collapse;margin-bottom:12px"><tr><td ' + th + '>Gesamt (Erwartungswert)</td><td ' + tn + '><b>' + f1(r.total) + ' ' + u + '</b></td></tr><tr><td ' + td + '>Mit 85 % Sicherheit</td><td ' + tn + '>' + f1(r.p85) + ' ' + u + '</td></tr><tr><td ' + td + '>Bereich 68 %</td><td ' + tn + '>' + f1(r.r68[0]) + ' – ' + f1(r.r68[1]) + ' ' + u + '</td></tr></table>';
    if (es.idea) h += '<h3 style="font-size:15px;margin:12px 0 4px">Lösungsidee</h3><div style="white-space:pre-wrap">' + esc(es.idea) + '</div>';
    if (es.stories.length) h += '<h3 style="font-size:15px;margin:12px 0 4px">Anforderungen</h3><table style="border-collapse:collapse"><tr><th ' + th + '>Nr.</th><th ' + th + '>User Story</th><th ' + th + '>Akzeptanzkriterien</th><th ' + th + '>Prio</th></tr>' + es.stories.map((s, i) => '<tr><td ' + td + '>US' + (i + 1) + '</td><td ' + td + '>' + esc(C.storyText(s)) + '</td><td ' + td + '>' + s.ac.map(esc).join('<br>') + '</td><td ' + td + '>' + C.PRIO[s.prio] + '</td></tr>').join('') + '</table>';
    h += '<h3 style="font-size:15px;margin:12px 0 4px">Aufgaben</h3><table style="border-collapse:collapse"><tr><th ' + th + '>Nr.</th><th ' + th + '>Aufgabe</th><th ' + th + '>Beschreibung</th><th ' + th + '>Story</th><th ' + th + '>O</th><th ' + th + '>M</th><th ' + th + '>P</th><th ' + th + '>Erwartet (' + u + ')</th></tr>' +
      es.tasks.map((t, i) => '<tr><td ' + td + '>' + (i + 1) + '</td><td ' + td + '>' + esc(t.n) + '</td><td ' + td + '><span style="white-space:pre-wrap">' + esc(t.d) + '</span></td><td ' + td + '>' + storyNo(es, t.sid) + '</td><td ' + tn + '>' + f1(t.o) + '</td><td ' + tn + '>' + f1(t.m) + '</td><td ' + tn + '>' + f1(t.p) + '</td><td ' + tn + '>' + f1(C.tE(t)) + '</td></tr>').join('') +
      '<tr><td ' + td + ' colspan="7"><b>Summe Aufgaben</b></td><td ' + tn + '><b>' + f1(r.base) + '</b></td></tr>' + r.ex.map(e => '<tr><td ' + td + ' colspan="7">+ ' + esc(e.x.n) + (e.x.type === 'pct' ? ' (' + f1(e.x.v) + ' %)' : '') + '</td><td ' + tn + '>' + f1(e.amt) + '</td></tr>').join('') +
      '<tr><td ' + th + ' colspan="7"><b>Gesamt</b></td><td ' + tn + '><b>' + f1(r.total) + '</b></td></tr></table><div style="color:#5a6380;font-size:12px;margin-top:8px">Dreipunktschätzung (PERT): (O + 4·M + P) ÷ 6.</div></div>';
    return h;
  }
  async function copyRich(html, text) {
    try { if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]); return A.toast('📋 Kopiert – in Outlook oder Teams einfügen'); } } catch (e) {}
    const d = document.createElement('div'); d.contentEditable = 'true'; d.innerHTML = html; Object.assign(d.style, { position: 'fixed', left: '-9999px', background: '#fff' }); document.body.appendChild(d);
    const rg = document.createRange(); rg.selectNodeContents(d); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} sel.removeAllRanges(); d.remove();
    if (ok) A.toast('📋 Kopiert – in Outlook oder Teams einfügen'); else A.copyText(text);
  }
  function exportXlsx(es) {
    if (!window.XLSX) return A.toast('Excel-Modul nicht geladen');
    const r = C.calcEstimate(es), u = es.unit, R = x => Math.round(C.num(x) * 100) / 100;
    const AO = [['Schätzung', es.title], ['Projekt', projName(es.pid)], ['Stand', C.fmtD(es.date)], ['Status', C.EST_STATUS[es.status]], ['Quelle', es.source], ['Einheit', u], [], ['Nr.', 'Aufgabe', 'Beschreibung', 'Story', 'Optimistisch', 'Wahrscheinlich', 'Pessimistisch', 'Erwartet']];
    es.tasks.forEach((t, i) => AO.push([i + 1, t.n, t.d, storyNo(es, t.sid), R(t.o), R(t.m), R(t.p), R(C.tE(t))]));
    AO.push([], ['', 'Summe Aufgaben', '', '', '', '', '', R(r.base)]); r.ex.forEach(e => AO.push(['', e.x.n, '', '', '', '', '', R(e.amt)])); AO.push(['', 'Gesamt (Erwartungswert)', '', '', '', '', '', R(r.total)], ['', 'Mit 85 % Sicherheit', '', '', '', '', '', R(r.p85)]);
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(AO); ws['!cols'] = [{ wch: 5 }, { wch: 34 }, { wch: 50 }, { wch: 7 }, { wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Aufgaben');
    if (es.stories.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nr.', 'User Story', 'Akzeptanzkriterien', 'Priorität']].concat(es.stories.map((s, i) => ['US' + (i + 1), C.storyText(s), s.ac.join('\n'), C.PRIO[s.prio]]))), 'Anforderungen');
    XLSX.writeFile(wb, ('Schaetzung-' + es.title).replace(/[^\wäöüÄÖÜß-]+/g, '-').slice(0, 60) + '.xlsx');
  }
  function reuseSheet() {
    const es = cur(); let mode = 'lib', src = '', q = '', items = [];
    const others = S().estimates.filter(x => x.id !== es.id).sort((a, b) => b.updated - a.updated);
    const draw = () => {
      items = [];
      if (mode === 'lib') { S().lib.stories.forEach(s => items.push({ k: 's', s, txt: C.storyText(s) })); S().lib.tasks.forEach(t => items.push({ k: 't', t, unit: t.unit, txt: t.n, sub: t.d })); }
      else if (src) { const e = S().estimates.find(x => x.id === src); e.stories.forEach((s, i) => items.push({ k: 's', s, txt: 'US' + (i + 1) + ': ' + C.storyText(s) })); e.tasks.forEach(t => items.push({ k: 't', t, unit: e.unit, txt: t.n || 'ohne Namen', sub: t.d })); }
      const qq = C.normTxt(q); if (qq) items = items.filter(it => C.normTxt(it.txt + ' ' + (it.sub || '')).includes(qq));
      $('ruL').innerHTML = items.length ? items.map((it, i) => '<label class="pick"><input type="checkbox" data-i="' + i + '"><div>' + (it.k === 's' ? '📝 ' : '🔧 ') + esc(it.txt) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</div>' + (it.k === 't' ? '<b>' + f1(C.conv(C.tE(it.t), it.unit, es.unit)) + ' ' + esc(short(es.unit)) + '</b>' : '') + '</label>').join('') : '<div class="help" style="padding:10px 0">' + (mode === 'lib' ? 'Die Bibliothek ist leer. Aufgaben mit ⭐ ablegen.' : src ? 'Keine Einträge.' : 'Schätzung wählen.') + '</div>';
    };
    A.sheet('<h4>📚 Wiederverwenden</h4><div class="chips" id="ruM" style="margin-bottom:10px"><button data-m="lib" class="on">⭐ Bibliothek</button><button data-m="old">🗂 Frühere Schätzung</button></div><div id="ruSW" style="display:none;margin-bottom:8px"><select id="ruS"><option value="">Schätzung wählen …</option>' + others.map(x => '<option value="' + x.id + '">' + esc(projName(x.pid) + ' › ' + x.title) + '</option>').join('') + '</select></div>' +
      '<input id="ruQ" placeholder="🔎 Filtern …"><div id="ruL" style="margin-top:6px"></div><div class="acts"><button class="btn sec" id="ruC">Abbrechen</button><button class="btn" id="ruOk">Übernehmen</button></div>', () => {
      $('ruM').querySelectorAll('button').forEach(b => b.onclick = () => { mode = b.dataset.m; $('ruM').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('ruSW').style.display = mode === 'old' ? '' : 'none'; draw(); });
      $('ruS').onchange = e => { src = e.target.value; draw(); }; $('ruQ').oninput = e => { q = e.target.value; draw(); }; $('ruC').onclick = A.closeSheet;
      $('ruOk').onclick = () => {
        const ch = [...$('ruL').querySelectorAll('input:checked')].map(c => items[+c.dataset.i]); if (!ch.length) return A.toast('Nichts ausgewählt');
        const map = {};
        ch.filter(x => x.k === 's').forEach(x => { const n = { id: C.uid(), role: x.s.role, want: x.s.want, benefit: x.s.benefit, ac: (x.s.ac || []).slice(), prio: x.s.prio || 'must' }; map[x.s.id] = n.id; es.stories.push(n); });
        ch.filter(x => x.k === 't').forEach(x => es.tasks.push({ id: C.uid(), n: x.t.n, d: x.t.d || '', sid: mode === 'old' ? map[x.t.sid] || '' : '', o: C.conv(x.t.o, x.unit, es.unit), m: C.conv(x.t.m, x.unit, es.unit), p: C.conv(x.t.p, x.unit, es.unit) }));
        touchE(es); A.closeSheet(); A.estimateEditor(); A.toast('Übernommen: ' + ch.length + ' Einträge');
      };
      draw();
    });
  }
  function libSheet() {
    const L = S().lib;
    A.sheet('<h4>📚 Bibliothek</h4><h3>Aufgaben (' + L.tasks.length + ')</h3>' + (L.tasks.length ? L.tasks.map(t => '<div class="pick"><div><b>' + esc(t.n) + '</b>' + (t.d ? '<small>' + esc(t.d) + '</small>' : '') + '</div><span>' + [t.o, t.m, t.p].map(f1).join(' / ') + ' ' + esc(short(t.unit)) + '</span><button class="x" data-lt="' + t.id + '">✕</button></div>').join('') : '<div class="help">Leer. In einer Schätzung bei einer Aufgabe auf ⭐ klicken.</div>') +
      '<h3 style="margin-top:12px">Stories (' + L.stories.length + ')</h3>' + (L.stories.length ? L.stories.map(s => '<div class="pick"><div>' + esc(C.storyText(s)) + '</div><button class="x" data-ls="' + s.id + '">✕</button></div>').join('') : '<div class="help">Leer.</div>') +
      '<div class="acts"><button class="btn" id="lbC">Schließen</button></div>', () => {
      $('lbC').onclick = A.closeSheet;
      $('sheet').querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { L.tasks = L.tasks.filter(t => t.id !== b.dataset.lt); A.commit(); libSheet(); });
      $('sheet').querySelectorAll('[data-ls]').forEach(b => b.onclick = () => { L.stories = L.stories.filter(t => t.id !== b.dataset.ls); A.commit(); libSheet(); });
    });
  }

  // ================= Werkzeuge =================
  A.toolsView = () => {
    const T = S().tools, cap = T.cap, fc = T.fc, n = C.num;
    $('view').innerHTML = '<h2>Werkzeuge</h2><div class="grid"><div class="panel"><h3>👥 Kapazität (Sprint / Zeitraum)</h3><div class="row"><label class="f"><span>Arbeitstage</span><input id="cD" inputmode="decimal" value="' + esc(cap.days) + '"></label><label class="f"><span>Fokusfaktor %</span><input id="cF" inputmode="decimal" value="' + esc(cap.focus) + '"></label></div>' +
      '<div id="cM"></div><button class="btn sec wide" id="cAdd">＋ Person</button><div id="cOut" style="margin-top:12px"></div></div>' +
      '<div class="panel"><h3>📈 Release-Prognose</h3><div class="row"><label class="f"><span>Offene Story Points</span><input id="fB" inputmode="decimal" value="' + esc(fc.backlog) + '"></label><label class="f"><span>Sprintlänge (Wochen)</span><input id="fW" inputmode="decimal" value="' + esc(fc.weeks) + '"></label></div><div class="row"><label class="f"><span>Start</span><input type="date" id="fS" value="' + esc(fc.start) + '"></label><label class="f"><span>Scope-Wachstum %/Sprint</span><input id="fG" inputmode="decimal" value="' + esc(fc.growth) + '"></label></div>' +
      '<label class="f"><span>Velocity der letzten Sprints (mit Komma oder Leerzeichen getrennt)</span><input id="fV" value="' + esc(fc.velos.join(', ')) + '"></label><div id="fOut" style="margin-top:12px"></div></div></div>';
    const mem = () => { $('cM').innerHTML = cap.members.map((m, i) => '<div class="row" data-i="' + i + '"><label class="f" style="flex:2"><span>Name</span><input data-k="n" value="' + esc(m.n) + '"></label><label class="f"><span>Verfügb. %</span><input data-k="av" inputmode="decimal" value="' + esc(m.av) + '"></label><label class="f"><span>Abwesend (T)</span><input data-k="off" inputmode="decimal" value="' + esc(m.off) + '"></label><button class="x" data-x>✕</button></div>').join('');
      $('cM').querySelectorAll('.row').forEach(r => { const m = cap.members[+r.dataset.i]; r.querySelectorAll('input').forEach(i => i.oninput = () => { m[i.dataset.k] = i.value; A.commit(); calcCap(); }); r.querySelector('[data-x]').onclick = () => { cap.members.splice(+r.dataset.i, 1); A.commit(); mem(); calcCap(); }; }); };
    const calcCap = () => { const d = n(cap.days), net = cap.members.reduce((a, m) => a + Math.max(0, d * n(m.av) / 100 - n(m.off)), 0), eff = net * n(cap.focus) / 100;
      $('cOut').innerHTML = '<div class="res"><div class="hl"><b>' + f1(eff) + ' PT</b><span>Fokus-Kapazität</span></div><div><b>' + f1(cap.members.length * d) + '</b><span>brutto</span></div><div><b>' + f1(net) + '</b><span>netto</span></div></div>'; };
    const calcFc = () => {
      const vs = fc.velos.map(n).filter(x => x > 0), back = n(fc.backlog), g = n(fc.growth), wk = Math.max(.5, n(fc.weeks));
      if (!vs.length || back <= 0) { $('fOut').innerHTML = '<div class="help">Backlog und mindestens eine Velocity eintragen.</div>'; return; }
      const need = v => { if (v <= 0 || back * g / 100 >= v) return Infinity; let r = back, k = 0; while (r > 0 && k < 200) { r = r - v + back * g / 100; k++; } return k; };
      const avg = vs.reduce((a, b) => a + b, 0) / vs.length, st = fc.start ? new Date(fc.start + 'T12:00:00') : new Date();
      const dt = k => isFinite(k) ? new Date(st.getTime() + k * wk * 7 * 864e5).toLocaleDateString('de-DE') : 'nie';
      $('fOut').innerHTML = '<div class="res"><div class="hl"><b>' + dt(need(avg)) + '</b><span>wahrscheinlich (Ø ' + f1(avg) + ' SP, ' + need(avg) + ' Sprints)</span></div><div><b>' + dt(need(Math.max(...vs))) + '</b><span>optimistisch</span></div><div><b>' + dt(need(Math.min(...vs))) + '</b><span>pessimistisch</span></div></div>';
    };
    [['cD', 'days'], ['cF', 'focus']].forEach(([id, k]) => $(id).oninput = e => { cap[k] = e.target.value; A.commit(); calcCap(); });
    [['fB', 'backlog'], ['fW', 'weeks'], ['fS', 'start'], ['fG', 'growth']].forEach(([id, k]) => $(id).oninput = e => { fc[k] = e.target.value; A.commit(); calcFc(); });
    $('fV').oninput = e => { fc.velos = e.target.value.split(/[;\s,]+/).filter(Boolean).map(x => C.num(x)); A.commit(); calcFc(); };
    $('cAdd').onclick = () => { cap.members.push({ n: 'Person ' + (cap.members.length + 1), av: 100, off: 0 }); A.commit(); mem(); calcCap(); };
    mem(); calcCap(); calcFc();
  };

  // ================= Daten: Backup, Wiederherstellen, Import =================
  const stamp = () => { const d = new Date(), p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()); };
  A.doBackup = async (forceDownload) => {
    await A.flush();
    const s = S(), name = 'projekt-cockpit-backup_' + stamp() + '.json';
    const finish = how => { s.meta.lastBackup = new Date().toISOString(); A.commit(); s.meta.changes = 0; A.headerState(); A.toast('💾 Backup gespeichert' + how); if (UI.view === 'data' || UI.view === 'home') A.render(); };
    const text = JSON.stringify(C.makeBackup(s), null, 1);
    if (!forceDownload && ST.canFolder()) {
      const dir = await ST.getDir();
      if (dir) { try { await ST.writeToDir(dir, name, text); return finish(' im Ordner „' + dir.name + '“'); } catch (e) { A.toast('Ordner nicht beschreibbar, lade stattdessen herunter'); } }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    finish(' (Download: ' + name + ')');
  };
  A.storageInfo = async () => {
    const e = await ST.estimate(), s = ST.status;
    A.sheet('<h4>🔒 Wo liegen meine Daten?</h4><p class="help" style="font-size:14px">Ausschließlich in <b>diesem Browser auf diesem Gerät</b>. Die App schickt nichts ins Internet, es gibt keinen Server und keinen Sync. Die Anwendung selbst darf aus Git (GitHub Pages) kommen – die Daten bleiben trotzdem lokal.</p>' +
      '<div class="kv" style="margin:10px 0"><span>Hauptspeicher</span><div>' + (s.idb ? '✅ IndexedDB' : '⚠️ nicht verfügbar') + '</div><span>Sicherheitskopie</span><div>' + (s.mirror ? '✅ localStorage' : '⚠️ zu groß für localStorage') + '</div><span>Dauerhaft geschützt</span><div>' + (s.persisted ? '✅ ja (Browser räumt nicht automatisch auf)' : s.persisted === false ? '⚠️ nein (Browser darf bei Platzmangel löschen)' : 'unbekannt') + '</div>' +
      (e ? '<span>Belegt</span><div>' + f1((e.usage || 0) / 1048576) + ' MB</div>' : '') + '<span>Adresse</span><div style="word-break:break-all">' + esc(location.origin + location.pathname) + '</div></div>' +
      '<div class="note y">Daten gehen verloren, wenn du die Browserdaten löschst, den Browser wechselst oder die App unter einer anderen Adresse öffnest (z. B. einmal online, einmal als lokale Datei). Deshalb: regelmäßig 💾 Backup.</div><div class="acts"><button class="btn" id="siC">Verstanden</button></div>', () => { $('siC').onclick = A.closeSheet; });
  };
  A.dataView = async () => {
    const s = S(), snaps = await ST.snapshots(), dir = ST.canFolder() ? await ST.getDir() : null, li = s.meta.lastImport;
    $('view').innerHTML = '<h2>Daten</h2><div class="grid">' +
      '<div class="panel"><h3>💾 Backup</h3><div class="help">Letztes Backup: <b>' + (s.meta.lastBackup ? A.fdt(s.meta.lastBackup) : 'noch keins') + '</b>' + (s.meta.changes ? ' · seitdem ' + s.meta.changes + ' Änderungen' : '') + '</div>' +
      '<div class="bar"><button class="btn" id="dBk">💾 Backup jetzt</button>' + (ST.canFolder() ? '<button class="btn sec" id="dDir">' + (dir ? '📁 Ordner: ' + esc(dir.name) : '📁 Backup-Ordner festlegen') + '</button>' : '') + '</div>' +
      (ST.canFolder() ? '<div class="help">' + (dir ? 'Backups landen direkt in diesem Ordner, z. B. in OneDrive oder auf einem Netzlaufwerk. ' : 'Mit einem festen Ordner speichert ein Klick direkt dorthin, ohne Download-Dialog. ') + '</div>' + (dir ? '<button class="sm" id="dDirX">Ordner lösen</button> <button class="sm" id="dDl">Stattdessen herunterladen</button>' : '') : '<div class="help">Backups werden als Datei heruntergeladen (Ordner „Downloads“).</div>') +
      '<h3 style="margin-top:14px">📂 Wiederherstellen</h3><div class="help">Ersetzt den aktuellen Stand durch ein Backup. Vorher wird automatisch eine interne Version angelegt.</div><button class="btn sec" id="dRs">📂 Backup-Datei einspielen</button></div>' +
      '<div class="panel"><h3>📥 weclapp-Import</h3><div class="help">Projektliste aus weclapp als Excel oder CSV. Neue Projekte werden angelegt, bestehende aktualisiert. <b>Deine eigenen Angaben (Ampel, nächster Schritt, Aufgaben, Notizen, Schätzungen, Risiken) bleiben immer erhalten.</b> Projekte, die nicht mehr im Export sind, werden nur markiert, nie gelöscht.</div>' +
      (li ? '<div class="note">Letzter Import: ' + esc(li.file || '') + ' · ' + A.fdt(li.at) + '<br>' + li.created + ' neu · ' + li.updated + ' geändert · ' + li.unchanged + ' unverändert · ' + li.missing + ' nicht mehr enthalten</div>' : '') +
      '<button class="btn" id="dIm">📥 Export-Datei wählen</button>' + (App.legacyAvailable() ? '<h3 style="margin-top:14px">🔁 Bisherige Apps</h3><div class="help">Projekte aus „Projekt-Radar“ und Schätzungen aus dem „PM-Rechner“ übernehmen (auch mehrfach ohne Doppelte).</div><button class="btn sec" id="dLg">🔁 Übernehmen</button>' : '') + '</div>' +
      '<div class="panel"><h3>🕒 Interne Versionen<span class="sp"></span><span class="cnt">' + snaps.length + '</span></h3><div class="help">Automatisch alle 30 Minuten und vor jedem Import, Löschen oder Wiederherstellen. Liegen im Browser – ersetzen also kein Backup.</div><div class="list" style="max-height:320px;overflow:auto">' +
      (snaps.length ? snaps.map(x => '<div class="it"><div class="t">' + esc(x.label) + '<small>' + A.fdt(x.at) + ' · ' + x.counts.projects + ' Projekte, ' + x.counts.estimates + ' Schätzungen</small></div><button class="sm" data-snap="' + x.at + '">Zurückholen</button></div>').join('') : '<div class="help">Noch keine.</div>') + '</div><button class="sm" id="dSn" style="margin-top:8px">Version jetzt anlegen</button></div>' +
      '<div class="panel"><h3>⚙️ Einstellungen</h3><div class="row"><label class="f"><span>Mein Name (wie in weclapp)</span><input id="sMe" value="' + esc(s.me) + '" placeholder="z. B. Max Muster"></label></div>' +
      '<div class="row"><label class="f"><span>Max. aktive Projekte</span><input id="sWip" inputmode="numeric" value="' + s.settings.wip + '"></label><label class="f"><span>Ohne Update nach (Tagen)</span><input id="sSt" inputmode="numeric" value="' + s.settings.stale + '"></label></div>' +
      '<div class="row"><label class="f"><span>Budget gelb ab %</span><input id="sBy" inputmode="numeric" value="' + s.settings.budgetY + '"></label><label class="f"><span>Budget rot über %</span><input id="sBr" inputmode="numeric" value="' + s.settings.budgetR + '"></label></div>' +
      '<div class="row"><label class="f"><span>„Aktuelles“ veraltet nach (Tagen)</span><input id="sAk" inputmode="numeric" value="' + s.settings.aktStale + '"></label><label class="f"><span>Backup-Erinnerung nach (Tagen)</span><input id="sBd" inputmode="numeric" value="' + s.settings.backupDays + '"></label></div>' +
      '<label class="f"><span>Phasen/Status, die „fertig“ bedeuten</span><input id="sDn" value="' + esc(s.settings.done) + '"></label></div>' +
      '<div class="panel"><h3>🧯 Gefahrenzone</h3><button class="btn red" id="dWipe">Alle Daten löschen</button><div class="help" style="margin-top:8px">Vorher wird eine interne Version angelegt.</div></div></div>';
    $('dBk').onclick = () => A.doBackup();
    if ($('dDir')) $('dDir').onclick = async () => { try { const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'projekt-cockpit' }); await ST.setDir(h); A.toast('📁 Backups gehen jetzt nach „' + h.name + '“'); A.dataView(); } catch (e) { if (e.name !== 'AbortError') A.toast('Ordner konnte nicht gewählt werden'); } };
    if ($('dDirX')) $('dDirX').onclick = async () => { await ST.setDir(null); A.dataView(); };
    if ($('dDl')) $('dDl').onclick = () => A.doBackup(true);
    $('dRs').onclick = () => $('fileRestore').click(); $('dIm').onclick = () => $('fileImport').click();
    if ($('dLg')) $('dLg').onclick = () => App.migrateLegacy();
    $('dSn').onclick = async () => { await A.snapshot('manuell', 'Manuell angelegt'); A.toast('🕒 Version angelegt'); A.dataView(); };
    $('view').querySelectorAll('[data-snap]').forEach(b => b.onclick = async () => {
      const x = snaps.find(y => String(y.at) === b.dataset.snap);
      if (!confirm('Stand vom ' + A.fdt(x.at) + ' („' + x.label + '“) zurückholen? Der jetzige Stand wird vorher als Version gesichert.')) return;
      await A.replaceState(x.data, 'Zurückholen einer Version'); A.toast('🕒 Version vom ' + A.fdt(x.at) + ' wiederhergestellt');
    });
    const setNum = (id, k, min) => $(id).onchange = e => { s.settings[k] = Math.max(min, parseInt(e.target.value) || C.DEFAULT_SETTINGS[k]); A.commit(); };
    setNum('sWip', 'wip', 1); setNum('sSt', 'stale', 1); setNum('sBy', 'budgetY', 1); setNum('sBr', 'budgetR', 1); setNum('sAk', 'aktStale', 1); setNum('sBd', 'backupDays', 1);
    $('sMe').onchange = e => { s.me = e.target.value.trim(); A.commit(); }; $('sDn').onchange = e => { s.settings.done = e.target.value; A.commit(); };
    $('dWipe').onclick = async () => { if (!confirm('Wirklich ALLE Projekte, Schätzungen und Einstellungen löschen?') || !confirm('Letzte Rückfrage: löschen?')) return; await A.replaceState(C.empty(), 'Alles löschen'); A.toast('Alles gelöscht – über „Interne Versionen“ zurückholbar'); A.go('home'); };
  };

  // ---------- Wiederherstellen ----------
  $('fileRestore').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const v = C.validateBackup(await f.text());
    if (!v.ok) return A.sheet('<h4>Backup nicht lesbar</h4><div class="note r">' + esc(v.err) + '</div><div class="acts"><button class="btn" id="vX">OK</button></div>', () => { $('vX').onclick = A.closeSheet; });
    const now = C.counts(S());
    A.sheet('<h4>📂 Backup einspielen?</h4><div class="kv"><span>Datei</span><div>' + esc(f.name) + '</div><span>Erstellt</span><div>' + A.fdt(v.exportedAt) + '</div><span>Inhalt</span><div>' + v.counts.projects + ' Projekte, ' + v.counts.tasks + ' Aufgaben, ' + v.counts.estimates + ' Schätzungen</div><span>Aktuell</span><div>' + now.projects + ' Projekte, ' + now.tasks + ' Aufgaben, ' + now.estimates + ' Schätzungen</div></div>' +
      '<div class="note y" style="margin-top:10px">Der aktuelle Stand wird ersetzt. Er wird vorher als interne Version gesichert und lässt sich zurückholen.</div><div class="acts"><button class="btn sec" id="rsC">Abbrechen</button><button class="btn" id="rsOk">Einspielen</button></div>', () => {
      $('rsC').onclick = A.closeSheet;
      $('rsOk').onclick = async () => { A.closeSheet(); await A.replaceState(v.data, 'Wiederherstellen aus Datei'); A.toast('📂 Backup eingespielt'); A.go('home'); };
    });
  };

  // ---------- weclapp-Import ----------
  async function readRaw(f) {
    const buf = await f.arrayBuffer();
    if (/\.(xlsx|xls)$/i.test(f.name)) { if (!window.XLSX) throw new Error('Excel-Modul nicht geladen'); const wb = XLSX.read(buf, { type: 'array', cellDates: false }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }); }
    return C.parseCSV(C.decode(buf));
  }
  $('fileImport').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    let raw; try { raw = await readRaw(f); } catch (err) { return A.toast('Datei nicht lesbar: ' + err.message); }
    const t = C.readTable(raw, S().meta.colMap);
    if (!t.ok) return A.sheet('<h4>Import nicht möglich</h4><div class="note r">' + esc(t.err) + '</div><div class="acts"><button class="btn" id="iX">OK</button></div>', () => { $('iX').onclick = A.closeSheet; });
    importSheet(raw, t, f.name);
  };
  function importSheet(raw, t, file) {
    const rows = C.buildRows(raw, t.hi, t.cols), plan = C.planImport(S(), rows);
    const nm = id => { const p = A.byId(id); return p ? esc(p.name) : id; };
    const ch = plan.updates.filter(u => u.changes.length);
    A.sheet('<h4>📥 Import: ' + esc(file) + '</h4><div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))"><div class="kpi"><b>' + plan.creates.length + '</b><span>neu</span></div><div class="kpi"><b>' + ch.length + '</b><span>geändert</span></div><div class="kpi"><b>' + plan.unchanged.length + '</b><span>unverändert</span></div><div class="kpi"><b>' + plan.missing.length + '</b><span>nicht mehr im Export</span></div></div>' +
      '<div class="note g">🛡 Deine eigenen Angaben bleiben vollständig erhalten. Nichts wird gelöscht. Vorher wird eine interne Version angelegt.</div>' +
      (t.missing.length ? '<div class="note y">Nicht gefundene Spalten: ' + esc(t.missing.join(', ')) + '</div>' : '') + (plan.dupes.length ? '<div class="note y">Doppelte Auftragsnummern im Export (nur erste übernommen): ' + esc(plan.dupes.join(', ')) + '</div>' : '') +
      (plan.creates.length ? '<details><summary>Neu (' + plan.creates.length + ')</summary><div class="list">' + plan.creates.map(r => '<div class="it"><div class="t">' + esc(C.wcName(r)) + '<small>' + esc(r.nr) + ' · ' + esc(r.phase) + '</small></div></div>').join('') + '</div></details>' : '') +
      (ch.length ? '<details><summary>Geändert (' + ch.length + ')</summary><div class="list">' + ch.map(u => '<div class="it"><div class="t">' + nm(u.pid) + '<small>' + u.changes.map(c => esc(C.WC_LABEL[c.k]) + (c.k === 'akt' ? ' aktualisiert' : ': ' + esc(String(c.from) || '–') + ' → ' + esc(String(c.to) || '–'))).join(' · ') + '</small></div></div>').join('') + '</div></details>' : '') +
      (plan.missing.length ? '<details><summary>Nicht mehr im Export (' + plan.missing.length + ') – bleiben erhalten</summary><div class="list">' + plan.missing.map(id => '<div class="it"><div class="t">' + nm(id) + '</div></div>').join('') + '</div></details>' : '') +
      '<details><summary>Spaltenzuordnung prüfen</summary><div class="help">Zeile ' + (t.hi + 1) + ' ist die Kopfzeile.</div>' + C.FIELDS.map(fd => '<div class="row" style="margin-bottom:4px"><span style="flex:1;font-size:13px">' + esc(fd.l) + '</span><select data-col="' + fd.k + '" style="flex:1"><option value="">– keine –</option>' + t.header.map((h, i) => '<option value="' + i + '"' + (t.cols[fd.k] === i ? ' selected' : '') + '>' + esc(h || '(leer)') + '</option>').join('') + '</select></div>').join('') + '</details>' +
      '<div class="acts"><button class="btn sec" id="imC">Abbrechen</button><button class="btn" id="imOk">Übernehmen</button></div>', () => {
      $('imC').onclick = A.closeSheet;
      $('sheet').querySelectorAll('[data-col]').forEach(sel => sel.onchange = () => { if (sel.value === '') delete t.cols[sel.dataset.col]; else t.cols[sel.dataset.col] = +sel.value; importSheet(raw, t, file); $('sheet').querySelectorAll('details').forEach(d => { if (d.querySelector('[data-col]')) d.open = true; }); });
      $('imOk').onclick = async () => {
        $('imOk').disabled = true;
        await A.snapshot('vor Import', 'Vor Import: ' + file);
        const res = C.applyImport(S(), plan, { file, today: today() });
        C.FIELDS.forEach(fd => { if (t.cols[fd.k] !== undefined) S().meta.colMap[fd.k] = C.normH(t.header[t.cols[fd.k]]); });
        if (!S().me) { const cnt = {}; rows.forEach(r => { if (r.pl) cnt[r.pl] = (cnt[r.pl] || 0) + 1; }); const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; if (top) S().me = top[0]; }
        A.commit(); await A.flush(); A.closeSheet(); A.go('projects', { show: 'active' });
        const snaps = await ST.snapshots(), before = snaps.find(x => x.kind === 'vor Import');
        const msg = '📥 ' + res.created + ' neu, ' + res.updated + ' geändert, ' + res.missing + ' nicht mehr im Export';
        if (before) A.toast(msg, 'Rückgängig', async () => { await A.replaceState(before.data, 'Rückgängig: Import'); A.toast('Import rückgängig gemacht'); }); else A.toast(msg);
      };
    });
  }

  // ---------- Übernahme aus Projekt-Radar / PM-Rechner ----------
  const readLS = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  App.legacyAvailable = () => { const r = readLS('projektRadar.v1'), p = readLS('pmRechner.v1'); return !!((r && r.projects && r.projects.length) || (p && p.est && p.est.estimates && p.est.estimates.length)); };
  App.migrateLegacy = async () => {
    const { state, rep } = C.migrateFromApps(JSON.parse(JSON.stringify(S())), readLS('projektRadar.v1'), readLS('pmRechner.v1'), today());
    if (!rep.projects && !rep.estimates && !rep.lib && !rep.ideas) return A.toast('Nichts Neues zu übernehmen');
    await A.replaceState(state, 'Übernahme aus bisherigen Apps');
    A.toast('🔁 Übernommen: ' + rep.projects + ' Projekte, ' + rep.estimates + ' Schätzungen, ' + rep.lib + ' Bibliothekseinträge');
  };
})();
