# Testfälle Projekt-Cockpit

Diese Liste ist der verbindliche Testkatalog. Bei **jeder Änderung** am Cockpit laufen alle automatischen Tests:

```bash
npm test            # Unit- und Browser-Tests
npm run test:unit   # nur Kernlogik (schnell, ohne Browser)
```

Zusätzlich laufen sie bei jedem Push auf GitHub (Workflow „Projekt-Cockpit Tests“).
Neue Funktionen bekommen einen neuen Testfall. Ein gefundener Fehler bekommt zuerst einen Test, der ihn zeigt, und wird dann behoben.

## Unit-Tests (`core.test.js`, Kernlogik ohne Oberfläche)

| Nr. | Was wird geprüft | Warum wichtig |
|---|---|---|
| U01 | Leerer, kaputter oder unvollständiger Stand wird zu einem gültigen Stand repariert | App startet nie mit „weißer Seite“ |
| U02 | Doppelte IDs werden eindeutig gemacht | Kein Überschreiben fremder Einträge |
| U03 | Verweise auf gelöschte Stories oder Projekte werden geleert | Keine Geister-Verknüpfungen |
| U04 | Reparatur ist idempotent | Mehrfaches Laden verändert nichts |
| U10 | Backup-Rundreise erhält alle Daten inkl. Umlaute und Emojis | Nichts geht beim Sichern verloren |
| U11 | Beschädigte, fremde und zu neue Backup-Dateien werden mit Erklärung abgelehnt | Kein versehentliches Überschreiben |
| U20 | weclapp-CSV: Kopfzeile unter Titelzeilen gefunden, alle 16 Spalten zugeordnet | Exporte mit Vorspann funktionieren |
| U21 | Datum, deutsche Zahlen, Tausenderpunkt, „Benutzer“-Präfix, mehrzeilige Zellen | Werte kommen richtig an |
| U22 | „Gebuchter Aufwand“ und „Gebuchter abrechenbarer Aufwand“ werden nicht verwechselt | Budgetampel stimmt |
| U23 | Excel-Datei (xlsx) mit Datumszahlen | Direkter Excel-Export aus weclapp |
| U24 | Datei ohne bekannte Spalten wird verständlich abgelehnt | Klare Fehlermeldung |
| U25 | Randfälle Datum/Zahl (31.02., „12 h“, leere Zellen) | Keine falschen Werte |
| U26 | CSV in Windows-1252 mit Umlauten | Ältere Exporte |
| U30 | Erstimport legt Projekte an | Grundfunktion |
| U31 | Gleiche Datei zweimal importieren ändert nichts | Kein Datenmüll durch Wiederholung |
| U32 | **Neuer Export: alle lokalen Angaben bleiben erhalten** (Ampel, nächster Schritt, Name, Notizen, Aufgaben, Risiken, Schätzungen) | Kernanforderung „nichts geht verloren“ |
| U33 | Änderungen aus weclapp landen strukturiert in der Historie (Feld, vorher, nachher, Import) | Nachvollziehbarkeit |
| U34 | Projekt fehlt im Export: wird nur markiert, nie gelöscht; taucht es wieder auf, verschwindet die Markierung | Kernanforderung „nichts geht verloren“ |
| U35 | Eigene Projekte werden vom Import nie verändert | Trennung eigene/importierte Daten |
| U36 | Doppelte Auftragsnummern im Export werden nur einmal übernommen und gemeldet | Saubere Daten |
| U37 | Die Import-Vorschau verändert nichts | Vorschau ist gefahrlos |
| U38 | Zeilen ohne Auftragsnummer werden über Kunde + Kommission wiedererkannt | Robuste Zuordnung |
| U40 | Hinweise: Budget, Projektende, überfällige Aufgaben, „Aktuelles“ leer/alt | Ampel-Logik |
| U41 | Abrechenbar über Budget ist rot | Ampel-Logik |
| U42 | „Aktuelles“ mit verschiedenen Datumsschreibweisen | weclapp-Freitext |
| U43 | Ampel ignoriert weclapp-Laufzeit, „Aktuelles“ und fehlenden nächsten Schritt (nur Hinweise) | Ampel nur für Budget und eigene Termine |
| U44 | Ampel: Budget, eigene Aufgaben (überfällig = rot, bald fällig = gelb), eigener Termin, selbst gesetzter Status | Ampel-Regeln |
| U45 | Restbudget absolut und relativ, Summen über alle Projekte | Budget auf einen Blick |
| U46 | Kürzel: 1. Buchstabe Vorname + 2 Buchstaben Nachname (MAL), auch „Nachname, Vorname“ | Bubbles für PL/Consultant |
| U47 | weclapp-Link zur Suche nach der Auftragsnummer | Projekt in weclapp öffnen |
| U48 | „Aktuelles“: Datums-Präfix automatisch, Schreibweise (#) übernommen, neuer Eintrag oben, wieder lesbar | Aktuelles fortschreiben |
| U50 | PERT mit Zuschlägen in % und fest | Rechenrichtigkeit |
| U51 | Unplausible und leere Werte | Keine NaN-Ergebnisse |
| U52 | Umrechnung Stunden/Tage/Wochen | Wiederverwendung über Einheiten |
| U53 | Schätzung duplizieren mit stimmigen Story-Verknüpfungen | Vorlagen/Kopien |
| U54 | Ähnliche frühere Aufgabe wird gefunden | Wiederverwendung |
| U55 | Kundenvariante: Aufgaben + Zuschläge + Puffer ergeben genau den 85-%-Wert, ohne O/M/P | Kundenexport stimmig |
| U56 | Bibliothek merkt Aufgaben und Stories automatisch; bewusst gespeicherte werden nicht überschrieben | Wiederverwendung ohne Klick |
| U57 | Neue Felder (Aktuelles-Entwurf, weclapp-Adresse) überstehen Backup und Reparatur | Abwärtskompatibilität |
| U60 | Übernahme aus Projekt-Radar und PM-Rechner, mehrfach ohne Doppelte | Umstieg |
| U80 | Automatisch erzeugter Projektname folgt der Kommission aus weclapp, ein selbst vergebener Name bleibt | Import übernimmt Umbenennungen korrekt |
| U81 | In weclapp abgeschlossene Projekte: erkannt, als Hinweis gezeigt, nur auf ausdrücklichen Wunsch auf „Fertig“ gesetzt | Abschlüsse gehen nicht unter |
| U82 | „Aktuelles“: die Historie zeigt nur die neuen Einträge | Lesbare Änderungshistorie |
| U83 | Leerer Wert, Zahl als Text, Auftragsnummer mit Leerzeichen/anderer Schreibweise | Keine Doppelten, keine Scheinänderungen |
| U84 | Import-Liste und Markierung „geändert/neu im letzten Import“ überstehen Backup und Reparatur | Änderungshistorie dauerhaft |
| U85 | Eigene Änderungen: innerhalb von 10 Minuten zusammengefasst, zurückgenommene Änderung hinterlässt nichts | Historie ohne Rauschen |
| U86 | Nächster Schritt füllt den Aktuelles-Entwurf; selbst umformulierter Entwurf bleibt; nach „Eingetragen“ wieder verknüpft; Vorschlag aus jüngstem weclapp-Eintrag | Ein Pflegeschritt statt zwei |
| U87 | Aufgaben Schätzung → Projekt und Projekt → Schätzung: keine Doppelten, Werte aus der Bibliothek umgerechnet, Fortschritt der geschätzten Aufgaben | Schätzung und Umsetzung hängen zusammen |
| U88 | Aufgaben-Verknüpfungen überstehen Backup und Reparatur; Verweise auf gelöschte Aufgaben, fremde Projekte und Doppelte werden geleert; alte Backups ohne Verknüpfung | Abwärtskompatibel, keine Geister-Verknüpfungen |
| U90 | Phasen: Standardphasen, Fortschritt je Phase, Aufgaben ohne Phase, aktuelle Phase, Terminverzug, weclapp-Phase als Rückfall | Einfaches PM im Einzelprojekt |
| U91 | Phasen und Phasen-Zuordnung der Aufgaben überstehen Reparatur; alte Stände ohne Phasen | Abwärtskompatibel |
| U92 | Backlog: Wert ÷ Aufwand sortiert, Verschieben zwischen Spalten, Auslastung je Person im „Jetzt“, Teilen als Text | Team-Planung |
| U93 | Backlog, Team und Kunden-Notizen überstehen Backup und Reparatur; Verweise auf gelöschte Aufträge geleert | Keine Datenverluste |
| U94 | Kunden: Projekte, Ampel, Budget, Chancen (gewichtet), Themen und Stimmung je Kunde; gewonnene Chance wird Projekt | Key-Account-Sicht |
| U95 | Wochenbericht: Zeitraum, Bereich (alle/meine/Kunde), nur Änderungen im Zeitraum, überfällig, Text und HTML (escaped), „diese Woche schon erstellt“ | Montags-Überblick |
| U96 | Kundenliste: nur gewählte Spalten, **nie** Ampel, Notizen, Risiken, Aktuelles, eigener Termin; Status neutral | Kein Abfluss interner Infos |
| U97 | Chance: Kunde und Wahrscheinlichkeit, Reparatur unplausibler Werte | Schätzungen ohne Auftrag |
| U70 | Interne Versionen: Takt und Begrenzung | Speicherplatz, Wiederherstellbarkeit |

## Browser-Tests (`e2e.test.js`, echte Abläufe in Chromium)

| Nr. | Ablauf |
|---|---|
| E01 | Leerer Browser: Willkommensseite, alle Bereiche öffnen ohne Fehler, **kein einziger Netzwerkzugriff nach außen** |
| E02 | Projekt von Hand anlegen, Aufgabe und nächster Schritt überstehen Neuladen |
| E03 | weclapp-Import mit Vorschau, zweiter Import erhält lokale Angaben, „Rückgängig“ stellt den Stand vor dem Import her |
| E04 | Backup herunterladen → alles löschen → Backup einspielen ergibt identischen Stand; fremde Datei wird abgelehnt |
| E05 | Schätzung im Projekt, Ergebnis, E-Mail-Kopie als formatierte Tabelle, Excel-Download |
| E06 | Browser ohne IndexedDB: App warnt, läuft und speichert trotzdem |
| E07 | Beschädigter Speicherinhalt: App startet trotzdem |
| E08 | Zweiter Tab übernimmt gespeicherte Änderungen des ersten |
| E09 | Übernahme aus Projekt-Radar/PM-Rechner über die Willkommensseite |
| E10 | Gelöschtes Projekt über „Rückgängig“ und über eine interne Version zurückholen |
| E11 | Handy-Ansicht: Navigation unten, Import und Projekt bedienbar |
| E12 | Excel-Import (xlsx) im Browser |
| E13 | Komplett lokal als Datei geöffnet (`file://`): Import, Speichern, Neuladen |
| E14 | Projekte: Filter nach Consultant, Kürzel-Bubbles, Restbudget und weclapp-Link auf der Karte |
| E15 | Cockpit: Budget aller Projekte; Rot/Gelb-Kacheln filtern und lassen sich zurücksetzen; weclapp-Projektende färbt nicht |
| E16 | Schätzungen-Übersicht: Öffnen, Export als Kundenvariante (ohne O/M/P, mit Puffer und Gesamt = 85 %), Löschen mit Rückgängig |
| E17 | Aufgaben: Vorschlagsliste übernimmt Werte, neue Aufgaben landen automatisch in der Bibliothek, Tab öffnet Story-Auswahl mit erster Story |
| E18 | „Aktuelles“ fortschreiben: Präfix automatisch, Entwurf übersteht Neuladen, ganzes Feld in die Zwischenablage, Link in weclapp |
| E19 | Zweiter Import öffnet „Änderungen“ mit Feld-Diffs je Projekt; der Projekt-Verlauf zeigt weclapp- und eigene Änderungen, filterbar |
| E20 | In weclapp abgeschlossenes Projekt: Vorschau bietet „Fertig setzen“ an, Status und Historie stimmen |
| E21 | Schnellsuche (Strg+K, /), Tastenkürzel N, ?, G P; nach dem Schließen bleibt kein Fokus im unsichtbaren Dialog |
| E22 | Browser-Zurück/Vorwärts zwischen Ansichten |
| E23 | Markierung „neu/geändert“ nach Import mit Tooltip, Filter „Letzter Import“, Speicherstatus |
| E24 | Dialoge: Tab bleibt im Dialog, Esc schließt und gibt den Fokus zurück; Löschen ohne Rückfrage, aber mit Rückgängig |
| E25 | Nächster Schritt füllt beim Tippen den Aktuelles-Entwurf mit Datum, eigener Entwurf bleibt, Vorschlag aus weclapp, Übersicht zeigt den Schritt |
| E26 | Aufgaben aus Schätzung ins Projekt, aus dem Projekt in die Schätzung, gesperrte Doppelte, Fortschritt „x von y erledigt“ in der Schätzung |
| E27 | Navigation nach Rollen (Überblick, Steuern, Planen, System), alle Bereiche ohne Fehler und Netzwerk; Handy mit „Mehr“ und ohne seitliches Scrollen |
| E28 | Einzelprojekt: Standardphasen, Aufgaben mit/ohne Phase, Phase abschließen, Zeitplan, aktuelle Phase auf der Karte und in der Historie, Aufgaben teilen |
| E29 | Kunden: Übersicht mit Zustand, Kundensicht mit Stimmung, Ansprechpartner, Notizen, Themen und neuer Chance; bleibt nach Neuladen |
| E30 | Chance ohne Auftrag: Kunde, Wahrscheinlichkeit, Filter „Chancen“, „Gewonnen“ legt Projekt mit verknüpften Aufgaben an |
| E31 | Backlog & Team: erfassen, bewerten, mit ‹ ›, Pfeiltaste und Ziehen planen, Teilaufgaben, Auslastung, Teilen, Filter nach Person |
| E32 | Bericht: Vorschau, Bereich Kunde, Zeitraum, als E-Mail kopieren; Montags-Hinweis verschwindet danach |
| E33 | Projektliste für den Kunden: Filter nach Kunde, Spaltenwahl, keine internen Angaben, Excel; Tabellenansicht |

## Manuelle Prüfung vor dem Einsatz mit echten Daten (einmalig, ca. 10 Minuten)

- [ ] Echten weclapp-Export importieren, Vorschau prüfen: Stimmt die Anzahl? Sind alle Spalten zugeordnet?
- [ ] Zwei, drei Projekte stichprobenartig mit weclapp vergleichen (Budget, gebucht, Phase, Projektende)
- [ ] Backup erstellen, Datei öffnen (sollte lesbarer Text sein), Ablageort merken
- [ ] Backup in einem privaten Browserfenster einspielen und prüfen, dass alles da ist
- [ ] Unter „Daten“ → 🔒 prüfen, ob „Dauerhaft geschützt: ja“ angezeigt wird
