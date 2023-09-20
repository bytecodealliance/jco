git clone https://github.com/bytecodealliance/wasmtime --depth 1
cd wasmtime
git submodule init
git submodule update
cargo build -p wasi-preview1-component-adapter --target wasm32-unknown-unknown --release --no-default-features --features reactor
wasm-tools metadata add --name "wasi_preview1_component_adapter.reactor.adapter:main" target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.wasm -o ../lib/wasi_snapshot_preview1.reactor.wasm
cargo build -p wasi-preview1-component-adapter --target wasm32-unknown-unknown --release --no-default-features --features command
wasm-tools metadata add --name "wasi_preview1_component_adapter.command.adapter:main" target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.wasm -o ../lib/wasi_snapshot_preview1.command.wasm
cp -r crates/wasi/wit/deps ../test/fixtures/wit/
cd ..
rm -rf wasmtime
