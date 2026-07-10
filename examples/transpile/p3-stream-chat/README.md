# P3 streaming chat

This example uses Preview 3 Component Model streams to model an LLM-like chat pipeline,
using Component Model async interfaces.

## How this example works

This example uses a [Rust component](./guest) that:

* Exports a WIT interface with a `chat` function
* Imports two replaceable host interfaces:
  * Generating LLM responses responses
  * Filtering LLM responses

A simplified version of [the WIT](./wit/chat.wit) is below:

```wit
/// Host-provided generation stage, which can be backed by an LLM service.
interface chunk-generator {

  /// Consumes prompt chunks and produces response events as they become available.
  generate: async func(input: stream<message-chunk>) -> stream<response-event>;
}

/// Host-provided stage for inspecting or transforming generated response events.
interface response-filter {
  /// Filters a generated response without buffering the complete stream.
  filter-response: async func(input: stream<response-event>) -> stream<response-event>;
}

/// Component-provided entry point for the composed chat pipeline.
interface chat {
  /// Streams caller input through generation and filtering, returning response events.
  chat: async func(input: stream<message-chunk>) -> stream<response-event>;
}

/// A chat agent that composes host-provided generation and filtering stages.
world agent {
  /// Generates response events from the augmented prompt stream.
  import chunk-generator;
  /// Filters generated events before they reach the caller.
  import response-filter;
  /// Exposes the composed streaming chat operation.
  export chat;
}
```

The component itself prepends a system insttruction before passing along the user-submitted messages.

This example uses Jco as a transpiled Wasm Host, which means that the Rust component is runnable in Javascript,
after it has been `jco transpile`d.

This example does not connect to an external LLM service, and works offline in stead, deliberately sends and receives delayed
chunks so you can see a response begin before the prompt finishes. The demo sends a prompt-injection attempt asking for
a fake secret, `sk-demo-7f3a9c2e`, and its filter replaces that value with `[redacted]`.

> [!WARNING]
> This is *not* a comprehensive method of filtering LLM queries or responses, but rather a
> simple demo of a now-simplistic metthod of filtering responses. For example, simply asking
> for Base64 output of the secret in question would evade this component.
>
> More advanced filtering is left as an exercise to the reader.

## Dependencies

| Tool                                                         | Description                                             |
|--------------------------------------------------------------|---------------------------------------------------------|
| [NodeJS][nodejs]                                             | NodeJS to run the JS host                               |
| [pnpm][pnpm]                                                 | Package manager for NodeJS                              |
| [Rust Toolchain][rust-toolchain] (w/ `wasm32-wasip1` target) | (Optional) For building the Rust component from scratch |

[rust-toolchain]: https://rustup.rs/
[pnpm]: https://pnpm.io
[nodejs]: https://nodejs.org

## Quickstart

> [!NOTE]
> Node.js 24 or newer is required (with the `--experimental-wasm-jspi`, if required)

This example can be run with `pnpm`:

```console
pnpm install
pnpm run all
```

`pnpm run all` does everything in one shot:

* Builds the Rust guest component
* Transpiles it with `jco transpile` to make it runnable in a JS script
* Compiles the TypeScript demo into `dist/demo`
* Runs assertion-backed success and error examples.

To simply build the project without running the demo:

```
pnpm run build
```

## Notes about how the host:

Some notes to keep in mind:

* [WIT type representations][jco-book-wit-type-representations]
  * Note that TypeScript supplies WIT records as objects such as `{ role: "user", text: "hello" }`.
  * WIT variants use `{ tag, val }`, while a payload-free case such as `complete` is `{ tag: "complete" }`.
* Both incoming and outgoing WIT streams are represented by [asynchronous iterables][mdn-async-itterable].

[mdn-async-iterable]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_async_iterator_and_async_iterable_protocols
[jco-book-wit-type-representations]: https://bytecodealliance.github.io/jco/wit-type-representations.html

## Building the Rust component from scratch

The checked-in component (`p3-stream-chat.wasm`) keeps the normal demo independent of a Rust toolchain.
To rebuild the Rust component from scratch, install Rust with the `wasm32-wasip1` target and run:

```console
pnpm run build:guest
```

The guest source is in [`guest/src/main.rs`](./guest/src/main.rs), and the complete interface is in [`wit/chat.wit`](./wit/chat.wit).

The mock generator can be replaced with a real provider integration without changing the component. Production response filters should account for sensitive text split across multiple delta events; this example intentionally performs per-delta redaction to keep the stream mechanics clear.
