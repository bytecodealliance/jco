git submodule init
git submodule update
cd wit-bindgen
git pull origin main
cargo test --workspace --test runtime

for t in target/runtime-tests/*/c-*/*.component.wasm
do
  name="$(basename $(dirname $t))"
  name=${name:2}
  echo "cp $t ../test/fixtures/${name}.component.wasm"
  cp $t ../test/fixtures/${name}.component.wasm
done
