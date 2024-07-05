# Generate IDL from test/fixtures/idl/*.webidl to test/fixtures/idl/*.wit
cargo xtask generate idl
# Componentize the IDL test case at test/fixtures/*.test.js
./src/jco.js componentize test/fixtures/idl/console.test.js --wit test/fixtures/idl/console.wit -o console.component.wasm --disable stdio --disable random --disable clocks --disable http
# Transpile the created test component to test
./src/jco.js transpile console.component.wasm -o console-test
