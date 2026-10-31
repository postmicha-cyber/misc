# Testfälle SonnenPilot

Bei **jeder Änderung** an `solar/` laufen alle Tests:

```bash
npm test               # alles (Cockpit + SonnenPilot)
npm run test:solar     # nur SonnenPilot
```

Neue Funktion → neuer Testfall. Gefundener Fehler → erst Test, dann Fix.

## Kernlogik (`core.test.js`)

| Nr. | Was wird geprüft | Warum wichtig |
|---|---|---|
| S01 | Einstellungen werden repariert, begrenzt, fremde Felder entfernt | Kaputte Eingaben legen die Regelung nie lahm |
| S02 | Open-Meteo: Stundenwert gilt für die Stunde davor; Flächen, Wirkungsgrad, Korrektur, Obergrenze | Vorhersage stimmt zeitlich und in der Höhe |
| S03 | Sonnenphase: Grundlast decken, Rest lädt Akku | Grundverhalten tagsüber |
| S04 | Überschuss verteilen, wenn der Akku sicher voll wird | Kein Abregeln von Sonnenstrom |
| S05 | Akku voll: Vorhersage statt abgeregelter Messung | Keine Selbstblockade bei vollem Akku |
| S06 | Nacht: Grundlast bis zur Sonne bzw. gestreckt; trübes Wetter → sparsamer | Kern der Wetter-Automatik |
| S07 | Untergrenze, Dunkelflaute-Reserve, Akkuschonung | Akku wird geschont |
| S08 | Boost, feste Leistung, Pause haben Vorrang; 800-W-Grenze | Handsteuerung zuverlässig |
| S09 | Vorschau bleibt in den Akkugrenzen, Nacht wird versorgt | Plan-Anzeige glaubwürdig |
| S10 | Mindeständerung, Ruhezeit, große Änderungen sofort | Growatt-Cloud wird nicht überflutet |
| S11 | Lernen der Vorhersage-Korrektur, volle Tage zählen nicht | Selbstkorrektur ohne Ausreißer |
| S12 | Tageswerte aus Messpunkten, Lücken nicht hochgerechnet | Statistik stimmt |
| S13 | Growatt-Werte („200Watt“, Status, Zeitsegmente) lesen | Gerätedaten richtig verstanden |
| S14 | Passwort-Hash, Zeitstempel, Gerätekennung wie die ShinePhone-App | Anmeldung funktioniert |
| S15 | Himmelsrichtungen, Wettersymbole | Anzeige |
| S16 | Simulierter Speicher: Energiebilanz und Grenzen | Demo und Tests realistisch |

## Growatt und Server (`server.test.js`)

| Nr. | Was wird geprüft | Warum wichtig |
|---|---|---|
| S20 | Anmeldung, Gerätesuche, Status, Befehle, Neu-Anmeldung, abgelehnte Befehle; Klartext-Passwort wird nie gesendet | Verbindung zum echten Speicher |
| S21 | Falsches Passwort → verständliche Meldung | Fehlersuche |
| S22 | Regeldurchlauf setzt Leistung, erkennt Akkuzahl, protokolliert, speichert ohne Zugangsdaten, Neustart lädt Stand | Dauerbetrieb |
| S23 | Wetterdienst oder Growatt weg → Fehler sichtbar, Server läuft weiter | Robustheit |
| S24 | Shelly-Zähler: Hausverbrauch = Netz + Speicher | Optionale Nulleinspeisung |
| S25 | Lernen über einen ganzen Tag, Zurücksetzen | Selbstkorrektur im Betrieb |
| S26 | Ohne Zugangsdaten: Simulation, Schlüssel wird erzeugt | Ausprobieren ohne Anlage |
| S27 | Zugangsschlüssel Pflicht, kein Zugriff außerhalb des App-Ordners (.env!) | Sicherheit im Heimnetz |
| S28 | Einstellungen, Modus, Boost wirken sofort; Boost endet von selbst | Bedienung |

## Browser (`e2e.test.js`, Handy-Größe)

| Nr. | Was wird geprüft | Warum wichtig |
|---|---|---|
| E01 | Demo ohne Server: alle Ansichten, Diagramm antippbar, kein Querscrollen, keine Fehler, keine Zugriffe nach außen | GitHub-Pages-Demo |
| E02 | Demo: Pause, Boost, Einstellungen mit zweiter Modulfläche | Bedienung |
| E03 | Mit Server: Schlüssel-Abfrage, falscher Schlüssel, feste Leistung erreicht den Speicher, Hinweis auf Zeitsegmente, Fehleranzeige | Ende-zu-Ende |
