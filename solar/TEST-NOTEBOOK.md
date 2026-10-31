# SonnenPilot auf dem Notebook testen

Bevor der Raspberry Pi kommt, kannst du SonnenPilot auf deinem Notebook ausprobieren, unter Windows oder macOS. Das dauert etwa 20 Minuten und läuft in drei Stufen. Jede Stufe ist etwas „schärfer“ als die vorige:

| Stufe | Was passiert | Risiko |
|---|---|---|
| **A – Simulation** | Simulierter Speicher, keine Growatt-Daten nötig | keins |
| **B – Probelauf** | Liest deinen **echten** Speicher, ändert aber **nichts**. Zeigt nur, was er tun würde. | keins |
| **C – Scharf** | Steuert deinen Speicher wirklich | Die Automatik regelt, solange das Notebook an ist |

## Vorbereitung (einmalig)

### 1. Node.js installieren

- Auf **https://nodejs.org** die Version **„LTS“** herunterladen und installieren. Alle Voreinstellungen kannst du lassen.
- Prüfen: Ein Terminal öffnen (siehe Schritt 3) und `node -v` eingeben. Es sollte eine Zahl ab `v18` erscheinen, z. B. `v22.x.x`.

### 2. SonnenPilot herunterladen

1. Diese Datei laden: **https://github.com/postmicha-cyber/misc/archive/refs/heads/claude/balkonkraftwerk-app-vwqp9w.zip**
   Sobald der Pull Request gemerged ist, geht es auch über https://github.com/postmicha-cyber/misc/archive/refs/heads/main.zip.
2. Die ZIP-Datei entpacken:
   - **Windows:** Rechtsklick → „Alle extrahieren“
   - **Mac:** Doppelklick
3. Im entpackten Ordner den Unterordner **`solar`** suchen. Er liegt in `misc-claude-balkonkraftwerk-app-vwqp9w`, unter Windows eventuell eine Ebene tiefer.

### 3. Terminal im Ordner `solar` öffnen

- **Windows:** Im Explorer den Ordner `solar` öffnen, oben in die **Adresszeile** klicken, `powershell` eintippen und Enter drücken. Es öffnet sich ein blaues oder schwarzes Fenster, das schon im richtigen Ordner steht.
- **Mac:** Das Programm **Terminal** öffnen (Spotlight: ⌘ + Leertaste, „Terminal“). Dann `cd ` eintippen (mit Leerzeichen danach), den Ordner `solar` aus dem Finder ins Terminal-Fenster **ziehen** und Enter drücken.

Prüfen: `dir` (Windows) bzw. `ls` (Mac) eingeben. In der Liste sollte unter anderem `server.js` stehen.

## Stufe A – Simulation

```
node server.js
```

Die Ausgabe sieht etwa so aus:

```
☀️  SonnenPilot läuft auf Port 8787 (SIMULATION – keine Growatt-Zugangsdaten)
📱 Im Browser öffnen: http://localhost:8787
🔑 Zugangsschlüssel für die App: Ab3dE…
```

1. Im Browser des Notebooks **http://localhost:8787** öffnen und den **Zugangsschlüssel** aus dem Terminal eingeben.
2. Herumklicken: Jetzt, Plan, Verlauf, Einstellungen, Boost.
3. Unter **Einstellungen** deinen Standort und deine Module eintragen. Der „Plan“ zeigt danach dein echtes Wetter.
4. Beenden: Im Terminal **Strg + C** drücken.

**Windows:** Beim ersten Start fragt die Firewall eventuell nach einer Erlaubnis. Erlaube **„Private Netzwerke“**, damit du in Stufe B auch vom Handy zugreifen kannst.

## Stufe B – Probelauf mit deinem echten Speicher

### 1. Zugangsdaten-Datei anlegen

- **Windows (PowerShell):**
  ```
  copy .env.example .env
  notepad .env
  ```
- **Mac (Terminal):**
  ```
  cp .env.example .env
  open -e .env
  ```

### 2. Eintragen und speichern

```
GROWATT_USER=dein-shine-benutzername
GROWATT_PASSWORD=dein-shine-passwort
DRY_RUN=1
```

Die Zeile `DRY_RUN=1` steht schon in der Datei, mit `#` davor. Entferne das `#`. Falls dein Passwort Leerzeichen oder `#` enthält, setze es in Anführungszeichen: `GROWATT_PASSWORD="mein #Passwort"`.

Die Datei `.env` bleibt nur auf deinem Notebook. Schick sie niemandem und lade sie nirgends hoch.

### 3. Starten

```
node server.js
```

Im Terminal sollte **„PROBELAUF“** stehen.

### 4. Prüfen

1. Im Browser **http://localhost:8787** öffnen. Oben erscheint ein Hinweis „🧪 Probelauf“.
2. Unter **Jetzt** sollten deine echten Werte stehen: Sonne, Akkustand, Leistung ins Haus. Vergleiche sie mit der Shine-App. Die Shine-Werte aktualisieren sich nur alle paar Minuten, kleine Abweichungen sind normal.
3. Unter **Verlauf → Protokoll** steht, was SonnenPilot tun **würde**, z. B. „würde setzen: Leistung 200 → 150 W · Akku reicht bis zur Sonne um 09:00 Uhr“.
4. Unter **Einstellungen → Gerät** sollte deine Seriennummer stehen. Gibt es dort eine rote Warnung zu **Zeitsegmenten**, schalte diese in der Shine-App aus.

### 5. Optional: vom Handy aus

Das Handy muss im selben WLAN sein.

1. Die IP-Adresse des Notebooks herausfinden:
   - **Windows:** `ipconfig` eingeben, Zeile „IPv4-Adresse“
   - **Mac:** Systemeinstellungen → WLAN → Details
2. Am Handy **http://192.168.178.xx:8787** öffnen, mit der Notebook-IP statt `xx`.

Lass den Probelauf ruhig **ein paar Stunden oder einen Abend lang** laufen und schau ins Protokoll. Klingen die Entscheidungen vernünftig?

## Stufe C – Scharf schalten

1. In der `.env` die Zeile `DRY_RUN=1` wieder mit `#` auskommentieren oder löschen.
2. Im Terminal mit **Strg + C** stoppen und mit `node server.js` neu starten.
3. Jetzt stellt SonnenPilot die Leistung am Speicher wirklich ein. In der Shine-App siehst du nach ein paar Minuten unter den Einstellungen die neue „Standard-Ausgangsleistung“.

**Wichtig:**
- Die Automatik läuft nur, **solange das Notebook an ist und nicht schläft**.
- Beendest du SonnenPilot, behält der Speicher einfach die **zuletzt eingestellte** Leistung. Bei Bedarf stellst du sie in der Shine-App zurück.
- Später auf dem Pi kannst du dieselbe `.env` nicht einfach kopieren: Das Installationsskript fragt die Zugangsdaten dort neu ab.

## Wenn etwas nicht klappt

| Meldung | Lösung |
|---|---|
| `node` wird nicht gefunden | Node.js installieren, dann das Terminal **neu öffnen** |
| `Cannot find module …server.js` | Das Terminal steht nicht im Ordner `solar` (Schritt 3) |
| `EADDRINUSE` | SonnenPilot läuft schon in einem anderen Fenster. Dort mit Strg + C stoppen. |
| „Anmeldung bei Growatt fehlgeschlagen“ | Benutzername oder Passwort prüfen. Bei Sonderzeichen das Passwort in Anführungszeichen setzen. |
| „Kein NOAH-Speicher gefunden“ | Seriennummer aus der Shine-App bei `GROWATT_SN=` eintragen |
| Weiterhin „SIMULATION“ trotz `.env` | Die Datei heißt versehentlich `.env.txt`. Unter Windows im Explorer „Ansicht → Dateinamenerweiterungen“ einschalten und umbenennen. |
| Handy erreicht das Notebook nicht | Windows-Firewall: Node.js für „Private Netzwerke“ erlauben. Das WLAN in Windows muss als „Privat“ eingestellt sein. |

Wenn eine Fehlermeldung auftaucht, kopiere die letzten Zeilen aus dem Terminal und schick sie mir. Entferne vorher alles, was nach Passwort aussieht.
