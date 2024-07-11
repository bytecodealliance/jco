# Generate IDL from test/fixtures/idl/*.webidl to test/fixtures/idl/*.wit
cargo xtask generate idl
# Componentize the IDL test case at test/fixtures/*.test.js

./src/jco.js componentize test/fixtures/idl/dom.test.js --wit test/fixtures/idl/dom.wit -o dom.component.wasm --disable stdio --disable random --disable clocks --disable http --world-name window-test
./src/jco.js transpile dom.component.wasm -o dom-test

./src/jco.js componentize test/fixtures/idl/console.test.js --wit test/fixtures/idl/console.wit -o console.component.wasm --disable stdio --disable random --disable clocks --disable http --world-name console-test
./src/jco.js transpile console.component.wasm -o console-test

# Test it
# node --input-type=module -e "import { test } from './dom-test/dom.component.js'; test();"
