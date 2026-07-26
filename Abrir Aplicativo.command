#!/bin/zsh

cd "$(dirname "$0")" || exit 1

if ! lsof -ti tcp:8000 >/dev/null 2>&1; then
  nohup python3 server.py >/tmp/prototipo-mac-server.log 2>&1 &
  sleep 1
fi

open "http://127.0.0.1:8000/"
