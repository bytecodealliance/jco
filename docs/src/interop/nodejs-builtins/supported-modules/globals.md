# Globals

Node's [Globals API](https://nodejs.org/docs/latest-v24.x/api/globals.html) is a
catalog of runtime bindings, not a `node:globals` module. Jco therefore does not
resolve that specifier. Bundled code can use `Buffer` without importing
`node:buffer`; Rolldown injects Jco's existing audited Buffer adapter only when a
free `Buffer` identifier is referenced. A source graph that never uses it pays no
bundle-size or initialization cost.

The component engine supplies the portable Web globals shared with Node. With
ComponentizeJS 0.22.0's pinned StarlingMonkey runtime, this includes:

- `AbortController`, `AbortSignal`, `atob`, `btoa`, `Blob`, and `File`;
- `ByteLengthQueuingStrategy`, `CountQueuingStrategy`, `ReadableStream` and its
  exposed reader/controller classes, `WritableStream`, `TransformStream`,
  `CompressionStream`, and `DecompressionStream`;
- `console`, `Crypto`, `CryptoKey`, `SubtleCrypto`, `crypto`, `CustomEvent`,
  `DOMException`, `Event`, and `EventTarget`;
- `fetch`, `FormData`, `Headers`, `Request`, and `Response`;
- `Performance`, `performance`, `queueMicrotask`, timeout/interval functions,
  `structuredClone`, `TextEncoder`, `TextDecoder`, `URL`, and `URLSearchParams`.

When bundled source references `AbortController` or `AbortSignal`, Jco loads a
compatibility adapter for the legacy StarlingMonkey abort implementation. It
preserves the native constructors and signal objects while correcting `any()`'s
array handling, default reason identity, and `throwIfAborted()`. The adapter
detects the legacy calling convention and leaves conforming engines untouched.

The current embedded runtime does **not** expose a guest `WebAssembly` API.
Running the component in a Wasm host does not give its JavaScript code the ability
to compile or instantiate another Wasm module. Guest-side Wasm execution may be
supported in the future; the globals test currently asserts that this API is
absent and should gain execution coverage when the engine provides it.

Some of these retain StarlingMonkey's existing WASI feature requirements, such as
clocks for timers, random for WebCrypto, stdio for console, and HTTP for network
fetches. Jco does not add a Node-specific WIT capability for globals.

Bundled dependencies also receive `setImmediate` and `clearImmediate` from
[the timers adapter](./timers.md). A free `process` identifier uses the limited
unenv implementation so dependency initialization can run without host calls.
Explicit `node:process` imports use [the host-backed process adapter](./process.md).
