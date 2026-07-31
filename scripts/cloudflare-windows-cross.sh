#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
TARGET="x86_64-pc-windows-msvc"
OUTPUT_DIR="$ROOT/dist/downloads"
mkdir -p "$TOOLS/nsis-debs" "$TOOLS/nsis-root"

log() { printf '\n[labstar-cross] %s\n' "$*"; }

log "Validando frontend"
./node_modules/.bin/tsc -b
./node_modules/.bin/vite build

log "Preparando NSIS local"
if ! command -v makensis >/dev/null 2>&1; then
  cd "$TOOLS/nsis-debs"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get download nsis nsis-common
  elif command -v apt >/dev/null 2>&1; then
    apt download nsis nsis-common
  else
    echo "APT indisponível para baixar NSIS localmente." >&2
    exit 42
  fi
  for deb in ./*.deb; do
    dpkg-deb -x "$deb" "$TOOLS/nsis-root"
  done
  export PATH="$TOOLS/nsis-root/usr/bin:$PATH"
  export NSISDIR="$TOOLS/nsis-root/usr/share/nsis"
fi
makensis -VERSION

for tool in clang lld curl unzip; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Ferramenta de cross-build ausente: $tool" >&2; exit 43; }
done

export PATH="$HOME/.cargo/bin:$PATH"
if ! command -v rustup >/dev/null 2>&1; then
  log "Instalando Rust localmente"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o "$TOOLS/rustup-init.sh"
  sh "$TOOLS/rustup-init.sh" -y --profile minimal
  # shellcheck disable=SC1090
  source "$HOME/.cargo/env"
fi

log "Configurando toolchain Rust"
rustup toolchain install stable --profile minimal
rustup default stable
rustup target add "$TARGET"
rustc --version
cargo --version

if ! command -v cargo-xwin >/dev/null 2>&1; then
  log "Instalando cargo-xwin"
  cargo install --locked cargo-xwin
fi
cargo xwin --version

cd "$ROOT"
log "Gerando NSIS Windows com Tauri 2"
npx --yes @tauri-apps/cli@2 build \
  --config src-tauri/tauri.cross.conf.json \
  --runner cargo-xwin \
  --target "$TARGET" \
  --bundles nsis

log "Localizando instalador"
INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*setup.exe' -print -quit 2>/dev/null || true)"
if [[ -z "$INSTALLER" ]]; then
  INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*.exe' -print -quit 2>/dev/null || true)"
fi
if [[ -z "$INSTALLER" || ! -f "$INSTALLER" ]]; then
  echo "Instalador NSIS não encontrado após o build." >&2
  exit 44
fi

mkdir -p "$OUTPUT_DIR"
cp "$INSTALLER" "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe"

SIZE_BYTES="$(wc -c < "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe" | tr -d ' ')"
MAX_PAGES_ASSET_BYTES=$((25 * 1024 * 1024))
if (( SIZE_BYTES > MAX_PAGES_ASSET_BYTES )); then
  echo "EXE maior que o limite de 25 MiB do Cloudflare Pages: $SIZE_BYTES bytes" >&2
  exit 45
fi

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
generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

log "Instalador pronto: $OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe ($SIZE_BYTES bytes)"
