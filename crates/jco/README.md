# `jco` Rust crate

This directory is a hybrid Rust and Node.js workspace package used only by the
`jco` test suite. Cargo builds and runs the Rust tests, while the private
`package.json` provides the JavaScript dependencies used by generated tests in
Node.js and Deno.

The package is not published or consumed as a Node.js library. Keeping its
JavaScript dependencies here ensures that test-only packages such as
`@bytecodealliance/preview2-shim` and `@bytecodealliance/jco-node-fs` do not
become top-level development dependencies.
