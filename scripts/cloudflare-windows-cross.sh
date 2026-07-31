#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TOOLS="$ROOT/.cross-tools"
TARGET="x86_64-pc-windows-msvc"
NSIS_ROOT="$TOOLS/nsis-root"
LLVM_ROOT="$TOOLS/llvm-root"
LLVM_DEBS="$TOOLS/llvm-debs"

mkdir -p "$TOOLS/nsis-debs" "$NSIS_ROOT" "$LLVM_ROOT" "$LLVM_DEBS"

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
rustup target list --installed | grep -F "$TARGET"

echo "LABSTAR_STAGE_RUST_OK llvm=$LLVM_VERSION target=$TARGET"
