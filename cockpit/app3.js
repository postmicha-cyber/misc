/* Projekt-Cockpit: Oberfläche (Teil 3: Kunden, Backlog & Team-Planung, Bericht, Kundenliste). */
(() => {
  'use strict';
  const A = window.App, C = A.C, $ = A.$, esc = A.esc, f1 = A.f1, f0 = A.f0, today = A.today;
  const S = () => A.S(), UI = A.UI;
  const saveUI = () => { try { localStorage.setItem('projektCockpit.ui', JSON.stringify(UI)); } catch (e) {} };
  const HEALTH = { r: ['Kritisch', 'var(--r)'], y: ['Beobachten', 'var(--y)'], g: ['Gut', 'var(--g)'], n: ['Ohne aktive Projekte', 'var(--n)'] };
  const MOOD = { g: '😊 Zufrieden', y: '😐 Neutral', r: '☹️ Unzufrieden' };
  const pt = h => f1(h / 8) + ' PT';
  // Druckansicht in neuem Fenster (Drucken oder als PDF speichern)
  function printHTML(title, html) {
    const w = window.open('', '_blank'); if (!w) return A.toast('Pop-up blockiert');
    w.document.write('<!doctype html><html lang="de"><head><meta charset="utf-8"><title>' + esc(title) + '</title></head><body style="margin:24px">' + html + '<script>setTimeout(()=>print(),300)<\/script></body></html>'); w.document.close();
  }
  A.printHTML = printHTML;
  // Dateiname ohne Umlaute und Sonderzeichen (manche Browser verwerfen ihn sonst)
  const fileName = t => t.replace(/[äöüÄÖÜß]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' })[c]).replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'Export';
  const kundenNamen = () => C.customers(S(), today()).map(c => c.n);

  // ================= Kunden (Key Account) =================
  A.customersView = () => {
    const q = C.normTxt(UI.cuQ || ''), L = C.customers(S(), today()).filter(c => !q || C.normTxt(c.n).includes(q));
    const tot = { r: L.filter(c => c.health === 'r').length, y: L.filter(c => c.health === 'y').length, ch: L.reduce((a, c) => a + c.chances.length, 0), w: L.reduce((a, c) => a + c.weightedHours, 0) };
    let h = '<div class="ph"><div><h2>Kunden</h2><p class="sub">Key-Account-Sicht: Zustand je Kunde über Projekte, Budget, Chancen und offene Themen.</p></div><span class="sp"></span></div>' +
      '<div class="kpis"><div class="kpi"><b>' + L.length + '</b><span>Kunden</span></div><div class="kpi"><b style="color:var(--r)">' + tot.r + '</b><span>kritisch</span></div><div class="kpi"><b style="color:var(--y)">' + tot.y + '</b><span>beobachten</span></div><div class="kpi"><b>' + tot.ch + '</b><span>offene Chancen</span></div><div class="kpi"><b>' + pt(tot.w) + '</b><span>Chancen gewichtet</span></div></div>' +
      '<div class="panel"><input id="cuQ" value="' + esc(UI.cuQ || '') + '" placeholder="🔎 Kunde suchen …"></div>';
    h += L.length ? '<div class="grid">' + L.map(c => '<button class="ccard" data-cu="' + esc(c.key) + '" style="--hc:' + HEALTH[c.health][1] + '"><div class="h"><b>' + esc(c.n) + '</b><span class="hl">' + HEALTH[c.health][0] + '</span></div>' +
      '<div class="cm"><span><b>' + c.active.length + '</b> aktiv</span>' + (c.sev.r ? '<span class="tag r">' + c.sev.r + ' rot</span>' : '') + (c.sev.y ? '<span class="tag y">' + c.sev.y + ' gelb</span>' : '') + (c.rec && c.rec.mood ? '<span>' + MOOD[c.rec.mood].split(' ')[0] + '</span>' : '') + '</div>' +
      (c.budget.count ? '<div class="bl"><span>Restbudget <b>' + f0(c.budget.rest) + ' h</b> · ' + f0(c.budget.restPct) + ' %</span></div><div class="meter"><i style="width:' + Math.min(100, Math.max(0, c.budget.pct)) + '%"></i></div>' : '') +
      '<div class="cm muted">' + [c.chances.length ? '🎯 ' + c.chances.length + ' Chance(n) · ' + pt(c.chanceHours) : '', c.backlogOpen ? '🗂 ' + c.backlogOpen + ' Themen' : '', c.last ? 'zuletzt ' + C.fmtD(c.last) : ''].filter(Boolean).join(' · ') + '</div></button>').join('') + '</div>'
      : '<div class="empty"><div class="e">🏢</div>Noch keine Kunden. Sie entstehen automatisch aus Projekten (Feld „Kunde“), Chancen und Backlog-Themen.</div>';
    $('view').innerHTML = h;
    const qi = $('cuQ'); qi.oninput = () => { UI.cuQ = qi.value; saveUI(); const p = qi.selectionStart; A.customersView(); const n = $('cuQ'); n.focus(); n.setSelectionRange(p, p); };
    $('view').querySelectorAll('[data-cu]').forEach(b => b.onclick = () => A.go('customer', { cid: b.dataset.cu }));
  };
  A.customerView = () => {
    const c = C.customers(S(), today()).find(x => x.key === UI.cid); if (!c) return A.go('customers');
    const rec = c.rec || { n: c.n, notes: '', contact: '', mood: '' }, ensure = () => c.rec || (c.rec = C.customerRec(S(), c.n));
    const proj = c.projects.filter(p => !p.archived).sort((a, b) => (C.isActive(b) - C.isActive(a)) || a.name.localeCompare(b.name));
    const bl = C.blSort(c.backlog.filter(x => x.slot !== 'done'));
    let h = '<div class="bar"><button class="sm" id="cuBack">‹ Kunden</button></div><div class="ph"><div><h2>🏢 ' + esc(c.n) + ' <span class="tag" style="border-color:' + HEALTH[c.health][1] + ';color:' + HEALTH[c.health][1] + '">' + HEALTH[c.health][0] + '</span></h2></div><span class="sp"></span>' +
      '<button class="sm" id="cuRep">📊 Bericht</button><button class="sm" id="cuList">📤 Projektliste für Kunden</button></div>' +
      '<div class="kpis"><div class="kpi"><b>' + c.active.length + '</b><span>aktive Projekte</span></div><div class="kpi"><b style="color:var(--r)">' + c.sev.r + '</b><span>rot</span></div><div class="kpi"><b style="color:var(--y)">' + c.sev.y + '</b><span>gelb</span></div>' +
      '<div class="kpi"><b>' + (c.budget.count ? f0(c.budget.rest) + ' h' : '–') + '</b><span>Restbudget</span></div><div class="kpi"><b>' + c.chances.length + '</b><span>Chancen · ' + pt(c.chanceHours) + '</span></div><div class="kpi"><b>' + c.backlogOpen + '</b><span>offene Themen</span></div></div>' +
      '<div class="cols"><div><div class="panel"><h3>📁 Projekte<span class="sp"></span><span class="cnt">' + proj.length + '</span></h3>' + (proj.length ? '<div class="grid g1">' + proj.map(A.card).join('') + '</div>' : '<div class="help">Keine Projekte.</div>') + '</div>' +
      '<div class="panel"><h3>🎯 Chancen & Angebote<span class="sp"></span><button class="sm" id="cuCh">＋ Chance</button></h3>' + (c.estimates.length ? '<div class="list">' + c.estimates.slice().sort((a, b) => b.updated - a.updated).map(e => { const r = C.calcEstimate(e); return '<div class="it" data-e="' + e.id + '" style="cursor:pointer"><span class="tag' + (C.isChance(e) ? ' new' : '') + '">' + (C.isChance(e) ? '🎯 Chance' : '📁 Auftrag') + '</span><div class="t"><b>' + esc(e.title) + '</b><small>' + C.EST_STATUS[e.status] + (e.prob !== '' ? ' · ' + e.prob + ' %' : '') + ' · 85 %: ' + f1(r.p85) + ' ' + esc(e.unit) + '</small></div></div>'; }).join('') + '</div>' : '<div class="help">Noch keine Schätzung oder Chance für diesen Kunden.</div>') + '</div></div>' +
      '<div><div class="panel"><h3>🤝 Beziehung</h3><div class="f" style="margin-bottom:10px"><span>Stimmung beim Kunden</span><div class="chips" id="cuM">' + Object.entries(MOOD).map(([k, v]) => '<button data-m="' + k + '" class="' + (rec.mood === k ? 'on' : '') + '">' + v + '</button>').join('') + '</div></div>' +
      '<label class="f" style="margin-bottom:10px"><span>Ansprechpartner</span><input id="cuC" value="' + esc(rec.contact) + '" placeholder="Name, Rolle, Telefon …"></label><label class="f"><span>Notizen (intern)</span><textarea id="cuN" rows="5" placeholder="Strategie, Themen, Termine …">' + esc(rec.notes) + '</textarea></label></div>' +
      '<div class="panel"><h3>🗂 Themen des Kunden<span class="sp"></span><span class="cnt">' + bl.length + '</span></h3><div class="row" style="margin-bottom:6px"><input id="cuB" placeholder="Neues Thema (Enter)"></div><div class="list">' + bl.map(it => '<div class="it" data-bl="' + it.id + '" style="cursor:pointer"><span class="tag">' + C.BL_SLOTS[it.slot] + '</span><div class="t">' + esc(it.t) + '<small>' + esc(C.blScopeLabel(S(), it)) + (it.who ? ' · ' + esc(it.who) : '') + '</small></div></div>').join('') + '</div></div></div></div>';
    $('view').innerHTML = h;
    A.wireCards($('view'));
    $('cuBack').onclick = () => A.go('customers');
    $('cuRep').onclick = () => { S().meta.reportCfg.scope = 'kunde:' + c.key; A.commit(); A.go('report'); };
    $('cuList').onclick = () => custListSheet(proj, 'Projektübersicht ' + c.n);
    $('cuCh').onclick = () => A.newEstimate('', c.n);
    $('cuM').querySelectorAll('button').forEach(b => b.onclick = () => { const r = ensure(); r.mood = r.mood === b.dataset.m ? '' : b.dataset.m; A.commit(); A.customerView(); });
    $('cuC').oninput = e => { ensure().contact = e.target.value; A.commit(); };
    $('cuN').oninput = e => { ensure().notes = e.target.value; A.commit(); };
    $('cuB').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { S().backlog.push(C.newBacklogItem({ t: e.target.value.trim(), scope: 'kunde', ref: c.n })); A.commit(); A.customerView(); $('cuB').focus(); } };
    $('view').querySelectorAll('[data-e]').forEach(el => el.onclick = () => A.go('estimate', { eid: el.dataset.e, back: { view: 'customer', cid: c.key } }));
    $('view').querySelectorAll('.it[data-bl]').forEach(el => el.onclick = () => itemSheet(S().backlog.find(x => x.id === el.dataset.bl), A.customerView));
  };

  // ================= Backlog & Team-Planung =================
  const COLS = [['', '📥 Backlog', 'Ideen und Wünsche, sortiert nach Wert ÷ Aufwand'], ['later', '🕰 Später', ''], ['next', '⏭ Als Nächstes', ''], ['now', '🔥 Jetzt', 'Woran das Team gerade arbeitet'], ['done', '✅ Erledigt', '']];
  const ORDER = COLS.map(c => c[0]);
  A.planView = () => {
    const st = S(), sc = UI.blScope || '', who = UI.blWho || '', q = C.normTxt(UI.blQ || '');
    const vis = st.backlog.filter(it => (!sc || it.scope === sc) && (!who || (who === '__none' ? !it.who : it.who === who)) && (!q || C.normTxt(it.t + ' ' + it.d + ' ' + C.blScopeLabel(st, it)).includes(q)));
    const people = [...new Set(st.team.map(x => x.n).concat(st.backlog.map(x => x.who)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    const load = C.teamLoad(st);
    let h = '<div class="ph"><div><h2>Backlog & Planung</h2><p class="sub">Themen für Produkt, Aufträge und Kunden sammeln, nach Wert ÷ Aufwand priorisieren und im Team planen: Jetzt · Als Nächstes · Später.</p></div><span class="sp"></span>' +
      '<button class="sm" id="tmBtn">👥 Team (' + st.team.length + ')</button><button class="sm" id="blShare">📋 „Jetzt“ teilen</button><button class="sm pri" id="blNew">＋ Thema</button></div>' +
      '<div class="panel"><div class="row" style="margin-bottom:8px"><label class="f" style="flex:2"><span>Schnell erfassen</span><input id="blIn" placeholder="Neues Thema ins Backlog (Enter)"></label><label class="f"><span>Suche</span><input id="blQ" value="' + esc(UI.blQ || '') + '" placeholder="Filtern …"></label>' +
      '<label class="f"><span>Person</span><select id="blW"><option value="">Alle</option><option value="__none"' + (who === '__none' ? ' selected' : '') + '>Ohne Zuständigkeit</option>' + people.map(n => '<option' + (who === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></label></div>' +
      '<div class="chips" id="blSc">' + [['', 'Alle'], ['prod', '📦 Produkt'], ['proj', '📁 Aufträge'], ['kunde', '🏢 Kunden']].map(([k, n]) => '<button data-sc="' + k + '" class="' + (sc === k ? 'on' : '') + '">' + n + ' ' + st.backlog.filter(x => !k || x.scope === k).filter(x => x.slot !== 'done').length + '</button>').join('') + '</div></div>';
    if (load.length) h += '<div class="load">' + load.map(l => '<button class="lp" data-lw="' + esc(l.who || '__none') + '">' + (l.who ? A.avatar(l.who, 'pl') + ' ' + esc(l.who) : '❔ Ohne Zuständigkeit') + '<small>' + l.n + ' im „Jetzt“' + (l.est ? ' · ' + f1(l.est) + ' PT' : '') + '</small></button>').join('') + '</div>';
    h += '<div class="board">' + COLS.map(([slot, name, hint]) => {
      let L = vis.filter(x => x.slot === slot); L = slot === '' ? C.blSort(L) : slot === 'done' ? L.sort((a, b) => b.doneAt.localeCompare(a.doneAt)).slice(0, 15) : L;
      return '<section class="bcol' + (slot === 'done' ? ' dn' : '') + '" data-slot="' + slot + '"><h3>' + name + '<span class="sp"></span><span class="cnt">' + vis.filter(x => x.slot === slot).length + '</span></h3>' + (hint ? '<div class="help">' + hint + '</div>' : '') +
        L.map(it => itemCard(st, it)).join('') + (L.length ? '' : '<div class="drop">Hierher ziehen</div>') + '</section>';
    }).join('') + '</div>';
    $('view').innerHTML = h;
    $('blNew').onclick = () => itemSheet(null, A.planView);
    $('tmBtn').onclick = teamSheet;
    $('blShare').onclick = () => { const L = st.backlog.filter(x => x.slot === 'now' && (!who || x.who === who)); if (!L.length) return A.toast('Im „Jetzt“ ist nichts geplant'); A.copyText(C.shareText(st, L, 'Unser Plan – Jetzt (' + C.fmtD(today()) + ')'), '📋 Plan kopiert – in Teams oder E-Mail einfügen'); };
    $('blIn').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { st.backlog.push(C.newBacklogItem({ t: e.target.value.trim(), scope: sc || 'prod', who: who && who !== '__none' ? who : '' })); A.commit(); A.planView(); $('blIn').focus(); } };
    const qi = $('blQ'); qi.oninput = () => { UI.blQ = qi.value; saveUI(); const p = qi.selectionStart; A.planView(); const n = $('blQ'); n.focus(); n.setSelectionRange(p, p); };
    $('blW').onchange = e => { UI.blWho = e.target.value; saveUI(); A.planView(); };
    $('blSc').querySelectorAll('button').forEach(b => b.onclick = () => { UI.blScope = b.dataset.sc; saveUI(); A.planView(); });
    $('view').querySelectorAll('[data-lw]').forEach(b => b.onclick = () => { UI.blWho = UI.blWho === b.dataset.lw ? '' : b.dataset.lw; saveUI(); A.planView(); });
    wireBoard();
  };
  function itemCard(st, it) {
    const dn = it.tasks.filter(t => t.done).length, i = ORDER.indexOf(it.slot);
    return '<article class="bi" draggable="true" data-bl="' + it.id + '" tabindex="0" aria-label="' + esc(it.t) + '"><div class="bt">' + esc(it.t) + '</div>' +
      '<div class="bm"><span class="tag sc-' + it.scope + '">' + esc(C.blScopeLabel(st, it)) + '</span><span class="tag" title="Wert ' + it.val + ' ÷ Aufwand ' + it.eff + '">⚡ ' + f1(C.blScore(it)) + '</span>' + (it.est !== '' ? '<span class="tag">' + f1(it.est) + ' PT</span>' : '') + (it.tasks.length ? '<span class="tag">☑ ' + dn + '/' + it.tasks.length + '</span>' : '') + '<span class="sp"></span>' + (it.who ? A.avatar(it.who, 'pl') : '') + '</div>' +
      '<div class="bn"><button class="x" data-mv="-1" aria-label="Nach links"' + (i <= 0 ? ' disabled' : '') + '>‹</button><button class="x" data-mv="1" aria-label="Nach rechts"' + (i >= ORDER.length - 1 ? ' disabled' : '') + '>›</button></div></article>';
  }
  // Ziehen & Ablegen, dazu ‹ › für Tastatur und Handy
  function wireBoard() {
    const st = S(), find = id => st.backlog.find(x => x.id === id);
    const move = (it, slot) => { if (it.slot === slot) return; C.moveItem(it, slot, today()); A.commit(); A.planView(); if (slot === 'done') A.toast('✅ „' + it.t + '“ erledigt'); };
    $('view').querySelectorAll('.bi').forEach(el => {
      const it = find(el.dataset.bl);
      el.onclick = e => { const mv = e.target.closest('[data-mv]'); if (mv) { e.stopPropagation(); const i = ORDER.indexOf(it.slot) + +mv.dataset.mv; if (i >= 0 && i < ORDER.length) move(it, ORDER[i]); return; } itemSheet(it, A.planView); };
      el.onkeydown = e => { if (e.target !== el) return; if (e.key === 'Enter') itemSheet(it, A.planView); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const i = ORDER.indexOf(it.slot) + (e.key === 'ArrowRight' ? 1 : -1); if (i >= 0 && i < ORDER.length) { move(it, ORDER[i]); const n = $('view').querySelector('.bi[data-bl="' + it.id + '"]'); if (n) n.focus(); } } };
      el.ondragstart = e => { e.dataTransfer.setData('text/plain', it.id); el.classList.add('drag'); };
      el.ondragend = () => el.classList.remove('drag');
    });
    $('view').querySelectorAll('.bcol').forEach(col => {
      col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
      col.ondragleave = () => col.classList.remove('over');
      col.ondrop = e => { e.preventDefault(); col.classList.remove('over'); const it = find(e.dataTransfer.getData('text/plain')); if (it) move(it, col.dataset.slot); };
    });
  }
  // Thema bearbeiten (Entwurf, erst „Speichern“ übernimmt)
  function itemSheet(it, after) {
    const st = S(), isNew = !it, w = JSON.parse(JSON.stringify(it || C.newBacklogItem({ scope: UI.blScope || 'prod' })));
    const people = [...new Set(st.team.map(x => x.n).concat(st.backlog.map(x => x.who)).filter(Boolean))];
    const prods = [...new Set(st.backlog.filter(x => x.scope === 'prod').map(x => x.ref).filter(Boolean))];
    const seg = (id, v) => '<div class="chips" id="' + id + '">' + [1, 2, 3, 4, 5].map(i => '<button data-i="' + i + '" class="' + (v === i ? 'on' : '') + '">' + i + '</button>').join('') + '</div>';
    const refField = () => w.scope === 'proj' ? '<select id="biP"><option value="">Auftrag wählen …</option>' + st.projects.filter(p => !p.archived || p.id === w.ref).slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => '<option value="' + p.id + '"' + (p.id === w.ref ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>'
      : '<input id="biR" list="dlRef" value="' + esc(w.ref) + '" placeholder="' + (w.scope === 'kunde' ? 'Gesellschaft / Kunde' : 'Produktname (optional)') + '"><datalist id="dlRef">' + (w.scope === 'kunde' ? kundenNamen() : prods).map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>';
    const tasks = () => '<div class="list" id="biTl">' + w.tasks.map((t, i) => '<div class="it ' + (t.done ? 'done' : '') + '"><button class="ck ' + (t.done ? 'on' : '') + '" data-ti="' + i + '">' + (t.done ? '✓' : '') + '</button><div class="t">' + esc(t.t) + '</div><button class="x" data-tr="' + i + '" aria-label="Entfernen">✕</button></div>').join('') + '</div>';
    A.sheet('<h4>' + (isNew ? '＋ Neues Thema' : '🗂 Thema') + '</h4><label class="f"><span>Titel *</span><input id="biT" value="' + esc(w.t) + '" autofocus></label>' +
      '<label class="f" style="margin-top:10px"><span>Beschreibung / Nutzen</span><textarea id="biD" rows="2">' + esc(w.d) + '</textarea></label>' +
      '<div class="row" style="margin-top:10px"><label class="f"><span>Gehört zu</span><select id="biS">' + Object.entries(C.BL_SCOPE).map(([k, n]) => '<option value="' + k + '"' + (w.scope === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label><label class="f" style="flex:2"><span>&nbsp;</span><div id="biRef">' + refField() + '</div></label></div>' +
      '<div class="row"><div class="f"><span>Wert (Nutzen)</span>' + seg('biV', w.val) + '</div><div class="f"><span>Aufwand</span>' + seg('biE', w.eff) + '</div></div>' +
      '<div class="row"><label class="f"><span>Schätzung (PT)</span><input id="biX" inputmode="decimal" value="' + esc(w.est) + '" placeholder="optional"></label><label class="f"><span>Wer</span><input id="biW" list="dlWho" value="' + esc(w.who) + '"><datalist id="dlWho">' + people.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></label>' +
      '<label class="f"><span>Spalte</span><select id="biL">' + COLS.map(([k, n]) => '<option value="' + k + '"' + (w.slot === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label></div>' +
      '<div class="f"><span>Aufgaben (optional)</span><input id="biTn" placeholder="Teilaufgabe hinzufügen (Enter)"></div><div id="biTw">' + tasks() + '</div>' +
      '<div class="acts">' + (isNew ? '' : '<button class="btn red" id="biDel">🗑 Löschen</button><button class="btn sec" id="biSh">📋 Teilen</button>') + '<span style="flex:1"></span><button class="btn sec" id="biC">Abbrechen</button><button class="btn" id="biOk">Speichern</button></div>', () => {
      const segW = (id, k) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => { w[k] = +b.dataset.i; $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
      segW('biV', 'val'); segW('biE', 'eff');
      $('biS').onchange = e => { w.scope = e.target.value; w.ref = ''; $('biRef').innerHTML = refField(); };
      const redraw = () => { $('biTw').innerHTML = tasks(); $('biTw').querySelectorAll('[data-ti]').forEach(b => b.onclick = () => { const t = w.tasks[+b.dataset.ti]; t.done = !t.done; redraw(); }); $('biTw').querySelectorAll('[data-tr]').forEach(b => b.onclick = () => { w.tasks.splice(+b.dataset.tr, 1); redraw(); }); };
      redraw();
      $('biTn').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); w.tasks.push({ id: C.uid(), t: e.target.value.trim(), done: false }); e.target.value = ''; redraw(); } };
      $('biC').onclick = A.closeSheet;
      const collect = () => { w.t = $('biT').value.trim(); w.d = $('biD').value; w.ref = w.scope === 'proj' ? ($('biP') ? $('biP').value : '') : $('biR').value.trim(); w.est = $('biX').value.trim() === '' ? '' : C.num($('biX').value.replace(',', '.')); w.who = $('biW').value.trim(); return w; };
      $('biOk').onclick = () => {
        collect(); if (!w.t) return $('biT').focus();
        const slot = $('biL').value; w.updated = today();
        if (slot !== (it ? it.slot : '') || isNew) C.moveItem(w, slot, today());
        if (isNew) st.backlog.push(w); else Object.assign(it, w);
        if (w.who && !st.team.some(x => C.normTxt(x.n) === C.normTxt(w.who))) st.team.push({ id: C.uid(), n: w.who });
        A.commit(); A.closeSheet(); after && after(); A.toast(isNew ? '🗂 Thema angelegt' : '✓ Gespeichert');
      };
      if ($('biSh')) $('biSh').onclick = () => A.copyText(C.shareText(st, [collect()], 'Thema'), '📋 Thema kopiert');
      if ($('biDel')) $('biDel').onclick = () => { const i = st.backlog.indexOf(it); st.backlog.splice(i, 1); A.commit(); A.closeSheet(); after && after(); A.toast('Thema gelöscht', 'Rückgängig', () => { st.backlog.splice(i, 0, it); A.commit(); A.render(); }); };
    });
  }
  A.itemSheet = itemSheet;
  function teamSheet() {
    const st = S();
    const draw = () => '<div class="list">' + (st.team.length ? st.team.map(m => '<div class="it">' + A.avatar(m.n, 'pl') + '<div class="t">' + esc(m.n) + '<small>' + st.backlog.filter(x => x.who === m.n && x.slot === 'now').length + ' im „Jetzt“ · ' + st.backlog.filter(x => x.who === m.n && x.slot !== 'done').length + ' offen</small></div><button class="x" data-tx="' + m.id + '" aria-label="Entfernen">✕</button></div>').join('') : '<div class="help">Noch niemand im Team.</div>') + '</div>';
    A.sheet('<h4>👥 Mein Team</h4><div class="help">Namen für die Zuständigkeit bei Themen. Die Daten bleiben lokal; geteilt wird per Kopieren (Teams, E-Mail).</div><input id="tmIn" placeholder="Name hinzufügen (Enter)"><div id="tmL" style="margin-top:8px">' + draw() + '</div><div class="acts"><button class="btn" id="tmOk">Fertig</button></div>', () => {
      const wire = () => $('tmL').querySelectorAll('[data-tx]').forEach(b => b.onclick = () => { st.team = st.team.filter(x => x.id !== b.dataset.tx); A.commit(); $('tmL').innerHTML = draw(); wire(); });
      wire();
      $('tmIn').onkeydown = e => { const n = e.target.value.trim(); if (e.key === 'Enter' && n) { if (!st.team.some(x => C.normTxt(x.n) === C.normTxt(n))) st.team.push({ id: C.uid(), n }); e.target.value = ''; A.commit(); $('tmL').innerHTML = draw(); wire(); } };
      $('tmOk').onclick = () => { A.closeSheet(); A.render(); };
    });
  }

  // ================= Bericht (Montags-Überblick) =================
  A.reportView = () => {
    const st = S(), cfg = st.meta.reportCfg, R = C.weekReport(st, cfg, today());
    const pls = [...new Set(st.projects.map(p => p.wc && p.wc.pl).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    const ks = C.customers(st, today()).filter(c => c.projects.length);
    const title = 'Projekt-Überblick' + (cfg.scope.startsWith('kunde:') ? ' ' + ((ks.find(c => 'kunde:' + c.key === cfg.scope) || {}).n || '') : cfg.scope.startsWith('pl:') ? ' ' + cfg.scope.slice(3) : '');
    $('view').innerHTML = '<div class="ph"><div><h2>Bericht</h2><p class="sub">Der schnelle Überblick für Montag oder jeden anderen Tag: Ampel, Phase, nächster Schritt, Änderungen im Zeitraum, Budget und Chancen. ' + (st.meta.lastReport ? 'Zuletzt erstellt am ' + C.fmtD(st.meta.lastReport) + '.' : '') + '</p></div></div>' +
      '<div class="panel"><div class="row" style="margin:0"><label class="f" style="flex:2"><span>Für</span><select id="rpS"><option value="all">Alle aktiven Projekte</option>' + (st.me ? '<option value="me">Meine Projekte (' + esc(st.me) + ')</option>' : '') +
      (pls.length ? '<optgroup label="Projektleiter">' + pls.map(n => '<option value="pl:' + esc(n) + '">' + esc(n) + '</option>').join('') + '</optgroup>' : '') + (ks.length ? '<optgroup label="Kunde">' + ks.map(c => '<option value="kunde:' + esc(c.key) + '">' + esc(c.n) + '</option>').join('') + '</optgroup>' : '') + '</select></label>' +
      '<div class="f"><span>Zeitraum</span><div class="chips" id="rpD">' + [7, 14, 30].map(d => '<button data-d="' + d + '" class="' + (cfg.days === d ? 'on' : '') + '">' + d + ' Tage</button>').join('') + '</div></div></div>' +
      '<div class="bar" style="margin:12px 0 0"><button class="btn" id="rpMail">📋 Als E-Mail kopieren</button><button class="btn sec" id="rpTxt">📝 Als Text (Teams)</button><button class="btn sec" id="rpPrint">🖨 Drucken / PDF</button></div></div>' +
      '<div class="paper" id="rpPv">' + C.reportHTML(R, title) + '</div>';
    $('rpS').value = cfg.scope; if ($('rpS').value !== cfg.scope) { cfg.scope = 'all'; $('rpS').value = 'all'; }
    $('rpS').onchange = e => { cfg.scope = e.target.value; A.commit(); A.reportView(); };
    $('rpD').querySelectorAll('button').forEach(b => b.onclick = () => { cfg.days = +b.dataset.d; A.commit(); A.reportView(); });
    const done = () => { st.meta.lastReport = today(); A.commit(); };
    $('rpMail').onclick = () => { A.copyRich(C.reportHTML(R, title), C.reportText(R, title)); done(); };
    $('rpTxt').onclick = () => { A.copyText(C.reportText(R, title), '📋 Bericht als Text kopiert'); done(); };
    $('rpPrint').onclick = () => { printHTML(title, C.reportHTML(R, title)); done(); };
  };

  // ================= Projektliste für den Kunden =================
  function custListSheet(projects, title) {
    let cols = Array.isArray(UI.clCols) && UI.clCols.length ? UI.clCols.filter(k => C.CL_COLS[k]) : C.CL_DEFAULT.slice();
    const L = () => C.customerList(projects, Object.keys(C.CL_COLS).filter(k => cols.includes(k)));
    const internal = { next: 1, budget: 1, used: 1, rest: 1 };
    A.sheet('<h4>📤 Projektliste für den Kunden</h4><div class="help">Enthält nie interne Angaben wie Ampel, Hinweise, Notizen, Risiken, Aktuelles oder deine eigenen Termine. Status erscheint neutral („In Arbeit“, „Pausiert“, „Abgeschlossen“). ' + projects.length + ' Projekt(e) aus der aktuellen Auswahl.</div>' +
      '<label class="f" style="margin-bottom:10px"><span>Überschrift</span><input id="clT" value="' + esc(title || 'Projektübersicht') + '"></label>' +
      '<div class="f"><span>Spalten</span><div class="chips" id="clC">' + Object.entries(C.CL_COLS).map(([k, n]) => '<button data-col="' + k + '" class="' + (cols.includes(k) ? 'on' : '') + '" title="' + (internal[k] ? 'Bewusst freigeben: eher intern' : '') + '">' + (internal[k] ? '⚠️ ' : '') + n + '</button>').join('') + '</div></div>' +
      '<div class="paper" id="clPv" style="margin-top:12px;max-height:40vh;overflow:auto"></div>' +
      '<div class="acts"><button class="btn sec" id="clX">Schließen</button><button class="btn sec" id="clPrint">🖨 Drucken / PDF</button><button class="btn sec" id="clXls">📊 Excel</button><button class="btn" id="clCopy">📋 Kopieren (E-Mail)</button></div>', () => {
      const pv = () => { $('clPv').innerHTML = C.listHTML(L(), $('clT').value); };
      $('clC').querySelectorAll('button').forEach(b => b.onclick = () => { const k = b.dataset.col; cols = cols.includes(k) ? cols.filter(x => x !== k) : cols.concat(k); if (!cols.length) cols = ['name']; UI.clCols = cols; saveUI(); $('clC').querySelectorAll('button').forEach(x => x.classList.toggle('on', cols.includes(x.dataset.col))); pv(); });
      $('clT').oninput = pv; pv();
      $('clX').onclick = A.closeSheet;
      $('clCopy').onclick = () => A.copyRich(C.listHTML(L(), $('clT').value), C.listText(L()));
      $('clPrint').onclick = () => printHTML($('clT').value, C.listHTML(L(), $('clT').value));
      $('clXls').onclick = () => {
        if (!window.XLSX) return A.toast('Excel-Modul nicht geladen');
        const l = L(), wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([[$('clT').value], []].concat([l.head], l.rows));
        ws['!cols'] = l.head.map(h => ({ wch: Math.max(10, h.length + 4, ...l.rows.map(r => String(r[l.head.indexOf(h)]).length + 2).slice(0, 200)) }));
        XLSX.utils.book_append_sheet(wb, ws, 'Projekte'); XLSX.writeFile(wb, fileName($('clT').value || 'Projektliste') + '.xlsx');
      };
    });
  }
  A.custListSheet = custListSheet;
})();
