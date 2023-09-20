mkdir wasmtime
cd wasmtime
git init
git remote add origin https://github.com/bytecodealliance/wasmtime
git fetch --depth 1 origin "${1:-main}"
git checkout FETCH_HEAD
git submodule update --init
cargo build -p wasi-preview1-component-adapter --target wasm32-unknown-unknown --release --no-default-features --features reactor
wasm-tools metadata add --name "wasi_preview1_component_adapter.reactor.adapter:main" target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.wasm -o ../lib/wasi_snapshot_preview1.reactor.wasm
cargo build -p wasi-preview1-component-adapter --target wasm32-unknown-unknown --release --no-default-features --features command
wasm-tools metadata add --name "wasi_preview1_component_adapter.command.adapter:main" target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.wasm -o ../lib/wasi_snapshot_preview1.command.wasm
mv ../test/fixtures/wit/deps/flavorful ../test/fixtures/wit/
rm -r ../test/fixtures/wit/deps
cp -r crates/wasi/wit/deps ../test/fixtures/wit/
mv ../test/fixtures/wit/flavorful ../test/fixtures/wit/deps/
# note the WASI version for reference
cat .git/FETCH_HEAD | head -c 16 > ../wasi-version
cd ..
rm -rf wasmtime
echo "\nWASI Updated to $(cat wasi-version)"
