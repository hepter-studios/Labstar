#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
LLVM_ROOT="$TOOLS/llvm-root"
NSIS_ROOT="$TOOLS/nsis-root"
mkdir -p "$TOOLS/nsis-debs" "$NSIS_ROOT" "$TOOLS/llvm-debs" "$LLVM_ROOT"

./node_modules/.bin/tsc -b
./node_modules/.bin/vite build

if ! command -v makensis >/dev/null 2>&1; then
  cd "$TOOLS/nsis-debs"
  apt-get download nsis nsis-common
  for deb in ./*.deb; do dpkg-deb -x "$deb" "$NSIS_ROOT"; done
  export PATH="$NSIS_ROOT/usr/bin:$PATH"
  export NSISDIR="$NSIS_ROOT/usr/share/nsis"
fi
makensis -VERSION

cd "$TOOLS/llvm-debs"
apt-get download clang-18 lld-18 libllvm18 libclang-cpp18 libclang-common-18-dev
for deb in ./*.deb; do dpkg-deb -x "$deb" "$LLVM_ROOT"; done

export PATH="$LLVM_ROOT/usr/bin:$LLVM_ROOT/usr/lib/llvm-18/bin:$PATH"
export LD_LIBRARY_PATH="$LLVM_ROOT/usr/lib/x86_64-linux-gnu:$LLVM_ROOT/usr/lib/llvm-18/lib:${LD_LIBRARY_PATH:-}"

CLANG_BIN="$(command -v clang-18 || command -v clang)"
LLD_BIN="$(command -v lld-link-18 || command -v lld-link || command -v ld.lld-18 || command -v ld.lld)"
"$CLANG_BIN" --version
"$LLD_BIN" --version

echo "LABSTAR_LLVM18_READY"
