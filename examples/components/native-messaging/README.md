# Native messaging with a Jco component

This example builds a JavaScript program into a WebAssembly component and runs it as a native-messaging host for
both Firefox and Chromium. The automated test proves the complete path through a real browser extension, the
browser's native-host registration, a Node launcher, and Jco-generated component bindings.

Native messaging is a browser-extension feature for exchanging JSON with a program installed on the same machine.
The browser starts the registered program and sends each UTF-8 JSON message over stdin, prefixed by a four-byte
length. The program writes responses in the same framed format on stdout. Ordinary pages and content scripts cannot
open native connections themselves, so this example's content script asks its privileged background context to call
`runtime.connectNative()`.

The browser extension and native-host manifests form the authorization boundary. Firefox identifies authorized
extensions with `allowed_extensions`; Chromium uses `allowed_origins`. stdout is reserved entirely for framed
protocol data—diagnostics must use stderr or a separate log.

## Quickstart

The automated browser harness currently supports Linux. From the repository root, install both browser builds and
run the example:

```console
pnpm install
pnpm run test:setup:firefox
pnpm run test:setup:puppeteer
pnpm --filter native-messaging run all
```

Firefox deliberately runs before Chromium. A Firefox failure stops the test and Chromium is not attempted.
`TEST_FIREFOX_PATH` and `TEST_CHROMIUM_PATH` may point to alternative browser executables; `PUPPETEER_PATH` remains
supported for Chromium. On Linux ARM64, where Chrome for Testing is not distributed, an installed Chromium-based
browser can be supplied through `TEST_CHROMIUM_PATH`.

## Build

The build has two stages:

1. `jco componentize` builds `src/component.js` as a `wasi:cli/run` component using `wit/component.wit`.
2. `jco transpile --instantiation async` generates the Node-loadable bindings in `dist/transpiled`.

The executable `scripts/launch-host.js` instantiates those bindings with WASI stdin/stdout streams connected directly
to the browser. It accepts and ignores the browser-specific command-line arguments: Firefox supplies the manifest
path and extension ID, while Chromium supplies the extension origin.

## How the protocol is tested

`all.js` stays intentionally small. It calls focused helpers under `test/` in this order:

1. `test/protocol.js` launches the host directly and checks framing, Unicode, multiple messages on one process,
   large-array chunking, and truncated input.
2. `test/browser-harness.js` creates isolated Firefox configuration, installs the temporary extension, registers the
   host, and repeats the semantic round trips through `connectNative()`.
3. The same harness creates isolated Chromium configuration and repeats the test with Chromium's manifest format.

Every browser profile, generated extension configuration, host manifest, and diagnostic log lives in a temporary
directory removed during teardown. The test does not modify a developer's normal browser profile or native-host
registrations.

Native hosts may send at most 1 MiB in one message. The component therefore splits a large top-level JSON array only
at commas between its elements, ignoring commas inside strings and nested values. Each response is itself a valid
JSON array below the limit, and the extension verifies that concatenating the chunks reproduces every original
element.

## Project layout

- `src/component.js` implements native-messaging framing and response chunking inside the component.
- `scripts/launch-host.js` is the executable Node entrypoint registered with each browser.
- `extension/background.js` contains the shared Firefox/Chromium extension behavior.
- `extension/manifest.firefox.json` and `extension/manifest.chromium.json` contain the small browser-specific pieces.
- `test/protocol.js` tests the host independently of a browser.
- `test/browser-harness.js` owns browser setup, registration, assertions, and teardown.
- `all.js` expresses the required Firefox-first test order.

The framing and chunking approach is based on the native-messaging example proposed by
[guest271314 in jco PR #1629](https://github.com/bytecodealliance/jco/pull/1629). This version adapts that work to the
repository's component example structure and adds automated Firefox and Chromium end-to-end coverage.

For more about the browser feature and its security model, see Mozilla's
[native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) and
[native manifest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests)
documentation, and Chrome's [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
documentation.
