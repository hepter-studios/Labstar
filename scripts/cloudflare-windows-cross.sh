#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
TARGET="x86_64-pc-windows-msvc"
mkdir -p "$TOOLS/nsis-debs" "$TOOLS/nsis-root"

./node_modules/.bin/tsc -b
./node_modules/.bin/vite build

if ! command -v makensis >/dev/null 2>&1; then
  cd "$TOOLS/nsis-debs"
  if command -v apt-get >/dev/null 2>&1; then apt-get download nsis nsis-common; else apt download nsis nsis-common; fi
  for deb in ./*.deb; do dpkg-deb -x "$deb" "$TOOLS/nsis-root"; done
  export PATH="$TOOLS/nsis-root/usr/bin:$PATH"
  export NSISDIR="$TOOLS/nsis-root/usr/share/nsis"
fi
makensis -VERSION

for tool in clang lld curl unzip; do command -v "$tool" >/dev/null 2>&1; done

export PATH="$HOME/.cargo/bin:$PATH"
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o "$TOOLS/rustup-init.sh"
  sh "$TOOLS/rustup-init.sh" -y --profile minimal
  source "$HOME/.cargo/env"
fi
rustup toolchain install stable --profile minimal
rustup default stable
rustup target add "$TARGET"
rustc --version
cargo --version

echo "Rust e ferramentas base prontos para cross-build."
