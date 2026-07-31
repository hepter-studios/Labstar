#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
mkdir -p "$TOOLS/nsis-debs" "$TOOLS/nsis-root"

./node_modules/.bin/tsc -b
./node_modules/.bin/vite build

if ! command -v makensis >/dev/null 2>&1; then
  cd "$TOOLS/nsis-debs"
  if command -v apt-get >/dev/null 2>&1; then apt-get download nsis nsis-common; else apt download nsis nsis-common; fi
  for deb in ./*.deb; do dpkg-deb -x "$deb" "$TOOLS/nsis-root"; done
  export PATH="$TOOLS/nsis-root/usr/bin:$PATH"
  export NSISDIR="$TOOLS/nsis-root/usr/share/nsis"
fi
makensis -VERSION
command -v clang >/dev/null 2>&1
