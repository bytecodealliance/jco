# Portable Web APIs in a TypeScript component

This example exercises Web Platform APIs that are commonly available across server-side JavaScript runtimes. These
APIs broadly follow the [WinterTC Minimum Common Web Platform API][wintertc] and are provided during componentization
by [StarlingMonkey][starlingmonkey]. The example is both a usage reference and an end-to-end regression test for Jco
when its `componentize-js` dependency changes.

The component exposes a manually implemented `wasi:http/incoming-handler` using the familiar Service Worker `fetch`
event pattern. The small HTTP adapter lives in [`http.ts`](./http.ts), and each built-in check has its own module under
[`builtins`](./builtins). [`component.ts`](./component.ts) brings the checks together and returns their pass/fail
results as JSON for each request:

- URL and `URLSearchParams`
- `TextEncoder`, `TextDecoder`, `atob`, and `btoa`
- `crypto.getRandomValues`, `crypto.randomUUID`, and `crypto.subtle.digest`
- `performance.now`
- `Blob`, `File`, and `FormData`
- `structuredClone`
- `EventTarget`, `CustomEvent`, `AbortController`, `DOMException`, timers, and `queueMicrotask`
- `ReadableStream`, `TransformStream`, `CompressionStream`, and `DecompressionStream`
- `Headers`, `Request`, and `Response`

## Run the example

Install the repository dependencies, then build the component and run its checks in both Node.js and Deno:

```console
pnpm install
pnpm run all
```

The Node.js check runs the component with `jco serve`. The Deno check launches `jco serve` inside Deno, ensuring the
transpiled component and its WASI host shims work there too. You can run them separately with `pnpm run demo:node` and
`pnpm run demo:deno` after building.

## Runtime boundaries

Web Platform APIs do not imply Node.js compatibility. Component code cannot import `node:fs`, other `node:` modules,
or native Node.js addons. Use portable Web APIs and explicit WIT/WASI interfaces instead of runtime-specific globals
and modules.

This example currently exports WASI HTTP Preview 2 (`wasi:http@0.2.10`). It cannot move to Preview 3 yet because the
current `componentize-js`/StarlingMonkey backend does not support componentizing Preview 3 WIT worlds. This is a
componentization-toolchain limitation; the Web Platform APIs demonstrated here are not inherently Preview 2 APIs.

[starlingmonkey]: https://github.com/bytecodealliance/StarlingMonkey
[wintertc]: https://common-min-api.proposal.wintertc.org/
