# Hinweise für Änderungen in diesem Repo

## Projekt-Cockpit (`cockpit/`)

- Daten bleiben **ausschließlich lokal im Browser** (IndexedDB + localStorage-Kopie). Keine Netzwerkzugriffe, kein `sync.js`, keine externen Skripte oder Schriften. Test E01 prüft das.
- Kernlogik gehört nach `cockpit/core.js` (ohne DOM, in Node testbar). Oberfläche in `app.js` / `app2.js`, Speicher in `store.js`.
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
