# Component model compatibility dependencies

These upstream crates are vendored to keep focused compatibility patches reproducible.

## wasmtime-environ 49.0.0

Source: https://crates.io/crates/wasmtime-environ/49.0.0
Published archive SHA256: `bad97c3c8f3d80de1aa1e6995b6fcf66673b7e388bca0c80bde63e4051210434`

Patches: use wasm-tools 0.263 parser/encoder and 0.262 printer; adapt parser API changes while retaining the existing FACT start-call ABI. Forwarding translation is maintained here because upstream has not implemented it. Unsupported multiple supertypes fail explicitly.

## wit-parser 0.262.0

Source: https://crates.io/crates/wit-parser/0.262.0
Published archive SHA256: `00f0dc051466ffe46787721fca3d088536f158ae400be044f1b1c386ba9397ad`

Patches: decode direct component type exports into WIT world type exports, including resources and aliases; omit core module and component-definition exports from the WIT host surface. Their module initialization and start functions remain part of normal component translation and execution.

Upstream standalone test fixtures, examples, and development-only entry points are omitted; library source and license files are preserved. Remove these patches when compatible upstream releases incorporate the changes.
