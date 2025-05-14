#!/bin/bash
set -ex

cd submodules/wit-bindgen

# build tests
cargo test -p wit-bindgen-cli --no-default-features -F rust -F c

# copy over the Rust-based wit-bindgen tests to our repo
for t in target/runtime-tests/*/rust.wasm
do
  name="$(basename $(dirname $t))"
  echo "cp $t ../../test/fixtures/components/${name}.component.wasm"
  cp $t ../../test/fixtures/components/${name}.component.wasm
done

# copy over the C-based wit-bindgen tests to our repo.
# the C versions always override the Rust versions
for t in target/runtime-tests/*/c-*/*.component.wasm
do
  name="$(basename $(dirname $t))"
  name=${name:2}
  echo "cp $t ../../test/fixtures/components/${name}.component.wasm"
  cp $t ../../test/fixtures/components/${name}.component.wasm
done

# copy flavorful wit case
cp tests/runtime/flavorful/world.wit ../../test/fixtures/wit/deps/flavorful/flavorful.wit
cd ../..

# convert the js test fixtures into a wasm component
./src/jco.js componentize \
  test/fixtures/component-gen/import-fn.js \
  --wit test/fixtures/component-gen/import-fn.wit \
  -o test/fixtures/components/import-fn.component.wasm

## wasi virt to generate composition cases
cd submodules/wasi-virt
cargo test
cp tests/generated/env-allow.composed.wasm ../../test/fixtures/
cp tests/generated/stdio.composed.wasm ../../test/fixtures/
