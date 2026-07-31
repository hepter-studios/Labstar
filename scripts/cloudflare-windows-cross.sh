#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
TARGET="x86_64-pc-windows-msvc"
NSIS_ROOT="$TOOLS/nsis-root"
LLVM_ROOT="$TOOLS/llvm-root"
LLVM_DEBS="$TOOLS/llvm-debs"
OUTPUT_DIR="$ROOT/dist/downloads"
BUILD_LOG="$ROOT/.cross-build.log"
TAURI_LOG="$ROOT/.tauri-build.log"
STAGE="bootstrap"

mkdir -p "$TOOLS/nsis-debs" "$NSIS_ROOT" "$LLVM_ROOT" "$LLVM_DEBS"
: > "$BUILD_LOG"
exec > >(tee -a "$BUILD_LOG") 2>&1

publish_failure() {
  local status="$1"
  set +e
  mkdir -p "$ROOT/dist"
  {
    echo "LABSTAR_CROSS_BUILD_DIAGNOSTIC"
    echo "status=$status"
    echo "stage=$STAGE"
    echo "target=$TARGET"
    echo "base_app_sha=034a2b0cf92e6335970be0bfd36d6956822df249"
    echo "builder_commit=${CF_PAGES_COMMIT_SHA:-unknown}"
    echo "--- last output ---"
    tail -n 500 "$BUILD_LOG" 2>/dev/null || true
  } > "$ROOT/dist/cross-diagnostic.txt"
  cat > "$ROOT/dist/index.html" <<'EOF'
<!doctype html><meta charset="utf-8"><title>Labstar Windows build diagnostic</title><body style="background:#05070d;color:#dce5f4;font:16px system-ui;padding:32px"><h1>Labstar Windows build diagnostic</h1><p>Build temporário e isolado. Consulte <code>/cross-diagnostic.txt</code>.</p></body>
EOF
  exit 0
}
trap 'publish_failure $?' ERR

STAGE="frontend-typecheck"
./node_modules/.bin/tsc -b
STAGE="frontend-vite"
./node_modules/.bin/vite build
mkdir -p "$OUTPUT_DIR"

STAGE="nsis-download"
if ! command -v makensis >/dev/null 2>&1; then
  cd "$TOOLS/nsis-debs"
  apt-get download nsis nsis-common
  for deb in ./*.deb; do dpkg-deb -x "$deb" "$NSIS_ROOT"; done
  export PATH="$NSIS_ROOT/usr/bin:$PATH"
  export NSISDIR="$NSIS_ROOT/usr/share/nsis"
fi
STAGE="nsis-verify"
makensis -VERSION

STAGE="llvm-resolve"
CLANG_PACKAGE="$(apt-cache depends clang | awk '/Depends: clang-[0-9]+/ {print $2; exit}')"
if [[ -z "$CLANG_PACKAGE" ]]; then
  echo "Não foi possível resolver a versão do clang disponível no builder." >&2
  false
fi
LLVM_VERSION="${CLANG_PACKAGE#clang-}"
echo "LLVM_VERSION=$LLVM_VERSION"

STAGE="llvm-download"
cd "$LLVM_DEBS"
rm -f ./*.deb
for pkg in \
  "clang-$LLVM_VERSION" \
  "lld-$LLVM_VERSION" \
  "libllvm$LLVM_VERSION" \
  "libclang-cpp$LLVM_VERSION" \
  "libclang-common-$LLVM_VERSION-dev" \
  "llvm-$LLVM_VERSION-linker-tools"; do
  echo "Downloading $pkg"
  apt-get download "$pkg"
done

STAGE="llvm-extract"
for deb in ./*.deb; do dpkg-deb -x "$deb" "$LLVM_ROOT"; done

export PATH="$LLVM_ROOT/usr/bin:$LLVM_ROOT/usr/lib/llvm-$LLVM_VERSION/bin:$HOME/.cargo/bin:$PATH"
export LD_LIBRARY_PATH="$LLVM_ROOT/usr/lib/x86_64-linux-gnu:$LLVM_ROOT/usr/lib/llvm-$LLVM_VERSION/lib:${LD_LIBRARY_PATH:-}"

STAGE="llvm-verify-clang"
"clang-$LLVM_VERSION" --version
STAGE="llvm-verify-lld"
if command -v "lld-link-$LLVM_VERSION" >/dev/null 2>&1; then
  "lld-link-$LLVM_VERSION" --version
elif command -v lld-link >/dev/null 2>&1; then
  lld-link --version
elif command -v ld.lld >/dev/null 2>&1; then
  ld.lld --version
else
  echo "LLD não encontrado após extração local." >&2
  false
fi

STAGE="rustup-install"
if ! command -v rustup >/dev/null 2>&1; then
  cd "$TOOLS"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o rustup-init.sh
  sh rustup-init.sh -y --profile minimal
  source "$HOME/.cargo/env"
fi

STAGE="rust-toolchain"
rustup toolchain install stable --profile minimal
rustup default stable
rustup target add "$TARGET"
rustc --version
cargo --version

export XWIN_CACHE_DIR="$TOOLS/xwin-cache"
STAGE="cargo-xwin-install"
if ! command -v cargo-xwin >/dev/null 2>&1; then
  cargo install --locked cargo-xwin
fi
STAGE="cargo-xwin-verify"
cargo xwin --version

cd "$ROOT"
STAGE="tauri-build"
set +e
npx --yes @tauri-apps/cli@2 build \
  --config src-tauri/tauri.cross.conf.json \
  --runner cargo-xwin \
  --target "$TARGET" \
  --bundles nsis > "$TAURI_LOG" 2>&1
TAURI_STATUS=$?
set -e
if [[ $TAURI_STATUS -ne 0 ]]; then
  cat "$TAURI_LOG" >> "$BUILD_LOG"
  publish_failure "$TAURI_STATUS"
fi

STAGE="installer-locate"
INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*setup.exe' -print -quit 2>/dev/null || true)"
if [[ -z "$INSTALLER" ]]; then
  INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*.exe' -print -quit 2>/dev/null || true)"
fi
if [[ -z "$INSTALLER" || ! -f "$INSTALLER" ]]; then
  echo "Instalador NSIS não encontrado após o build." >&2
  false
fi

STAGE="installer-publish"
cp "$INSTALLER" "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe"
SIZE_BYTES="$(wc -c < "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe" | tr -d ' ')"
SHA256="$(sha256sum "$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe" | awk '{print $1}')"
cat > "$OUTPUT_DIR/build-info.txt" <<EOF
Labstar 11.0.0
base_app_sha=034a2b0cf92e6335970be0bfd36d6956822df249
builder_commit=${CF_PAGES_COMMIT_SHA:-unknown}
target=$TARGET
bundle=nsis
size_bytes=$SIZE_BYTES
sha256=$SHA256
generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
rm -f "$ROOT/dist/cross-diagnostic.txt"
echo "LABSTAR_WINDOWS_INSTALLER_READY path=$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe size=$SIZE_BYTES sha256=$SHA256"
