#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
TARGET="x86_64-pc-windows-msvc"
NSIS_ROOT="$TOOLS/nsis-root"
LLVM_ROOT="$TOOLS/llvm-root"
LLVM_DEBS="$TOOLS/llvm-debs"
OUTPUT_DIR="$ROOT/dist/downloads"

mkdir -p "$TOOLS/nsis-debs" "$NSIS_ROOT" "$LLVM_ROOT" "$LLVM_DEBS" "$OUTPUT_DIR"

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

CLANG_PACKAGE="$(apt-cache depends clang | awk '/Depends: clang-[0-9]+/ {print $2; exit}')"
if [[ -z "$CLANG_PACKAGE" ]]; then
  echo "Não foi possível resolver a versão do clang disponível no builder." >&2
  exit 51
fi
LLVM_VERSION="${CLANG_PACKAGE#clang-}"

cd "$LLVM_DEBS"
rm -f ./*.deb
for pkg in \
  "clang-$LLVM_VERSION" \
  "lld-$LLVM_VERSION" \
  "libllvm$LLVM_VERSION" \
  "libclang-cpp$LLVM_VERSION" \
  "libclang-common-$LLVM_VERSION-dev" \
  "llvm-$LLVM_VERSION-linker-tools"; do
  apt-get download "$pkg"
done

for deb in ./*.deb; do dpkg-deb -x "$deb" "$LLVM_ROOT"; done

export PATH="$LLVM_ROOT/usr/bin:$LLVM_ROOT/usr/lib/llvm-$LLVM_VERSION/bin:$HOME/.cargo/bin:$PATH"
export LD_LIBRARY_PATH="$LLVM_ROOT/usr/lib/x86_64-linux-gnu:$LLVM_ROOT/usr/lib/llvm-$LLVM_VERSION/lib:${LD_LIBRARY_PATH:-}"

"clang-$LLVM_VERSION" --version
if command -v "lld-link-$LLVM_VERSION" >/dev/null 2>&1; then
  "lld-link-$LLVM_VERSION" --version
else
  lld-link --version
fi

if ! command -v rustup >/dev/null 2>&1; then
  cd "$TOOLS"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o rustup-init.sh
  sh rustup-init.sh -y --profile minimal
  # shellcheck disable=SC1090
  source "$HOME/.cargo/env"
fi

rustup toolchain install stable --profile minimal
rustup default stable
rustup target add "$TARGET"
rustc --version
cargo --version

export XWIN_CACHE_DIR="$TOOLS/xwin-cache"
if ! command -v cargo-xwin >/dev/null 2>&1; then
  cargo install --locked cargo-xwin
fi
cargo xwin --version

cd "$ROOT"
npx --yes @tauri-apps/cli@2 build \
  --config src-tauri/tauri.cross.conf.json \
  --runner cargo-xwin \
  --target "$TARGET" \
  --bundles nsis

INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*setup.exe' -print -quit 2>/dev/null || true)"
if [[ -z "$INSTALLER" ]]; then
  INSTALLER="$(find "$ROOT/src-tauri/target/$TARGET/release/bundle/nsis" -maxdepth 1 -type f -name '*.exe' -print -quit 2>/dev/null || true)"
fi

if [[ -z "$INSTALLER" || ! -f "$INSTALLER" ]]; then
  echo "Instalador NSIS não encontrado após o build Tauri." >&2
  exit 60
fi

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

echo "LABSTAR_WINDOWS_INSTALLER_READY path=$OUTPUT_DIR/Labstar_11.0.0_x64-setup.exe size=$SIZE_BYTES sha256=$SHA256"
