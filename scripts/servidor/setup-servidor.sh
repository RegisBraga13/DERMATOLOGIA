#!/bin/bash
# Configura o Mac mini como servidor do app. Rode com: sudo bash setup-servidor.sh
# Idempotente: pode rodar de novo sem estragar nada.
set -euo pipefail

PROJ="/Users/regisbraga/Documents/Codex/2026-09-28/github-app-connector-76869538009648d5b282a4bb21c3d157/PSIQUIATRIA"
PLIST_SRC="$PROJ/scripts/servidor/br.psiquiatria.app.plist"
PLIST_DST="/Library/LaunchDaemons/br.psiquiatria.app.plist"

[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo."; exit 1; }

echo "==> 1/4  Energia (pmset)"
pmset -a autorestart 1     # religa sozinho depois de queda de energia
pmset -a powernap 0        # sem soneca: nada de acordar/dormir pela metade
pmset -a disksleep 0       # disco nunca dorme
pmset -a sleep 0           # maquina nunca dorme
pmset -a womp 1            # acorda por rede (Wake on LAN)
pmset -g | egrep 'autorestart|powernap|disksleep| sleep|womp'

echo "==> 2/4  Daemon do Tailscale"
if launchctl print system/com.tailscale.tailscaled >/dev/null 2>&1; then
  echo "    ja instalado"
else
  /opt/homebrew/bin/tailscaled install-system-daemon
fi

echo "==> 3/4  LaunchDaemon do app"
install -m 644 -o root -g wheel "$PLIST_SRC" "$PLIST_DST"
launchctl bootout system/br.psiquiatria.app 2>/dev/null || true
launchctl bootstrap system "$PLIST_DST"
launchctl enable system/br.psiquiatria.app
sleep 3
launchctl print system/br.psiquiatria.app | egrep 'state|pid|last exit' || true

echo "==> 4/4  Teste local"
sleep 2
curl -s -o /dev/null -w "    127.0.0.1:8000 -> %{http_code}\n" http://127.0.0.1:8000/ || echo "    NAO RESPONDEU - veja ~/Library/Logs/psiquiatria-app.err.log"

cat <<'FIM'

Pronto. Falta o que so voce pode fazer (NAO precisa de sudo):

  tailscale up
      Abre o navegador para autenticar a maquina na sua tailnet.

  No painel https://login.tailscale.com/admin/dns
      Ligue MagicDNS e ligue HTTPS Certificates.

  tailscale serve --bg 8000
      Publica o app em https://<nome-da-maquina>.<sua-tailnet>.ts.net
      com certificado valido -- e o que faz voz e service worker funcionarem.

  tailscale serve status
      Confere o que ficou publicado.
FIM
