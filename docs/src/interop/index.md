# JavaScript ecosystem interoperability

Components transpiled by Jco are ordinary ES modules, and components built with Jco can reuse a
large part of the existing JavaScript ecosystem. This section covers the pieces that make that
possible.

- [`jco-std`](./jco-std.md): the standard library that gives components access to WASI through
  familiar JavaScript APIs.
- [Node.js built-in compatibility](./nodejs-builtins.md): which `node:*` modules work inside a
  component, and how each one maps onto WASI.
- [Express](./express.md): running an Express application as a component.
