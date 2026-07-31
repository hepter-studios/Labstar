#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
TARGET="x86_64-pc-windows-msvc"
OUTPUT_DIR="$ROOT/dist/downloads"
NSIS_ROOT="$TOOLS/nsis-root"
LLVM_ARCHIVE="$TOOLS/clang+llvm-18.1.8-x86_64-linux-gnu-ubuntu-18.04.tar.xz"
LLVM_DIR="$TOOLS/clang+llvm-18.1.8-x86_64-linux-gnu-ubuntu-18.04"
LLVM_URL="https://github.com/llvm/llvm-project/releases/download/llvmorg-18.1.8/clang+llvm-18.1.8-x86_64-linux-gnu-ubuntu-18.04.tar.xz"
LLVM_SHA256="54ec30358afcc9fb8aa74307db3046f5187f9fb89fb37064cdde906e062ebf36"
LOG_FILE="$TOOLS/cross-build.log"
STAGE="bootstrap"

mkdir -p "$TOOLS/nsis-debs" "$NSIS_ROOT" "$OUTPUT_DIR"
: > "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

log() { printf '\n[labstar-cross] %s\n' "$*"; }

publish_diagnostic() {
  local exit_code="$1"
  local line="$2"
  local command="$3"
  trap - ERR
  mkdir -p "$ROOT/dist"
  {
    echo "LABSTAR_WINDOWS_CROSS_DIAGNOSTIC"
    echo "stage=$STAGE"
    echo "exit_code=$exit_code"
    echo "line=$line"
    echo "command=$command"
    echo "commit=${CF_PAGES_COMMIT_SHA:-unknown}"
    echo "branch=${CF_PAGES_BRANCH:-unknown}"
    echo "--- tail ---"
    tail -n 160 "$LOG_FILE" 2>/dev/null || true
  } > "$ROOT/dist/cross-diagnostic.txt"
  printf '%s\n' '<!doctype html><meta charset="utf-8"><title>Labstar build diagnostic</title><body style="background:#05070d;color:#dce5f4;font:16px system-ui;padding:32px"><h1>Labstar Windows build diagnostic</h1><p>Temporary build probe. See <code>/cross-diagnostic.txt</code>.</p></body>' > "$ROOT/dist/index.html"
  exit 0
}
trap 'publish_diagnostic "$?" "$LINENO" "$BASH_COMMAND"' ERR

STAGE="frontend"
log "Validando frontend corrigido"
./node_modules/.bin/tsc -b
./node_modules/.bin/vite build

STAGE="nsis"
log "Preparando NSIS local sem sudo"
if ! command -v makensis >/dev/null 2>&1; then
  cd "$TOOLS/nsis-debs"
  apt-get download nsis nsis-common
  for deb in ./*.deb; do dpkg-deb -x "$deb" "$NSIS_ROOT"; done
  export PATH="$NSIS_ROOT/usr/bin:$PATH"
  export NSISDIR="$NSIS_ROOT/usr/share/nsis"
fi
makensis -VERSION

STAGE="llvm-download"
log "Baixando LLVM/Clang portátil verificado"
cd "$TOOLS"
if [[ ! -x "$LLVM_DIR/bin/clang" || ! -x "$LLVM_DIR/bin/lld-link" ]]; then
  rm -rf "$LLVM_DIR" "$LLVM_ARCHIVE"
  curl -fL --retry 3 --retry-delay 2 "$LLVM_URL" -o "$LLVM_ARCHIVE"
  printf '%s  %s\n' "$LLVM_SHA256" "$LLVM_ARCHIVE" | sha256sum -c -
  tar -xJf "$LLVM_ARCHIVE"
fi
export PATH="$LLVM_DIR/bin:$PATH"
export LD_LIBRARY_PATH="$LLVM_DIR/lib:${LD_LIBRARY_PATH:-}"
clang --version
lld-link --version

STAGE="rust"
log "Preparando Rust estável"
export PATH="$HOME/.cargo/bin:$PATH"
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o "$TOOLS/rustup-init.sh"
  sh "$TOOLS/rustup-init.sh" -y --profile minimal
  # shellcheck disable=SC1090
  source "$HOME/.cargo/env"
fi
rustup toolchain install stable --profile minimal
rustup default stable
rustup target add "$TARGET"
rustc --version
cargo --version

STAGE="cargo-xwin"
log "Preparando cargo-xwin"
export XWIN_CACHE_DIR="$TOOLS/xwin-cache"
if ! command -v cargo-xwin >/dev/null 2>&1; then
  cargo install --locked cargo-xwin
fi
cargo xwin --version

STAGE="tauri"
cd "$ROOT"
log "Gerando Labstar Windows x64 pelo Tauri 2"
npx --yes @tauri-apps/cli@2 build \
  --config src-tauri/tauri.cross.conf.json \
  --runner cargo-xwin \
  --target "$TARGET" \
  --bundles nsis

STAGE="bundle"
log "Localizando instalador NSIS"
INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*setup.exe' -print -quit 2>/dev/null || true)"
if [[ -z "$INSTALLER" ]]; then
  INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*.exe' -print -quit 2>/dev/null || true)"
fi
if [[ -z "$INSTALLER" || ! -f "$INSTALLER" ]]; then
  echo "Instalador NSIS não encontrado após o build." >&2
  exit 44
fi

cp "$INSTALLER" "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe"
SIZE_BYTES="$(wc -c < "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe" | tr -d ' ')"
SHA256="$(sha256sum "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe" | awk '{print $1}')"
SOURCE_SHA="${CF_PAGES_COMMIT_SHA:-unknown}"
SOURCE_BRANCH="${CF_PAGES_BRANCH:-build/windows-cross-cloudflare}"
cat > "$OUTPUT_DIR/build-info.txt" <<EOF
Labstar 11.0.0
source_branch=$SOURCE_BRANCH
source_sha=$SOURCE_SHA
base_app_sha=034a2b0cf92e6335970be0bfd36d6956822df249
target=$TARGET
bundle=nsis
size_bytes=$SIZE_BYTES
sha256=$SHA256
generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

trap - ERR
log "Instalador novo pronto: $OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe"
log "SHA256: $SHA256"
