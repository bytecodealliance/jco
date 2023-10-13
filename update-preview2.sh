#!/bin/bash
set -ex

# update dependencies
git submodule foreach git pull origin main
git submodule update --init --recursive
cd submodules/wasmtime

# build the artifacts
./ci/build-wasi-preview1-component-adapter.sh

# copy over the artifacts to the main repo
cp target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.command.wasm ../../lib/wasi_snapshot_preview1.command.wasm
cp target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.reactor.wasm ../../lib/wasi_snapshot_preview1.reactor.wasm
