git submodule init
git submodule update
cd wit-bindgen
cargo test --workspace -p gen-host-js --test runtime --features runtime-tests

for t in target/codegen-tests/js-*/*
do
  name="$(basename $(dirname $t))"
  echo "cp $t/component.wasm ../test/fixtures/${name:3}.component.wasm"
  cp $t/component.wasm ../test/fixtures/${name:3}.component.wasm
done

for t in target/debug/build/runtime-macro-*/out/*.component.wasm
do
  name="$(basename $t)"
  echo "cp $t ../test/fixtures/${name}"
  cp $t ../test/fixtures/${name}
done

# copy the c builds over the rust builds so they take precedence
for t in target/debug/build/runtime-macro-*/out/c-*/*.component.wasm
do
  name="$(basename $(dirname $t))"
  echo "cp $t ../test/fixtures/${name:2}.component.wasm"
  cp $t ../test/fixtures/${name:2}.component.wasm
done

# c utf16 tests
for t in target/debug/build/runtime-macro-*/out/c_utf16-*/*.component.wasm
do
  name="$(basename $(dirname $t))"
  echo "cp $t ../test/fixtures/${name:8}_utf16.component.wasm"
  cp $t ../test/fixtures/${name:8}_utf16.component.wasm
done

cd test/fixtures
rm wasi_snapshot_preview1.wasm
wget https://github.com/bytecodealliance/preview2-prototyping/releases/download/latest/wasi_snapshot_preview1.wasm
