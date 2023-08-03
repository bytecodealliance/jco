#!/usr/bin/env bash

set -euo pipefail

cd lib

rm wasi_snapshot_preview1.command.wasm
rm wasi_snapshot_preview1.reactor.wasm

wget https://github.com/bytecodealliance/wasmtime/releases/download/dev/wasi_snapshot_preview1.command.wasm
wget https://github.com/bytecodealliance/wasmtime/releases/download/dev/wasi_snapshot_preview1.reactor.wasm

