#!/usr/bin/env bash
set -euo pipefail

./node_modules/.bin/tsc -b
./node_modules/.bin/vite build

for tool in makensis clang lld curl unzip; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Ferramenta ausente: $tool" >&2
    exit 41
  }
done

echo "Ferramentas base disponíveis."
