# ☀️ SonnenPilot

SonnenPilot ersetzt die Shine-App für den **Growatt-NOAH-Speicher** am Balkonkraftwerk. Die App liest den Wetterbericht und stellt den Speicher so ein, dass möglichst viel Sonnenstrom im eigenen Haushalt landet.

- **Automatik nach Wetter:** Sie stellt die Einspeiseleistung und die Akkugrenzen selbst ein (alle 5 Minuten, nur wenn sich etwas ändert).
- **Plan:** Zeigt, was die nächsten 30 Stunden passiert: Sonne laut Vorhersage, Leistung ins Haus, Akkustand.
- **Boost per Fingertipp:** Zum Beispiel beim Waschen 600 W für 2 Stunden. Danach übernimmt wieder die Automatik.
- **Verlauf:** Messwerte der letzten Tage, Tageswerte und ein Protokoll jeder Änderung.
- **Lernt dazu:** Vergleicht die Vorhersage mit der Messung und korrigiert sie mit der Zeit (z. B. wegen Schatten oder Verschmutzung).
- **Optional mit Stromzähler (Shelly):** Dann regelt die Automatik auf deinen echten Verbrauch statt auf eine geschätzte Grundlast.
- **iPhone und Android:** Läuft im Browser und lässt sich als App auf den Home-Bildschirm legen.

## Wie die Automatik denkt

Stell dir den Akku wie einen **Wassertank** vor. Die Sonne füllt ihn tagsüber, und dein Haushalt zapft ab. Die Automatik schaut in den Wetterbericht und dreht den Hahn so weit auf, dass der Tank **genau dann leer wird, wenn die Sonne ihn wieder füllt**:

| Lage | Was SonnenPilot macht |
|---|---|
| ☀️ Sonne reicht für die Grundlast | Die Sonne deckt die Grundlast, der Rest lädt den Akku. |
| 🌞 Der Akku wird laut Vorhersage heute sowieso voll | Der Überschuss geht schon vorher ins Haus. Sonst würde der Speicher mittags abregeln und Strom verschenken. |
| 🔋 Der Akku ist voll | Der Sonnenstrom geht direkt ins Haus. |
| 🌙 Abend oder Nacht | Der Akku versorgt die Grundlast bis zur nächsten Sonne. Reicht er nicht, wird die Leistung gleichmäßig gestreckt. |
| 🌧️ Morgen wird es trüb | Der Akku wird sparsamer verteilt. |
| 🌫️ Dunkelflaute | Eine Reserve bleibt im Akku. Das schont die Zellen. |
| 🏖️ Viel Sonne in Sicht (optional) | Der Akku lädt nur bis zur Schongrenze, z. B. 90 %. |

## Was du brauchst

Die Growatt-Cloud lässt sich nicht direkt aus dem Handy-Browser ansprechen. Außerdem soll die Automatik auch laufen, wenn das Handy aus ist. Deshalb läuft SonnenPilot als kleiner **Server im Heimnetz**. Dafür reicht alles, was ständig an ist:

- ein Raspberry Pi (ab Pi 3),
- ein NAS mit Docker (Synology, QNAP, Unraid),
- ein Home-Assistant-Rechner mit Docker
- oder ein alter Laptop.

Benötigt wird Node.js 18 oder neuer, sonst nichts. Es gibt keine weiteren Pakete.

## Einrichtung

> **Erst mal ausprobieren?** Auf dem Notebook testen, auch im Probelauf mit deinem echten Speicher, ohne dass etwas verändert wird: **[TEST-NOTEBOOK.md](TEST-NOTEBOOK.md)**.
>
> **Neu mit Raspberry Pi?** Die Schritt-für-Schritt-Anleitung von Einkauf bis App, mit FRITZ!Box und Ein-Befehl-Installation, steht in **[RASPBERRY-PI.md](RASPBERRY-PI.md)**.

### 1. Zugangsdaten eintragen

```bash
git clone https://github.com/postmicha-cyber/misc.git
cd misc/solar
cp .env.example .env
nano .env        # GROWATT_USER und GROWATT_PASSWORD eintragen (wie in der Shine-App)
```

Die `.env` bleibt auf deinem Gerät. Sie steht in `.gitignore` und wird nie hochgeladen. Das Passwort wird nur als Growatt-Hash an Growatt geschickt, genau wie bei der Shine-App.

### 2a. Start mit Docker (empfohlen)

```bash
docker compose up -d
docker compose logs     # zeigt den Zugangsschlüssel für die App
```

### 2b. Start ohne Docker (z. B. Raspberry Pi)

```bash
node server.js
```

Damit der Server nach einem Neustart von selbst wieder läuft, gibt es `sonnenpilot.service`. Die Anleitung steht in der Datei.

### 3. App aufs Handy holen

1. Am Handy im WLAN `http://<IP-des-Servers>:8787` öffnen, z. B. `http://192.168.178.20:8787`.
2. Den **Zugangsschlüssel** aus dem Server-Protokoll eingeben. Das ist die Zeile `🔑 Zugangsschlüssel für die App`.
3. Als App ablegen:
   - **iPhone (Safari):** Teilen → „Zum Home-Bildschirm“.
   - **Galaxy (Chrome oder Samsung Internet):** Menü → „Zum Startbildschirm hinzufügen“.
4. Unter **Einstellungen** eintragen:
   - Standort (📍-Knopf),
   - Module mit kWp, Neigung und Richtung (zwei Balkonseiten = zwei Flächen),
   - Grundlast.

### 4. Shine-App aufräumen

In der Shine-App die **Zeitsegmente (Time Segments) ausschalten**. Sie haben am NOAH Vorrang vor der Standardleistung, die SonnenPilot einstellt. Die App warnt dich, wenn noch welche aktiv sind.

## Unterwegs zugreifen

Die App ist nur im Heimnetz erreichbar, und das ist Absicht. Für unterwegs ist **[Tailscale](https://tailscale.com)** die einfachste sichere Lösung (kostenlos): auf Server und Handy installieren, dann ist die App auch mobil erreichbar. **Gib Port 8787 nicht per Portfreigabe ins Internet frei.**

## Stromzähler (optional)

Mit einem Shelly am Zählerschrank (Pro 3EM, 3EM, EM oder Pro EM) trägst du unter *Einstellungen → Verbrauch* seine Adresse ein, z. B. `http://192.168.178.50`. SonnenPilot rechnet dann so:

> Hausverbrauch = Netzbezug + Abgabe des Speichers

Die Automatik folgt dem echten Verbrauch, also auch dem Wasserkocher. Über die Cloud geht das nicht im Sekundentakt, sondern alle 2 Minuten.

## Technik

| Datei | Inhalt |
|---|---|
| `app/core.js` | Kernlogik ohne Netz und Oberfläche: Wetter → Sonnenleistung, Strategie, Vorschau, Lernen, Simulation |
| `app/index.html`, `app/app.js` | Handy-Oberfläche (ohne Server automatisch als Demo) |
| `growatt.js` | Zugriff auf die Growatt-Cloud wie die ShinePhone-App (`server-api.growatt.com`, NOAH-Endpunkte) |
| `server.js` | Regelschleife, Speicherung in `data/state.json`, kleine API für die App |

- **Wetter:** [Open-Meteo](https://open-meteo.com), kostenlos und ohne Anmeldung. Abgefragt wird die Einstrahlung auf die geneigte Modulfläche, je Fläche einzeln.
- **Growatt-Befehle:**
  - `default_power`: Einspeiseleistung 0–800 W,
  - `charging_soc`: Ladegrenze 70–100 %, Entladegrenze 0–30 %.
- **Schonung der Cloud:** Kleine Änderungen werden höchstens alle 10 Minuten geschickt, große sofort.
- **Tests:** `npm test` im Repo-Ordner. Der Testkatalog steht in `tests/solar/TESTFAELLE.md`.

> Die Growatt-Schnittstelle ist nicht offiziell dokumentiert. Sie entspricht der, die auch die ShinePhone-App, [noah-mqtt](https://github.com/mtrossbach/noah-mqtt) und [PyPi_GrowattServer](https://github.com/indykoning/PyPi_GrowattServer) nutzen. Ändert Growatt sie, muss `growatt.js` angepasst werden.

## Ideen für später

- **Dynamischer Stromtarif (Tibber, aWATTar):** Den Akku gezielt in den teuren Abendstunden entladen.
- **Push-Nachricht** bei Problemen, z. B. „Speicher offline“, „Akku bei Dunkelflaute leer“ oder „Boost endet“.
- **Lokale Steuerung ohne Cloud:** Neuere NOAH-Firmware kann MQTT. Das wäre schneller und unabhängig von Growatt.
