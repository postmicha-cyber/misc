# Hinweise für Änderungen in diesem Repo

## Projekt-Cockpit (`cockpit/`)

- Daten bleiben **ausschließlich lokal im Browser** (IndexedDB + localStorage-Kopie). Keine Netzwerkzugriffe, kein `sync.js`, keine externen Skripte oder Schriften. Test E01 prüft das.
- Kernlogik gehört nach `cockpit/core.js` (ohne DOM, in Node testbar). Oberfläche in `app.js` / `app2.js`, Speicher in `store.js`.
- weclapp-Import darf lokale Felder (Ampel, nächster Schritt, Name, Notizen, Aufgaben, Risiken, Schätzungen) **nie** verändern und Projekte **nie** löschen, nur markieren.
- Jede neue Datenstruktur braucht eine Reparatur in `Core.normalize` und bleibt abwärtskompatibel zu alten Backups. Formatwechsel nur mit Erhöhung von `FORMAT` und Migration.
- Vor riskanten Aktionen (Import, Wiederherstellen, Löschen) eine interne Version anlegen.

## Tests – bei jeder Änderung

```bash
npm test
```

- Testkatalog: `tests/cockpit/TESTFAELLE.md`. Neue Funktion → neuer Testfall (Nummer im Testnamen). Gefundener Fehler → erst Test, dann Fix.
- Erst committen, wenn alle Tests grün sind. GitHub Actions führt sie bei jedem Push erneut aus.
