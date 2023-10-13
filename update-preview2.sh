#!/bin/bash

git submodule foreach --recursive git update --remote
cd submodules/wasmtime

./ci/build-wasi-preview1-component-adapter.sh

cp target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.command.wasm ../../lib/wasi_snapshot_preview1.command.wasm
cp target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.reactor.wasm ../../lib/wasi_snapshot_preview1.reactor.wasm
