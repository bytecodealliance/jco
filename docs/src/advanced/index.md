# Advanced

These chapters go deeper into how Jco binds components to JavaScript. They assume familiarity with
the [Transpiling](../transpiling.md) chapter and the [WASI support](../wasi/index.md) section.

- [Optimized Host Bindings](./optimized-host-bindings.md): the fast paths Jco generates for host
  calls, and when they apply.
- [WIT Type representations](./wit-type-representations.md): how each WIT type appears in
  JavaScript.
- [Manual Wasm instantiation with WASI overrides](./manual-wasm-instantiation-with-wasi-overrides.md):
  instantiating a transpiled component yourself and replacing individual WASI interfaces.
- [Detecting traps](./detecting-traps.md): telling a component trap apart from an ordinary error.
- [Preview 3 streams and backpressure](./preview3-streams-and-backpressure.md): how WASI 0.3
  streams flow between host and guest.
- [Preview 3 host value disposal](./preview3-host-value-disposal.md): what happens to host-provided
  values a guest discards.
- [Script-only components](./script-only-components.md): building one engine component for many
  scripts, and packaging each script as a component of its own.
