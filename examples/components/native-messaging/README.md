# (Browser) Native messaging with a Jco component

This example builds a JavaScript program into a WebAssembly component and runs it as a [native messaging][mdn-native-messaging]
host for both Firefox and Chromium.

[Native messaging][mdn-native-messaging] is a browser-extension feature for exchanging JSON
with a program installed on the same machine.

The process goes like this:
1. The browser starts the registered program and sends each UTF-8 JSON message over stdin, prefixed by a four-byte
length.
2. The program writes responses in the same framed format on stdout.

> [!NOTE]
> As ordinary pages and content scripts cannot open native connections themselves, this example's
> content script asks its privileged background context to call `runtime.connectNative()`.

The browser extension needs a native-host manifest to work. Firefox identifies authorized
extensions with `allowed_extensions`; Chromium uses `allowed_origins`. stdout is reserved
entirely for framed protocol data, and other messages/diagnostics must use stderr or a
separate log.

For more about the browser feature and its security model, see Mozilla's
[native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) and
[native manifest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests)
documentation, and Chrome's [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
documentation.

[mdn-native-messaging]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging

## Quickstart

The automated browser harness currently only supports Linux.

From this folder you can install both browser builds and run the example:

```console
pnpm install
pnpm run test:setup:firefox
pnpm run test:setup:puppeteer
pnpm --filter native-messaging run all
```

> [!WARNING]
> On Linux ARM64, where Chrome for Testing is not distributed, an installed
> Chromium-based browser can be supplied through `TEST_CHROMIUM_PATH`.

## Project layout

- `src/component.js` contains the component's command loop.
- `src/utils.js` owns message framing, write limits, exact reads, and large-array chunking.
- `scripts/launch-host.mjs` is the executable Node entrypoint registered with each browser.
- `extension/background.js` contains the shared Firefox/Chromium extension behavior.
- `extension/manifest.firefox.json` and `extension/manifest.chromium.json` contain the small browser-specific pieces.
- `test/protocol.js` tests the host independently of a browser.
- `test/browser-harness.js` owns browser setup, registration, assertions, and teardown.
- `all.js` runs the independent protocol and browser tests in parallel.

## Build

The build has two stages:

1. `jco componentize --bundle` builds the source as a `wasi:cli/run` component satisfying the WIT world [`wit/component.wit`](./wit/component.wit).
2. `jco transpile --instantiation async` converts the built WebAssembly Component to Node-loadable bindings in `dist/transpiled`.

> [!NOTE]
> `jco componentize` normally treats a JavaScript input as one already-bundled file.
>
> This example passes `--bundle` because `src/component.js` imports the protocol
> helpers in `src/utils.js`. If your code fits in a single file, you don't need `--bundle`.

The executable [`scripts/launch-host.mjs`](./scripts/launch-host.mjs) instantiates those bindings with
WASI stdin/stdout streams connected directly to the browser.

To work in a cross-platform way, the `launch-host.mjs`script accepts and ignores the browser-specific
command-line arguments: Firefox supplies the manifest path and extension ID, while Chromium supplies
the extension origin.

## Using other component hosts (like `wasmtime`)

The browser does not require NodeJS or Jco-generated JavaScript.

Making this setup work only requires the native-host manifest to name an executable that implements
the length-prefixed JSON protocol over stdin and stdout. This example uses `jco transpile`
and a small Node launcher because that keeps the build, host, and browser tests
self-contained in the Jco repository.

An alternative setup would work is:

1. A WebAssembly component built in any language that supports WebAssembly (you could also use the component here)
2. A WebAssembly host (e.g. [`wasmtime`][wasmtime]) that can run WebAssembly components
3. A binary that uses the WebAssembly Host mentioned in (2) to run the WebAssembly component in (1).

For example, the launcher (3) can be as simple as a bash script that runs the component with the `wasmtime` CLI, or a custom
Rust binary.

A production application would likely build a native executable in Rust, embedding `wasmtime`, and instantiating
a component with WASI CLI streams attached to the process's stdin and stdout.

Building and distributing a native host as described above is outside this example's scope and is
left as an exercise for the reader.

[wasmtime]: https://github.com/bytecodealliance/wasmtime

## Thanks

The framing and chunking approach is based on the native-messaging example proposed by
[guest271314 in jco PR #1629](https://github.com/bytecodealliance/jco/pull/1629). This version adapts that work to the
repository's component example structure and adds automated Firefox and Chromium end-to-end coverage.
