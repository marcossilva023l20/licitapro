#!/usr/bin/env bash
# Emite até 10 pedaços (base64) da logo como anotações do job.
# Serve de canal de volta: este ambiente lê as anotações pela API do GitHub.
set -euo pipefail

inicio="${1:-1}"
fim="${2:-10}"
total="$(ls /tmp/pedacos | wc -l | tr -d ' ')"

i=0
for arquivo in $(ls /tmp/pedacos/pedaco*.txt | sed -n "${inicio},${fim}p"); do
  i=$((i + 1))
  numero="$(printf '%02d' "$i")"
  echo "::notice title=logo-pedaco-${numero}-de-${total}::$(cat "$arquivo")"
done
