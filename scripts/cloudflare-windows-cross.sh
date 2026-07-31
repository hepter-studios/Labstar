#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
LLVM_ROOT="$TOOLS/llvm-root"
NSIS_ROOT="$TOOLS/nsis-root"
DIAG="$ROOT/dist/build-diagnostic.txt"
STAGE="inicio"
mkdir -p "$TOOLS/nsis-debs" "$NSIS_ROOT" "$TOOLS/llvm-debs" "$LLVM_ROOT"

fail_diag() {
  code=$?
  mkdir -p "$ROOT/dist"
  {
    echo "LABSTAR WINDOWS CROSS DIAGNOSTIC"
    echo "stage=$STAGE"
    echo "exit=$code"
    echo "--- apt policy ---"
    apt-cache policy clang lld 2>&1 || true
    echo "--- apt depends clang ---"
    apt-cache depends clang 2>&1 || true
    echo "--- apt depends lld ---"
    apt-cache depends lld 2>&1 || true
    echo "--- tools ---"
    command -v clang || true
    command -v clang-18 || true
    command -v clang-19 || true
    command -v lld-link || true
    command -v ld.lld || true
    command -v rustup || true
    command -v cargo || true
  } > "$DIAG"
  cat > "$ROOT/dist/index.html" <<'EOF'
<!doctype html><meta charset="utf-8"><title>Labstar cross diagnostic</title><body style="background:#05070d;color:#dce5f4;font:16px system-ui;padding:32px"><h1>Labstar — Windows build diagnostic</h1><p><a href="/build-diagnostic.txt">Abrir diagnóstico</a></p></body>
EOF
  exit 0
}
trap fail_diag ERR

STAGE="frontend"
./node_modules/.bin/tsc -b
./node_modules/.bin/vite build

STAGE="nsis"
if ! command -v makensis >/dev/null 2>&1; then
  cd "$TOOLS/nsis-debs"
  apt-get download nsis nsis-common
  for deb in ./*.deb; do dpkg-deb -x "$deb" "$NSIS_ROOT"; done
  export PATH="$NSIS_ROOT/usr/bin:$PATH"
  export NSISDIR="$NSIS_ROOT/usr/share/nsis"
fi
makensis -VERSION

STAGE="resolve-llvm"
cd "$TOOLS/llvm-debs"
CLANG_PKG="$(apt-cache depends clang | awk '/Depends: clang-[0-9]+/ {print $2; exit}')"
LLD_PKG="$(apt-cache depends lld | awk '/Depends: lld-[0-9]+/ {print $2; exit}')"
[[ -n "$CLANG_PKG" && -n "$LLD_PKG" ]]

STAGE="download-llvm"
apt-get download clang lld "$CLANG_PKG" "$LLD_PKG"

# Bibliotecas LLVM usadas pelos binários clang/lld.
for pkg in $(apt-cache depends "$CLANG_PKG" "$LLD_PKG" | awk '/Depends: (libllvm|libclang-cpp)[0-9]+/ {print $2}' | sort -u); do
  apt-get download "$pkg"
done

STAGE="extract-llvm"
for deb in ./*.deb; do dpkg-deb -x "$deb" "$LLVM_ROOT"; done
export PATH="$LLVM_ROOT/usr/bin:$PATH"
LLVM_LIB_DIR="$(find "$LLVM_ROOT/usr/lib" -maxdepth 2 -type d -path '*/llvm-*/lib' -print -quit 2>/dev/null || true)"
export LD_LIBRARY_PATH="${LLVM_LIB_DIR:+$LLVM_LIB_DIR:}$LLVM_ROOT/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"

STAGE="validate-llvm"
command -v clang
clang --version
(command -v lld-link && lld-link --version) || (command -v ld.lld && ld.lld --version)

mkdir -p "$ROOT/dist"
printf 'LABSTAR_LLVM_ROOTLESS_READY\n' > "$ROOT/dist/build-diagnostic.txt"
