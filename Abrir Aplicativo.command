#!/bin/zsh

cd "$(dirname "$0")" || exit 1

app_port=$(python3 - <<'PY'
import os
from pathlib import Path

port = os.environ.get("PORT")
if not port and Path(".env").exists():
    for raw in Path(".env").read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            if key.strip() == "PORT":
                port = value.strip().strip('"').strip("'")
if not (port or "8000").isdigit() or not 1 <= int(port or "8000") <= 65535:
    raise SystemExit("PORT inválida no .env")
print(port or "8000")
PY
) || exit 1

app_url="http://127.0.0.1:${app_port}/"
app_log="/tmp/prototipo-mac-server.log"
app_temp=$(mktemp) || exit 1
trap 'rm -f "$app_temp"' EXIT
app_hash=$(shasum -a 256 src/App.js | awk '{print $1}') || exit 1

app_ready() {
  curl -fsS --max-time 2 "${app_url}src/App.js" -o "$app_temp" 2>/dev/null &&
    [[ "$(shasum -a 256 "$app_temp" | awk '{print $1}')" == "$app_hash" ]]
}

if lsof -nP -iTCP:"$app_port" -sTCP:LISTEN >/dev/null 2>&1; then
  if ! app_ready; then
    echo "A porta $app_port já está ocupada por outra versão ou serviço."
    echo "Feche o servidor antigo antes de abrir este teste. Nenhum processo foi encerrado."
    read -r '?Pressione Enter para fechar...'
    exit 1
  fi
else
  nohup python3 server.py >"$app_log" 2>&1 &
  for attempt in {1..30}; do
    if app_ready; then break; fi
    sleep 0.5
  done
  if ! app_ready; then
    echo "O servidor não iniciou. Últimas linhas de $app_log:"
    tail -n 25 "$app_log"
    read -r '?Pressione Enter para fechar...'
    exit 1
  fi
fi

open -a Safari "$app_url"
