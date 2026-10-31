# Hinweise für Änderungen in diesem Repo

## Projekt-Cockpit (`cockpit/`)

- Daten bleiben **ausschließlich lokal im Browser** (IndexedDB + localStorage-Kopie). Keine Netzwerkzugriffe, kein `sync.js`, keine externen Skripte oder Schriften. Test E01 prüft das.
- Kernlogik gehört nach `cockpit/core.js` (ohne DOM, in Node testbar). Oberfläche in `app.js` (Grundgerüst, Cockpit, Projekte), `app2.js` (Schätzungen, Daten, Import) und `app3.js` (Kunden, Backlog & Team, Bericht, Kundenliste), Speicher in `store.js`.
- Kundenliste (`Core.customerList`) und Kundenexport der Schätzung enthalten **nie** interne Angaben (Ampel, Hinweise, Notizen, Risiken, Aktuelles, eigene Termine). Test U96 prüft das.
- weclapp-Import darf lokale Felder (Ampel, nächster Schritt, Notizen, Aufgaben, Risiken, Schätzungen, selbst vergebener Name) **nie** verändern und Projekte **nie** löschen, nur markieren. Ausnahmen: Der automatisch erzeugte Name folgt weclapp; „Fertig“ nur, wenn in der Import-Vorschau ausdrücklich angehakt.
- Jede Änderung (weclapp und eigene Kernfelder) landet strukturiert in `p.hist` (Feld, vorher, nachher, Quelle, Import-ID). Neue Kernfelder dort mitschreiben (`App.track`).
- Jede neue Datenstruktur braucht eine Reparatur in `Core.normalize` und bleibt abwärtskompatibel zu alten Backups. Formatwechsel nur mit Erhöhung von `FORMAT` und Migration.
- Nächsten Schritt nur über `Core.setNext` setzen (füllt den verknüpften Aktuelles-Entwurf). Aufgaben-Verknüpfung liegt nur an der Projektaufgabe (`eid`, `etid`), nicht doppelt.
- Vor riskanten Aktionen (Import, Wiederherstellen, Löschen) eine interne Version anlegen.

## Tests – bei jeder Änderung

```bash
npm test
```

- Testkatalog: `tests/cockpit/TESTFAELLE.md`. Neue Funktion → neuer Testfall (Nummer im Testnamen). Gefundener Fehler → erst Test, dann Fix.
- Erst committen, wenn alle Tests grün sind. GitHub Actions führt sie bei jedem Push erneut aus.

## SonnenPilot (`solar/`)

- Kernlogik (Strategie, Wetter, Simulation) gehört nach `solar/app/core.js` – ohne DOM und ohne Netz, im Browser und in Node nutzbar.
- Growatt-Zugriff nur in `solar/growatt.js`, Regelschleife und API in `solar/server.js`, Oberfläche in `solar/app/app.js`.
- **Zugangsdaten nie ins Repo:** `solar/.env` und `solar/data/` stehen in `.gitignore`. Der Zustand (`state.json`) speichert keine Growatt-Zugangsdaten (Test S22).
- Der Server liefert nur Dateien aus `solar/app/` aus und verlangt für `/api/*` den Zugangsschlüssel (Test S27).
- Befehle an den Speicher nur über `Core.needsUpdate` (Mindeständerung und Ruhezeit schonen die Growatt-Cloud).
- Testkatalog: `tests/solar/TESTFAELLE.md`. Neue Funktion → neuer Testfall.
