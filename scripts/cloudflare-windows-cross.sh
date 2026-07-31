#!/usr/bin/env bash
set -euo pipefail

./node_modules/.bin/tsc -b
./node_modules/.bin/vite build
command -v makensis >/dev/null 2>&1
