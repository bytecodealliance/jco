# QuickJS Preview 3 stream echo

This example uses Jco's [`componentize-qjs`](https://github.com/andreiltd/componentize-qjs)
backend to build a JavaScript component that echoes a Preview 3 Component Model
stream of messages.

The guest receives and returns Component Model streams as JavaScript async
iterables. Each input message is yielded immediately, without buffering the
complete stream. A Component Model future resolves with the message count once
the input stream is exhausted.

## Quickstart

Use Node.js 24 or newer, install dependencies, and run the assertion-backed example:

```console
pnpm install
pnpm run all
```

The `all` script:

1. Builds `echo.js` with `jco componentize --backend qjs`.
2. Transpiles the component for Node.js.
3. Demonstrates output arriving before input finishes, then cancels another
   stream and verifies its completion future and input cleanup.
4. Runs `test.js` for empty input and cancellation before reading or partway
   through a stream.

The WIT result contains independently consumable stream and future handles:

```wit
enum echo-error {
  cancelled,
}

type message-stream = stream<string>;
type completion = future<result<u32, echo-error>>;

record echo-output {
  messages: message-stream,
  completion: completion,
}
```

The guest adapts an async generator with `wit.Stream.from()` and uses
`wit.Future.from()`. The types are inferred because the world has only one stream
type and one future type. The adapters release their writable endpoints in
`finally` blocks, after pending writes settle. Their readable handles transfer
to the host on return.
