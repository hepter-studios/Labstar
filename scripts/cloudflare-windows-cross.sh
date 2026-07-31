#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TARGET="x86_64-pc-windows-msvc"
OUTPUT_DIR="$ROOT/dist/downloads"
BUILD_INFO="$OUTPUT_DIR/build-info.txt"

log() {
  printf '\n[labstar-cross] %s\n' "$*"
}

log "Validando frontend antes do cross-build"
./node_modules/.bin/tsc -b
./node_modules/.bin/vite build

log "Instalando dependências do empacotamento NSIS"
if command -v sudo >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    nsis clang lld llvm curl ca-certificates unzip xz-utils pkg-config
else
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    nsis clang lld llvm curl ca-certificates unzip xz-utils pkg-config
fi

export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v rustup >/dev/null 2>&1; then
  log "Instalando Rust"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  # shellcheck disable=SC1090
  source "$HOME/.cargo/env"
fi

log "Preparando toolchain Rust para Windows MSVC"
rustup toolchain install stable --profile minimal
rustup default stable
rustup target add "$TARGET"

if ! command -v cargo-xwin >/dev/null 2>&1; then
  log "Instalando cargo-xwin"
  cargo install --locked cargo-xwin
fi

log "Compilando Labstar para Windows e gerando NSIS"
npx --yes @tauri-apps/cli@2 build \
  --config src-tauri/tauri.cross.conf.json \
  --runner cargo-xwin \
  --target "$TARGET" \
  --bundles nsis

log "Localizando instalador gerado"
INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*setup.exe' -print -quit 2>/dev/null || true)"
if [[ -z "$INSTALLER" ]]; then
  INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*.exe' -print -quit 2>/dev/null || true)"
fi

if [[ -z "$INSTALLER" || ! -f "$INSTALLER" ]]; then
  echo "Instalador NSIS não foi encontrado após o build." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
cp "$INSTALLER" "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe"

SOURCE_SHA="${CF_PAGES_COMMIT_SHA:-${GITHUB_SHA:-unknown}}"
SOURCE_BRANCH="${CF_PAGES_BRANCH:-build/windows-cross-cloudflare}"
{
  echo "Labstar 11.0.0"
  echo "source_branch=$SOURCE_BRANCH"
  echo "source_sha=$SOURCE_SHA"
  echo "target=$TARGET"
  echo "bundle=nsis"
  echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$BUILD_INFO"

SIZE_BYTES="$(wc -c < "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe" | tr -d ' ')"
log "Instalador pronto: dist/downloads/Labstar_11.0.0_x64-setup.exe ($SIZE_BYTES bytes)"

# Cloudflare Pages limita arquivos individuais. Falhar explicitamente se o EXE
# não puder ser publicado pelo Pages em vez de produzir um deploy enganoso.
MAX_PAGES_ASSET_BYTES=$((25 * 1024 * 1024))
if (( SIZE_BYTES > MAX_PAGES_ASSET_BYTES )); then
  echo "O EXE ultrapassa o limite de 25 MiB por arquivo do Cloudflare Pages." >&2
  exit 1
fi
