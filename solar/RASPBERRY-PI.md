# SonnenPilot auf dem Raspberry Pi: Kauf und Einrichtung

Diese Anleitung bringt dich in etwa einer Stunde vom Einkauf bis zur fertigen App auf dem Handy. Du brauchst dafür nur deine FRITZ!Box und **einmalig einen PC oder Mac**, um die Speicherkarte zu beschreiben.

## 1. Welcher Rechner?

Der SonnenPilot-Server braucht kaum Leistung: Er rechnet alle 5 Minuten kurz und schläft dann wieder. Entscheidend sind deshalb **Stromverbrauch und Anschaffungspreis**.

| | Kauf (ca., Okt. 2026) | Strom im Leerlauf | Stromkosten pro Jahr* | Geeignet für |
|---|---|---|---|---|
| **Raspberry Pi Zero 2 W** ⭐ | 45–55 € komplett | ca. 1 W | ca. 3 € | SonnenPilot und ähnlich kleine Dienste |
| Raspberry Pi 5 (2 GB) | 110–125 € komplett | ca. 3–3,5 W | ca. 10 € | zusätzlich später Home Assistant, Pi-hole usw. |
| Gebrauchter Mini-PC / Thin Client | 30–60 € gebraucht | 5–8 W | 15–25 € | viele Dienste, aber größer und lauter |
| NAS (2 Festplatten) | 300–500 € plus Platten | 15–25 W | 45–75 € | nur sinnvoll, wenn du **sowieso** Daten zentral speichern willst |

\* bei 35 ct/kWh, Dauerbetrieb. Faustregel: 1 W rund um die Uhr ≈ 8,8 kWh ≈ 3 € im Jahr.

**Empfehlung: Raspberry Pi Zero 2 W.** Er ist am günstigsten und am sparsamsten. Er verbraucht weniger als ein Handy-Ladegerät im Standby, und dein Balkonkraftwerk deckt das tagsüber locker mit. Ein NAS lohnt sich nur, wenn du ohnehin Fotos und Backups zentral ablegen willst. Nur für SonnenPilot wäre es, als würdest du einen Kleintransporter kaufen, um Brötchen zu holen.

Nimm den **Pi 5**, wenn du mehr vorhast, etwa Home Assistant für das ganze Zuhause. Der Pi 4 lohnt sich derzeit nicht: Er kostet fast so viel wie der Pi 5.

> Die Preise sind 2026 wegen teurer Speicherchips mehrfach gestiegen. Vergleiche vor dem Kauf kurz bei einem Preisvergleich wie Geizhals.

## 2. Einkaufsliste

Kauf am besten bei einem offiziellen Raspberry-Pi-Händler, z. B. BerryBase, Reichelt oder Welectron. Dort gibt es oft fertige Sets.

**Variante Zero 2 W (empfohlen)**

- [ ] Raspberry Pi **Zero 2 W** (die Variante „WH“ mit Stiftleiste brauchst du nicht)
- [ ] **Offizielles Netzteil Micro-USB**, 5,1 V / 2,5 A. Billige Handy-Ladegeräte führen oft zu Abstürzen.
- [ ] **microSD-Karte 32 GB, „High Endurance“**, z. B. SanDisk High Endurance oder Samsung PRO Endurance. Diese Karten halten Dauerbetrieb deutlich länger aus.
- [ ] Gehäuse, z. B. das offizielle Zero-Gehäuse
- [ ] Falls dein PC oder Mac keinen Kartenschlitz hat: **USB-Kartenleser für microSD** (ca. 8 €)

**Variante Pi 5** (statt der ersten beiden Punkte): Pi 5 mit 2 GB, offizielles 27-W-Netzteil USB-C und offizielles Gehäuse mit Lüfter.

**Wichtig beim Zero 2 W:** Er hat nur **2,4-GHz-WLAN** und keinen Netzwerkanschluss. Die FRITZ!Box funkt standardmäßig auf 2,4 und 5 GHz, das passt also. Stell den Pi in WLAN-Reichweite auf. Ein Platz bei der FRITZ!Box ist ideal.

## 3. Speicherkarte vorbereiten (am PC oder Mac)

1. **Raspberry Pi Imager** installieren: raspberrypi.com → Software. Den Imager gibt es für Windows, macOS und Linux.
2. Die microSD-Karte einstecken und den Imager starten.
3. Auswählen:
   - **Gerät:** Raspberry Pi Zero 2 W (bzw. Raspberry Pi 5)
   - **Betriebssystem:** *Raspberry Pi OS (other)* → **Raspberry Pi OS Lite (64-bit)**. Lite heißt: ohne Bildschirmoberfläche, das spart Strom und Speicher.
   - **Speicher:** deine Karte
4. Wenn der Imager nach **Anpassungen** fragt, mit **Ja / Einstellungen bearbeiten** bestätigen und Folgendes eintragen:

| Einstellung | Wert |
|---|---|
| Hostname | `sonnenpilot` |
| Benutzername / Passwort | z. B. `sonne` und ein **eigenes, sicheres** Passwort (nicht dein Growatt-Passwort) |
| WLAN | Name (SSID) und Passwort deiner FRITZ!Box, WLAN-Land **DE** |
| Zeitzone / Tastatur | `Europe/Berlin` / `de` |
| Dienste | **SSH aktivieren**, Anmeldung mit Passwort |

5. Schreiben lassen. Das dauert ein paar Minuten. Danach die Karte auswerfen.

## 4. Erster Start und FRITZ!Box

1. Die Karte in den Pi stecken, das Netzteil anschließen. Einen Bildschirm brauchst du nicht.
2. **3–5 Minuten warten.** Beim ersten Start richtet sich der Pi ein und startet einmal neu.
3. Am Handy oder PC **http://fritz.box** öffnen → **Heimnetz → Netzwerk**. Dort sollte das Gerät **sonnenpilot** auftauchen.
4. Beim Gerät auf **Bearbeiten** (Stift) tippen und den Haken bei **„Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“** setzen. Dann **Übernehmen**.

   Das ist wie eine feste Hausnummer: So findet dein Handy den Pi auch nach einem Neustart der FRITZ!Box wieder.

Der Pi taucht nicht auf? Dann stimmt meist das WLAN-Passwort im Imager nicht, oder der Pi steht zu weit weg. Karte nochmal beschreiben.

## 5. Mit dem Pi verbinden (SSH)

SSH ist eine Fernbedienung per Textbefehl. Du tippst auf dem Handy oder PC, und der Pi führt den Befehl aus.

- **Vom Handy:** App **Termius** (iPhone und Android, kostenlos).
  1. Neuer Host: Adresse `sonnenpilot.fritz.box`, Benutzer und Passwort aus Schritt 3.
  2. Verbinden.
- **Vom PC oder Mac:** Terminal (Windows: PowerShell) öffnen und eingeben:

```bash
ssh sonne@sonnenpilot.fritz.box
```

Bei der Frage nach dem „fingerprint“ einmal `yes` eingeben, dann das Passwort.

## 6. SonnenPilot installieren (ein Befehl)

In der SSH-Verbindung eingeben:

```bash
curl -fsSL https://raw.githubusercontent.com/postmicha-cyber/misc/main/solar/install-pi.sh | bash
```

Das Skript macht Folgendes:

- Es installiert Node.js und git und schaltet automatische Sicherheitsupdates ein.
- Es lädt SonnenPilot herunter.
- Es fragt nach deinem **Growatt-Benutzernamen und -Passwort**, also denselben Daten wie in der Shine-App.
  - Gespeichert wird nur der Growatt-Hash, nicht dein Klartext-Passwort.
  - Die Datei ist nur für deinen Benutzer lesbar.
  - Der Hash reicht aber für die Anmeldung bei Growatt. Behandle den Pi deshalb wie einen Schlüsselbund.
- Es richtet SonnenPilot als Dienst ein. Er startet nach Stromausfall oder Neustart von selbst.
- Am Ende zeigt es dir die **Adresse** und den **Zugangsschlüssel** für die App.

## 7. App aufs Handy

1. Im WLAN **http://sonnenpilot.fritz.box:8787** öffnen. Wichtig: mit `http://` und `:8787`.
2. Den Zugangsschlüssel aus Schritt 6 eingeben.
3. Auf den Home-Bildschirm legen:
   - **iPhone (Safari):** Teilen-Symbol → **„Zum Home-Bildschirm“**
   - **Galaxy (Samsung Internet oder Chrome):** Menü → **„Zum Startbildschirm hinzufügen“**
4. In der App unter **Einstellungen** eintragen:
   - Standort (📍-Knopf)
   - Module: kWp, Neigung, Himmelsrichtung. Zwei Balkonseiten = zwei Flächen.
   - Grundlast
5. In der **Shine-App die Zeitsegmente ausschalten**, sonst haben sie Vorrang vor SonnenPilot.

## 8. Von unterwegs (optional): VPN der FRITZ!Box

Die App ist absichtlich nur zu Hause erreichbar. **Gib Port 8787 nicht im Internet frei.** Für unterwegs hat die FRITZ!Box ein sicheres VPN eingebaut (WireGuard, ab FRITZ!OS 7.50):

1. **http://fritz.box** → **Internet → Freigaben → VPN (WireGuard)** → **Verbindung hinzufügen** → **Einzelgerät verbinden**.
2. Auf dem Handy die App **WireGuard** installieren, den angezeigten **QR-Code scannen** und VPN einschalten.
3. Jetzt funktioniert die SonnenPilot-App auch unterwegs, so als wärst du zu Hause.

Klappt das nicht, hat dein Anschluss oft kein eigenes IPv4 (z. B. „DS-Lite“ bei manchen Kabel- und Glasfaseranschlüssen). Dann nimm **Tailscale**: Installiere es auf dem Pi (`curl -fsSL https://tailscale.com/install.sh | sh` und dann `sudo tailscale up`) und auf dem Handy.

## 9. Pflege

| Was | Wie |
|---|---|
| SonnenPilot aktualisieren | Den Befehl aus Schritt 6 nochmal ausführen. Einstellungen und Messwerte bleiben erhalten. |
| Protokoll ansehen | `journalctl -u sonnenpilot -f` (Beenden mit Strg+C) |
| Neu starten | `sudo systemctl restart sonnenpilot` |
| Zugangsschlüssel vergessen | `grep APP_KEY ~/misc/solar/.env` |
| Growatt-Passwort geändert | `rm ~/misc/solar/.env`, dann den Befehl aus Schritt 6 erneut ausführen |
| System-Updates | laufen automatisch (Sicherheitsupdates) |
| Pi ausschalten | `sudo shutdown now`, erst dann den Stecker ziehen. Schont die Speicherkarte. |

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| `sonnenpilot.fritz.box` nicht gefunden | Stattdessen die IP aus der FRITZ!Box nehmen, z. B. `http://192.168.178.42:8787` |
| „Anmeldung bei Growatt fehlgeschlagen“ | Benutzername oder Passwort prüfen (Schritt 9: Growatt-Passwort geändert) |
| „Kein NOAH-Speicher gefunden“ | Seriennummer aus der Shine-App in `~/misc/solar/.env` bei `GROWATT_SN=` eintragen, dann neu starten |
| App zeigt „Wetter: …“-Fehler | Kurzzeitige Störung beim Wetterdienst. Die Automatik läuft mit der letzten Vorhersage weiter. |
| Pi stürzt ab oder startet neu | Fast immer liegt es am Netzteil: das offizielle verwenden |
