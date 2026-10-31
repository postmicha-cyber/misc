#!/usr/bin/env bash
# SonnenPilot auf einem Raspberry Pi (Raspberry Pi OS Lite) einrichten oder aktualisieren.
#
# Erstinstallation (auf dem Pi, per SSH):
#   curl -fsSL https://raw.githubusercontent.com/postmicha-cyber/misc/main/solar/install-pi.sh | bash
# Später aktualisieren: dasselbe nochmal ausführen – Einstellungen und Messdaten bleiben erhalten.
set -euo pipefail

REPO="${SONNENPILOT_REPO:-https://github.com/postmicha-cyber/misc.git}"
BRANCH="${SONNENPILOT_BRANCH:-main}"
DIR="${SONNENPILOT_DIR:-$HOME/misc}"
APP="$DIR/solar"
SERVICE=/etc/systemd/system/sonnenpilot.service

say() { printf '\n\033[1;33m☀️  %s\033[0m\n' "$*"; }

if [ "$(id -u)" = "0" ]; then echo "Bitte als normaler Benutzer starten (nicht mit sudo) – sudo wird bei Bedarf selbst gefragt."; exit 1; fi

say "Pakete installieren (Node.js, git) …"
sudo apt-get update -qq
sudo apt-get install -y -qq nodejs git unattended-upgrades >/dev/null
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then echo "Node.js $NODE_MAJOR ist zu alt (mindestens 18 nötig). Bitte aktuelles Raspberry Pi OS verwenden."; exit 1; fi
echo "Node.js $(node -v) ✓"
# Sicherheitsupdates für das System automatisch einspielen
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

say "SonnenPilot holen …"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" pull -q --ff-only origin "$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO" "$DIR"
fi
echo "Version $(git -C "$DIR" log -1 --format='%h vom %cd' --date=short) ✓"

if [ ! -f "$APP/.env" ]; then
  say "Growatt-Zugang eintragen (wie in der Shine-App)"
  cp "$APP/.env.example" "$APP/.env"
  read -r -p "Growatt-Benutzername: " GU < /dev/tty
  read -r -s -p "Growatt-Passwort (wird nicht angezeigt): " GP < /dev/tty; echo
  # Nur den Growatt-Hash speichern, nicht das Klartext-Passwort
  GH=$(cd "$APP" && GP="$GP" node -e "console.log(require('./growatt.js').hashPassword(process.env.GP))")
  KEY=$(node -e "console.log(require('crypto').randomBytes(9).toString('base64url'))")
  GU=$(printf '%s' "$GU" | sed 's/[&|\\]/\\&/g')   # Sonderzeichen für sed schützen
  sed -i "s|^GROWATT_USER=.*|GROWATT_USER=$GU|; s|^GROWATT_PASSWORD=.*|GROWATT_PASSWORD=|; s|^# GROWATT_PASSWORD_HASH=.*|GROWATT_PASSWORD_HASH=$GH|; s|^APP_KEY=.*|APP_KEY=$KEY|" "$APP/.env"
  chmod 600 "$APP/.env"
  unset GP
fi

say "Dienst einrichten (startet automatisch nach Stromausfall) …"
sudo tee "$SERVICE" >/dev/null <<EOF
[Unit]
Description=SonnenPilot – Balkonkraftwerk-Speicher wettergesteuert
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$APP
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=20

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable -q sonnenpilot
sudo systemctl restart sonnenpilot
sleep 3

KEY=$(grep -E '^APP_KEY=' "$APP/.env" | cut -d= -f2)
IP=$(hostname -I | awk '{print $1}')
PORT=$(grep -E '^PORT=' "$APP/.env" | cut -d= -f2); PORT=${PORT:-8787}
if systemctl is-active -q sonnenpilot; then
  say "Fertig!"
  echo "  Am Handy (im WLAN) öffnen:  http://$(hostname).fritz.box:$PORT   oder   http://$IP:$PORT"
  echo "  Zugangsschlüssel:           ${KEY:-siehe: journalctl -u sonnenpilot | grep Zugangsschlüssel}"
  echo "  Protokoll ansehen:          journalctl -u sonnenpilot -f"
else
  echo "Der Dienst läuft nicht. Fehler ansehen mit: journalctl -u sonnenpilot -n 50"; exit 1
fi
