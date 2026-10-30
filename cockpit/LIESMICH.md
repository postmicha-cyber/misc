# Projekt-Cockpit

Kleine Projektmanagement-Suite für Projektleiter, Multiprojektleiter, Key Account Consultants und Teamleiter: Projekte mit Ampel, Phasen und nächstem Schritt, Kundensicht, Backlog mit Team-Planung, Schätzungen und Chancen, Montagsbericht, Kundenliste und Import der weclapp-Projektliste.

## Was finde ich wo?

| Ich will … | Bereich |
|---|---|
| morgens sehen, was brennt | **🏠 Cockpit** |
| der Firma montags einen Überblick geben, Reports erstellen | **📊 Bericht** (als E-Mail, Text für Teams, PDF) |
| alle Projekte steuern (Multiprojekt) | **📁 Projekte**, Karten oder ☰ Tabelle, Filter nach PL, Consultant, Kunde |
| wissen, wie es beim Kunden steht (Key Account) | **🏢 Kunden**: Zustand, Budget, Chancen, Themen, Stimmung, Notizen |
| ein Projekt führen (Phasen und Aufgaben) | Projekt → **Plan**: Phasen mit Zeitplan, Aufgaben mit und ohne Phase |
| Themen sammeln und im Team planen | **🗂 Backlog & Team**: Produkt, Auftrag oder Kunde; Jetzt · Als Nächstes · Später |
| schätzen, auch ohne Auftrag | **🧮 Schätzungen & Chancen**; gewonnene Chance → ein Klick legt das Projekt an |
| dem Kunden eine Projektliste schicken | Projekte oder Kunde → **📤 Kundenliste** (ohne interne Angaben) |

## Kurz erklärt

- **Bericht:** Bereich wählen (alle, meine, ein Projektleiter, ein Kunde) und Zeitraum (7/14/30 Tage). Enthält Ampel, Phase, nächsten Schritt, Änderungen im Zeitraum, Überfälliges, Budget und Chancen. Montags erinnert das Cockpit daran.
- **Phasen:** „🧭 Standardphasen“ legt Vorbereitung bis Abschluss an; jede Phase kann Start/Ende haben (Zeitplan). Aufgaben ohne Phase bleiben eine eigene Gruppe. Die aktuelle Phase erscheint auf Karte, Tabelle, Bericht und Kundenliste.
- **Backlog:** Jedes Thema bekommt Wert und Aufwand (1–5); sortiert wird nach Wert ÷ Aufwand (⚡). Verschieben per Ziehen, mit ‹ › oder den Pfeiltasten. Teilaufgaben und Zuständige sind optional. „📋 Jetzt teilen“ kopiert den Plan für Teams/E-Mail.
- **Kundenliste:** Spalten frei wählbar. Ampel, Hinweise, Notizen, Risiken, Aktuelles und deine eigenen Termine sind nie enthalten; Budget und nächster Schritt nur, wenn du sie bewusst anhakst (⚠️).

## Wo liegen die Daten?

Ausschließlich im Browser des Geräts, auf dem du die App öffnest. Die App sendet nichts ins Internet. Das gilt auch, wenn du sie über GitHub Pages öffnest: Von dort kommt nur der Programmcode.

Wichtig: Der Browser verwaltet die Daten **pro Adresse**. Öffnest du die App einmal online und einmal als lokale Datei, sind das zwei getrennte Speicher. Entscheide dich für einen Weg. Mit Backups kannst du jederzeit umziehen.

## Öffnen

- **Online:** `…/misc/cockpit/index.html` (GitHub Pages)
- **Komplett lokal:** Repository als ZIP herunterladen, entpacken, `cockpit/index.html` im Browser öffnen. Die Datei `xlsx.mini.min.js` aus dem übergeordneten Ordner wird für den Excel-Import gebraucht.

Empfohlen: Chrome oder Edge am Notebook. Dort kannst du einen festen Backup-Ordner wählen (z. B. in OneDrive), und ein Klick auf 💾 legt die Sicherung direkt dort ab.

## Sicherheit gegen Datenverlust

1. **💾 Backup** oben rechts: speichert alles als JSON-Datei. Der Punkt davor wird gelb oder rot, wenn ein Backup fällig ist.
2. **Interne Versionen** (Daten → 🕒): automatisch alle 30 Minuten und vor jedem Import, Löschen oder Wiederherstellen. Zum schnellen Zurückholen; sie liegen aber im selben Browser und ersetzen kein Backup.
3. **Rückgängig** nach Import und Löschen.
4. weclapp-Import löscht nie etwas und verändert keine eigenen Angaben. Ausnahmen: Ein automatisch erzeugter Projektname folgt weclapp (ein selbst vergebener nicht), und in weclapp abgeschlossene Projekte werden nur auf „Fertig“ gesetzt, wenn du das in der Vorschau anhakst.

## weclapp-Import

Daten → 📥 Export-Datei wählen (Excel oder CSV). Erkannt werden u. a. Auftragsnummer, Kunde, Kommission, Aktuelles, Phase, Projektleiter, Consultant, Status, geplanter/gebuchter (abrechenbarer) Aufwand, Projekt Start/Ende. Vor dem Übernehmen zeigt eine Vorschau, was neu ist, was sich ändert und was nicht mehr im Export steht. Die Spaltenzuordnung lässt sich dort anpassen und wird gemerkt.

## Nächster Schritt und „Aktuelles“

Du pflegst nur noch den **nächsten Schritt**. Bei weclapp-Projekten wird er automatisch als neuer Eintrag für „Aktuelles“ vorgemerkt (mit Datum davor). Rechts mit 📋 kopieren, in weclapp einfügen, dann **✓ Eingetragen**. Willst du für weclapp etwas anderes schreiben, formuliere den Entwurf einfach selbst um; dann folgt er dem Schritt nicht mehr, bis du „Eingetragen“ klickst. Ist kein Schritt gesetzt, schlägt die App den jüngsten Eintrag aus weclapp vor.

## Aufgaben in Projekt und Schätzung

- In der Schätzung: **➜ Ins Projekt übernehmen** legt die geschätzten Aufgaben im Projekt an, **📋 Aus Projektaufgaben** holt vorhandene Projektaufgaben in die Schätzung (Werte gleichnamiger früherer Aufgaben werden vorgeschlagen).
- Im Projekt unter Aufgaben: **🧮 Aus Schätzung übernehmen**.
- Verknüpfte Aufgaben zeigen 🧮 bzw. 🔗; die Schätzung zeigt, wie viel des Geschätzten im Projekt erledigt ist.

## Änderungen nachvollziehen

- **🕘 Änderungen**: jeder weclapp-Import mit allen geänderten Feldern je Projekt (vorher → nachher), dazu deine eigenen Änderungen an Status, nächstem Schritt, Termin, Priorität und Name.
- Im Projekt unter **Verlauf & Notizen**: alles zu diesem Projekt als Zeitleiste, filterbar nach weclapp, eigenen Änderungen und Journal.
- Nach einem Import markieren **🆕 neu** und **✎ geändert** die betroffenen Projekte; der Filter „Letzter Import“ zeigt nur diese.

## Tastenkürzel

`Strg`+`K` oder `/` Schnellsuche (Projekte, Kunden, Themen, Schätzungen) · `N` neues Projekt · `G` dann `C`/`B`/`P`/`K`/`L`/`S`/`A` Cockpit/Bericht/Projekte/Kunden/Planung/Schätzungen/Änderungen · `?` Hilfe · `Esc` Dialog schließen. Die Zurück-Taste des Browsers funktioniert.

## Tests

Siehe `tests/cockpit/TESTFAELLE.md`. Ausführen mit `npm test` im Ordner `misc`.
