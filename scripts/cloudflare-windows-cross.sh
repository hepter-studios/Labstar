#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
TARGET="x86_64-pc-windows-msvc"
NSIS_ROOT="$TOOLS/nsis-root"
LLVM_ARCHIVE="$TOOLS/clang+llvm-18.1.8-x86_64-linux-gnu-ubuntu-18.04.tar.xz"
LLVM_DIR="$TOOLS/clang+llvm-18.1.8-x86_64-linux-gnu-ubuntu-18.04"
LLVM_URL="https://github.com/llvm/llvm-project/releases/download/llvmorg-18.1.8/clang+llvm-18.1.8-x86_64-linux-gnu-ubuntu-18.04.tar.xz"
LLVM_SHA256="54ec30358afcc9fb8aa74307db3046f5187f9fb89fb37064cdde906e062ebf36"

mkdir -p "$TOOLS/nsis-debs" "$NSIS_ROOT"

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

cd "$TOOLS"
rm -rf "$LLVM_DIR" "$LLVM_ARCHIVE"
curl -fL --retry 3 --retry-delay 2 "$LLVM_URL" -o "$LLVM_ARCHIVE"
printf '%s  %s\n' "$LLVM_SHA256" "$LLVM_ARCHIVE" | sha256sum -c -
tar -xJf "$LLVM_ARCHIVE"
export PATH="$LLVM_DIR/bin:$HOME/.cargo/bin:$PATH"
export LD_LIBRARY_PATH="$LLVM_DIR/lib:${LD_LIBRARY_PATH:-}"
clang --version
lld-link --version

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
rustup target list --installed | grep -F "$TARGET"

echo "LABSTAR_STAGE_RUST_OK"
