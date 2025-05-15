#!/bin/bash
set -ex

cd submodules/wasmtime

# build the preview1 component adapter reactor
cargo build -p wasi-preview1-component-adapter \
    --target wasm32-unknown-unknown \
    --release \
    --no-default-features \
    --features reactor

# edit the component adapter's metadata
# TODO(yosh): point this at a local version of `wasm-tools`
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
# TODO(yosh): point this at a local version of `wasm-tools`
wasm-tools metadata add \
    --name "wasi_preview1_component_adapter.command.adapter:main" \
    target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.wasm \
    -o ../../lib/wasi_snapshot_preview1.command.wasm

# replace the existing fixtures with our newly created files
mv ../../test/fixtures/wit/deps/flavorful ../../test/fixtures/wit/
rm -r ../../test/fixtures/wit/deps/cli
rm -r ../../test/fixtures/wit/deps/clocks
rm -r ../../test/fixtures/wit/deps/filesystem
rm -r ../../test/fixtures/wit/deps/http
rm -r ../../test/fixtures/wit/deps/io
rm -r ../../test/fixtures/wit/deps/random
rm -r ../../test/fixtures/wit/deps/sockets
cp -r crates/wasi/wit/deps ../../test/fixtures/wit/
cp -r crates/wasi-http/wit/deps/http ../../test/fixtures/wit/deps/
mv ../../test/fixtures/wit/flavorful ../../test/fixtures/wit/deps/
