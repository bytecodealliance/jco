git clone https://github.com/bytecodealliance/wit-bindgen
cd wit-bindgen
cargo test -p wit-bindgen-cli --no-default-features -F c

for t in target/runtime-tests/*/c-*/*.component.wasm
do
  name="$(basename $(dirname $t))"
  name=${name:2}
  echo "cp $t ../test/fixtures/components/${name}.component.wasm"
  cp $t ../test/fixtures/components/${name}.component.wasm
done

# copy flavorful wit case
cp tests/runtime/flavorful/world.wit ../test/fixtures/wit/flavorful.wit

cd ..

./src/jco.js componentize test/fixtures/component-gen/import-fn.js --wit test/fixtures/component-gen/import-fn.wit -o test/fixtures/components/import-fn.component.wasm

rm -rf wit-bindgen