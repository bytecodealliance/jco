#!/usr/bin/env bash
# Temporary source build until Perry publishes its WASI compiler/runtime.
# CI hashes this recipe for the finished-toolchain cache; update pins here.
set -euo pipefail

perry_revision=3945beb23ebeca54846a30d89cb4971de59b0c6c
rust_toolchain=nightly-2026-10-08
wasi_sdk_version=34
wasi_sdk_sha256=b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4

if [[ "$(uname -s)-$(uname -m)" != Linux-x86_64 ]]; then
    echo 'The pinned Perry CI toolchain supports Linux x86_64 only.' >&2
    exit 1
fi

destination=${1:?Usage: build-perry-wasi.sh OUTPUT_DIRECTORY}
mkdir -p "$destination"
destination=$(cd "$destination" && pwd)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

# Install LLVM development libraries only on a cache miss. A local caller can
# reuse an existing installation by setting LLVM_SYS_221_PREFIX.
if [[ -z "${LLVM_SYS_221_PREFIX:-}" ]]; then
    curl --fail --location --retry 3 https://apt.llvm.org/llvm-snapshot.gpg.key \
        -o "$scratch/llvm.asc"
    fingerprint=$(gpg --show-keys --with-colons "$scratch/llvm.asc" | awk -F: '$1 == "fpr" { print $10; exit }')
    [[ "$fingerprint" == 6084F3CF814B57C1CF12EFD515CF4D18AF4F7421 ]]
    sudo install -m 644 "$scratch/llvm.asc" /usr/share/keyrings/jco-llvm.asc
    # Match the pinned ubuntu-24.04 CI runner, rather than a moving latest image.
    echo 'deb [signed-by=/usr/share/keyrings/jco-llvm.asc] https://apt.llvm.org/noble/ llvm-toolchain-noble-22 main' \
        | sudo tee /etc/apt/sources.list.d/jco-llvm22.list >/dev/null
    sudo apt-get update -o Acquire::Retries=3
    sudo apt-get install -y --no-install-recommends \
        build-essential pkg-config python3 llvm-22-dev libpolly-22-dev clang-22 \
        libffi-dev libxml2-dev libzstd-dev zlib1g-dev libssl-dev
    export LLVM_SYS_221_PREFIX=/usr/lib/llvm-22
fi
llvm_version=$("$LLVM_SYS_221_PREFIX/bin/llvm-config" --version)
[[ "$llvm_version" == 22.* ]]
export PATH="$LLVM_SYS_221_PREFIX/bin:$PATH"

sdk_archive="wasi-sdk-$wasi_sdk_version.0-x86_64-linux.tar.gz"
curl --fail --location --retry 3 \
    "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-$wasi_sdk_version/$sdk_archive" \
    -o "$scratch/sdk.tar.gz"
echo "$wasi_sdk_sha256  $scratch/sdk.tar.gz" | sha256sum --check
mkdir -p "$destination/wasi-sdk"
tar -xzf "$scratch/sdk.tar.gz" --strip-components=1 -C "$destination/wasi-sdk"

export WASI_SDK_PATH="$destination/wasi-sdk"
export CC_wasm32_wasip2="$WASI_SDK_PATH/bin/clang"
export AR_wasm32_wasip2="$WASI_SDK_PATH/bin/llvm-ar"
export CFLAGS_wasm32_wasip2="--target=wasm32-wasip2 --sysroot=$WASI_SDK_PATH/share/wasi-sysroot"
export RUSTUP_TOOLCHAIN="$rust_toolchain"
export CARGO_BUILD_JOBS=2
export CARGO_PROFILE_DEV_DEBUG=0
export CARGO_PROFILE_DEV_INCREMENTAL=false

rustup toolchain install "$rust_toolchain" --profile minimal --target wasm32-wasip2
git init -q "$scratch/source"
git -C "$scratch/source" remote add origin https://github.com/PerryTS/perry.git
git -C "$scratch/source" fetch --depth 1 origin "$perry_revision"
git -C "$scratch/source" checkout --detach FETCH_HEAD
[[ "$(git -C "$scratch/source" rev-parse HEAD)" == "$perry_revision" ]]
cd "$scratch/source"
export CARGO_TARGET_DIR="$scratch/target"
cargo build --locked -p perry --no-default-features --features compile-cli,target-wasi
python3 scripts/wasi_build_runtime.py

mkdir -p "$destination/bin" "$destination/runtime"
install -m 755 "$CARGO_TARGET_DIR/debug/perry" "$destination/bin/perry"
cp "$CARGO_TARGET_DIR/wasm32-wasip2/release/libperry_runtime.a" "$destination/runtime/"
test -s "$destination/runtime/libperry_runtime.a"
printf 'export {};\n' > "$scratch/probe.ts"
"$destination/bin/perry" compile "$scratch/probe.ts" --target wasi --no-link -o "$scratch/probe.o"
node --input-type=module - "$scratch/probe.o" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
assert.deepEqual([...readFileSync(process.argv[2]).subarray(0, 8)], [0, 97, 115, 109, 1, 0, 0, 0]);
JS
printf 'Perry: %s\nRust: %s\nLLVM: %s\nWASI SDK: %s\n' \
    "$perry_revision" "$rust_toolchain" "$llvm_version" "$wasi_sdk_version" \
    > "$destination/build-info.txt"
