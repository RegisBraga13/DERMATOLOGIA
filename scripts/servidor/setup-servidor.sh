#!/bin/bash
# Configura o Mac mini como servidor do app. Rode com: sudo bash setup-servidor.sh
# Idempotente: pode rodar de novo sem estragar nada.
set -euo pipefail

PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLIST_SRC="$PROJ/scripts/servidor/br.psiquiatria.app.plist"
PLIST_DST="/Library/LaunchDaemons/br.psiquiatria.app.plist"

[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo."; exit 1; }
APP_USER="${SUDO_USER:-}"
[ -n "$APP_USER" ] && [ "$APP_USER" != "root" ] || { echo "Rode com sudo a partir da conta que usara o aplicativo."; exit 1; }
APP_HOME="$(dscl . -read "/Users/$APP_USER" NFSHomeDirectory | awk '{print $2}')"
[ -n "$APP_HOME" ] || { echo "Nao foi possivel localizar o diretorio do usuario."; exit 1; }
[ -x "$PROJ/.venv/bin/python" ] || { echo "Crie o ambiente Python em $PROJ/.venv antes de instalar."; exit 1; }

# O Tailscale entrega o app a outros aparelhos mesmo com HOST=127.0.0.1:
# exigir login na aplicação antes de ativar esse serviço.
if ! grep -q '^SUPABASE_URL=https://' "$PROJ/.env" || ! grep -Eq '^SUPABASE_PUBLISHABLE_KEY=.+$' "$PROJ/.env"; then
  echo "Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY em $PROJ/.env antes de publicar via Tailscale."
  exit 1
fi

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
PLIST_TEMP="$(mktemp)"
trap 'rm -f "$PLIST_TEMP"' EXIT
python3 - "$PLIST_SRC" "$PROJ" "$APP_USER" "$APP_HOME" > "$PLIST_TEMP" <<'PY'
from pathlib import Path
from html import escape
import sys
template = Path(sys.argv[1]).read_text()
for placeholder, value in zip(("__PROJECT_ROOT__", "__APP_USER__", "__USER_HOME__"), sys.argv[2:]):
    template = template.replace(placeholder, escape(value, quote=True))
sys.stdout.write(template)
PY
plutil -lint "$PLIST_TEMP"
install -m 644 -o root -g wheel "$PLIST_TEMP" "$PLIST_DST"
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
