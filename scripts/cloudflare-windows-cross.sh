#!/usr/bin/env bash
set -uo pipefail

ROOT="$(pwd)"
TARGET="x86_64-pc-windows-msvc"
OUTPUT_DIR="$ROOT/dist/downloads"
BUILD_INFO="$OUTPUT_DIR/build-info.txt"

log() { printf '\n[labstar-cross] %s\n' "$*"; }

probe_fail() {
  local stage="$1"
  local detail="${2:-falha}"
  rm -rf "$ROOT/dist"
  mkdir -p "$ROOT/dist"
  cat > "$ROOT/dist/index.html" <<EOF
<!doctype html><meta charset="utf-8"><title>Labstar cross-build diagnostic</title>
<body style="background:#05070d;color:#dce5f4;font:16px system-ui;padding:32px">
<h1>LABSTAR_CROSS_FAIL_${stage}</h1><pre>${detail}</pre>
</body>
EOF
  printf 'stage=%s\ndetail=%s\n' "$stage" "$detail" > "$ROOT/dist/cross-build-diagnostic.txt"
  exit 0
}

log "Validando frontend"
./node_modules/.bin/tsc -b || probe_fail "FRONTEND_TSC"
./node_modules/.bin/vite build || probe_fail "FRONTEND_VITE"

log "Verificando ferramentas Linux para NSIS/cross-link"
missing=()
for tool in makensis clang lld curl unzip; do
  command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
done

if (( ${#missing[@]} > 0 )); then
  log "Ferramentas ausentes: ${missing[*]}"
  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo apt-get update -y || probe_fail "APT_UPDATE_SUDO"
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nsis clang lld llvm curl ca-certificates unzip xz-utils pkg-config || probe_fail "APT_INSTALL_SUDO"
  elif [[ "$(id -u)" == "0" ]]; then
    apt-get update -y || probe_fail "APT_UPDATE_ROOT"
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nsis clang lld llvm curl ca-certificates unzip xz-utils pkg-config || probe_fail "APT_INSTALL_ROOT"
  else
    probe_fail "APT_NO_PRIVILEGE" "missing=${missing[*]};uid=$(id -u)"
  fi
fi

export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v rustup >/dev/null 2>&1; then
  log "Instalando Rust"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup-init.sh || probe_fail "RUSTUP_DOWNLOAD"
  sh /tmp/rustup-init.sh -y --profile minimal || probe_fail "RUSTUP_INSTALL"
  # shellcheck disable=SC1090
  source "$HOME/.cargo/env" || probe_fail "RUST_ENV"
fi

log "Preparando target Windows MSVC"
rustup toolchain install stable --profile minimal || probe_fail "RUST_TOOLCHAIN"
rustup default stable || probe_fail "RUST_DEFAULT"
rustup target add "$TARGET" || probe_fail "RUST_TARGET"

if ! command -v cargo-xwin >/dev/null 2>&1; then
  log "Instalando cargo-xwin"
  cargo install --locked cargo-xwin || probe_fail "CARGO_XWIN_INSTALL"
fi

log "Compilando Tauri para Windows"
npx --yes @tauri-apps/cli@2 build \
  --config src-tauri/tauri.cross.conf.json \
  --runner cargo-xwin \
  --target "$TARGET" \
  --bundles nsis || probe_fail "TAURI_WINDOWS_BUILD"

log "Localizando instalador"
INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*setup.exe' -print -quit 2>/dev/null || true)"
if [[ -z "$INSTALLER" ]]; then
  INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*.exe' -print -quit 2>/dev/null || true)"
fi
[[ -n "$INSTALLER" && -f "$INSTALLER" ]] || probe_fail "INSTALLER_NOT_FOUND"

mkdir -p "$OUTPUT_DIR"
cp "$INSTALLER" "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe" || probe_fail "INSTALLER_COPY"

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
MAX_PAGES_ASSET_BYTES=$((25 * 1024 * 1024))
if (( SIZE_BYTES > MAX_PAGES_ASSET_BYTES )); then
  probe_fail "PAGES_FILE_LIMIT" "size_bytes=$SIZE_BYTES"
fi

log "Instalador pronto: dist/downloads/Labstar_11.0.0_x64-setup.exe ($SIZE_BYTES bytes)"
