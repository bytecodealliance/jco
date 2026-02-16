#!/bin/bash

# Update WASI Preview 3 WIT dependencies and regenerate TypeScript types.
# Requires wkg (https://github.com/bytecodealliance/wasm-pkg-tools)
set -ex

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WIT_DIR="$REPO_ROOT/packages/jco/test/fixtures/p3/wit"
TYPES_DIR="$REPO_ROOT/packages/preview3-shim/types"

# Update world.wit to the latest version from the registry and we extract it from there
VERSION=$(grep -oP '@\K[0-9a-z.\-]+' "$WIT_DIR/world.wit" | head -1)
if [ -z "$VERSION" ]; then
  echo "Error: could not extract version from world.wit" >&2
  exit 1
fi

echo "Fetching WASI packages at version $VERSION"

PACKAGES=(clocks cli filesystem http random sockets)

rm -rf "$WIT_DIR/deps"
for pkg in "${PACKAGES[@]}"; do
  dir="$WIT_DIR/deps/wasi-${pkg}-${VERSION}"
  mkdir -p "$dir"
  wkg get "wasi:${pkg}@${VERSION}" --format wit -o "$dir/package.wit" --overwrite
done

cd "$REPO_ROOT"
cargo xtask generate wasi-types preview3

echo "Done. Review the changes in:"
echo "  $WIT_DIR/deps/"
echo "  $TYPES_DIR/"
