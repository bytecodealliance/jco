#!/bin/bash
set -ex

# update dependencies
git submodule foreach git pull origin main
git submodule update --init --recursive
cd submodule/wasmtime

# build the preview1 component adapter reactor
cargo build -p wasi-preview1-component-adapter \
    --target wasm32-unknown-unknown \
    --release \
    --no-default-features \
    --features reactor

# edit the component adapter's metadata
wasm-tools metadata add \
    --name "wasi_preview1_component_adapter.reactor.adapter:main" \
    target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.wasm \
    -o ../../lib/wasi_snapshot_preview1.reactor.wasm

# build the preview1 component adapter command
cargo build \
    -p wasi-preview1-component-adapter \
    --target wasm32-unknown-unknown \
    --release \
    --no-default-features \
    --features command

# edit the component adapter's metadata
wasm-tools metadata add \
    --name "wasi_preview1_component_adapter.command.adapter:main" \
    target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.wasm \
    -o ../../lib/wasi_snapshot_preview1.command.wasm

# replace the existing fixtures with our newly created files
mv ../../test/fixtures/wit/deps/flavorful ../../test/fixtures/wit/
rm -r ../../test/fixtures/wit/deps
cp -r crates/wasi/wit/deps ../../test/fixtures/wit/
mv ../../test/fixtures/wit/flavorful ../../test/fixtures/wit/deps/

# note the WASI version for reference
cat .git/FETCH_HEAD | head -c 16 > ../../wasi-version
cd ../..
echo "\nWASI Updated to $(cat wasi-version)"
