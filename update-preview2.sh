cd lib
rm wasi_preview1_component_adapter.command.wasm
rm wasi_preview1_component_adapter.reactor.wasm
wget https://github.com/bytecodealliance/wasmtime/releases/download/dev/wasi_snapshot_preview1.command.wasm
wget https://github.com/bytecodealliance/wasmtime/releases/download/dev/wasi_snapshot_preview1.reactor.wasm

