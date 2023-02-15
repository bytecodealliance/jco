git submodule init
git submodule update
cd wit-bindgen
git pull origin main
cargo test --workspace --test runtime

for t in target/runtime-tests/*/*.component.wasm
do
  name="$(basename $(dirname $t))"
  echo "cp $t ../test/fixtures/${name}.component.wasm"
  cp $t ../test/fixtures/${name}.component.wasm
done

cd ../test/fixtures
rm wasi_snapshot_preview1.wasm
wget https://github.com/bytecodealliance/preview2-prototyping/releases/download/latest/wasi_snapshot_preview1.wasm
