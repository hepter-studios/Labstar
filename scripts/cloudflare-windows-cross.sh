#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
LLVM_ROOT="$TOOLS/llvm-root"
NSIS_ROOT="$TOOLS/nsis-root"
mkdir -p "$TOOLS/nsis-debs" "$NSIS_ROOT" "$TOOLS/llvm-debs" "$LLVM_ROOT"

./node_modules/.bin/tsc -b
./node_modules/.bin/vite build

# NSIS rootless
if ! command -v makensis >/dev/null 2>&1; then
  cd "$TOOLS/nsis-debs"
  apt-get download nsis nsis-common
  for deb in ./*.deb; do dpkg-deb -x "$deb" "$NSIS_ROOT"; done
  export PATH="$NSIS_ROOT/usr/bin:$PATH"
  export NSISDIR="$NSIS_ROOT/usr/share/nsis"
fi
makensis -VERSION

# LLVM/Clang rootless. Baixa os pacotes e dependências para a pasta do build.
if ! command -v clang >/dev/null 2>&1; then
  cd "$TOOLS/llvm-debs"
  mapfile -t PKGS < <(
    apt-cache depends --recurse --no-recommends --no-suggests --no-conflicts --no-breaks --no-replaces --no-enhances clang lld \
      | awk '/^[[:alnum:]][[:alnum:].:+-]*$/ {print $1}' \
      | sort -u
  )
  if (( ${#PKGS[@]} == 0 )); then
    echo "Não foi possível resolver os pacotes LLVM/Clang." >&2
    exit 51
  fi
  apt-get download "${PKGS[@]}"
  for deb in ./*.deb; do dpkg-deb -x "$deb" "$LLVM_ROOT"; done

  export PATH="$LLVM_ROOT/usr/bin:$PATH"
  LLVM_LIB_DIR="$(find "$LLVM_ROOT/usr/lib" -maxdepth 2 -type d -path '*/llvm-*/lib' -print -quit 2>/dev/null || true)"
  if [[ -n "$LLVM_LIB_DIR" ]]; then
    export LD_LIBRARY_PATH="$LLVM_LIB_DIR:$LLVM_ROOT/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
  else
    export LD_LIBRARY_PATH="$LLVM_ROOT/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
  fi
fi

command -v clang
clang --version
if command -v lld-link >/dev/null 2>&1; then
  lld-link --version
elif command -v ld.lld >/dev/null 2>&1; then
  ld.lld --version
else
  echo "LLVM foi extraído, mas lld-link/ld.lld não foi encontrado." >&2
  exit 52
fi

echo "LABSTAR_LLVM_ROOTLESS_READY"
