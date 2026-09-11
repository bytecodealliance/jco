# MCP server component

This example compiles an MCP server to a WebAssembly component and calls it with
the official TypeScript SDK client over HTTP. The same server and tool code also
runs directly on Node.js.

It targets the [2026-07-28 MCP specification][spec], including its stateless,
per-request protocol. It uses SDK **2.0.0**, published as
`@modelcontextprotocol/server` and `@modelcontextprotocol/client`. These replace
the v1 `@modelcontextprotocol/sdk` package for the new specification.

> [!WARNING]
> Jco's Node.js built-in compatibility for components is experimental and subject
> to change. APIs, behavior, and generated component interfaces may change
> incompatibly without a semver-major release.

## How it works

[`src/server.js`](./src/server.js) registers one SDK tool, `inspect-text`. Given
a filename and text chunks, it returns the normalized basename, UTF-8 byte count,
and base64-encoded contents. It never opens the named file.

The server uses ordinary Node.js imports:

| API | Use inside the component |
| --- | --- |
| `node:http` | Create and listen on the HTTP server in both runtimes. |
| `node:stream` | Turn the chunks into a classic `Readable` stream. |
| `node:stream/consumers` | Collect that stream as text. |
| `node:buffer` | Count UTF-8 bytes and encode them as base64. |
| `node:path` | Normalize the filename with portable POSIX semantics. |

Jco's built-in bundler replaces those imports with jco-std implementations.
The SDK, Zod validation, and tool execution all run inside WebAssembly. There
are no example-local Node aliases or replacement MCP protocol implementations.

The SDK's `createMcpHandler` creates a fresh server for each request.
`legacy: "reject"` requires the modern protocol. A tool call can be the first
request; there is no `initialize` handshake or `Mcp-Session-Id`. Clients send the
protocol version and capabilities with every request. The supplied client pins
`2026-07-28`, so it cannot silently fall back to the legacy protocol.

The same `src/server.js` also creates the `node:http` server and converts its
requests and responses to the SDK's Web Request/Response interface. This example
buffers bodies using `node:stream/consumers` and `node:buffer`; it does not stream
SSE responses. The SDK's `toNodeHandler` adapter requires Web stream async
iteration, which the component engine does not yet provide.

Jco compiles this file directly, using `--with-nodejs-http-via direct` for Node
HTTP passthrough. [`wit/component.wit`](./wit/component.wit) exports `start`,
`stop`, and `jco:node/http-callbacks@0.1.0`, and imports `jco:node/http@0.1.0`.
[`run-transpiled.js`](./run-transpiled.js) instantiates the component with jco-std's
Node HTTP host and preview2-shim's WASI capabilities, then calls `start`.
Its import object preserves WIT interface names. All request routing, HTTP
conversion, and MCP handling run inside the component. The runner supplies
network I/O and uses Node's `--experimental-wasm-jspi` flag for async callbacks.

The SDK's Node entry point also imports `node:process`. Jco declares the typed
`jco:node/process@0.1.0` capability, and the runner supplies its denial provider:
this HTTP example does not need host process operations or native stdin/stdout.

## Quickstart

Use Node.js 24 or newer and pnpm. This example uses workspace packages because
it exercises Node compatibility support from this checkout. From the repository
root, install and build the tooling once:

```console
pnpm install
pnpm --filter @bytecodealliance/jco run build
pnpm --filter @bytecodealliance/jco-std run build:ts
pnpm --filter @bytecodealliance/preview2-shim run build
```

Then run the complete example:

```console
cd examples/components/mcp-server
pnpm run all
```

The `all` script builds `component.wasm`, transpiles it to `dist/transpiled`, and
runs the same SDK client assertions against native Node and the actual component.
It starts both servers on automatically allocated localhost ports and stops them
after testing. This script also runs in the examples CI matrix.

Tests cover a tool call before discovery, SDK discovery and tool listing,
Unicode and empty input, repeated requests, schema errors, malformed JSON,
unknown routes, rejected origins, and the modern request metadata and headers.

## Run the demo

After `pnpm run all`, keep the component server running:

```console
pnpm run serve
```

In another terminal in this directory:

```console
pnpm run demo
```

Expected output:

```text
Tools: inspect-text
{
  "filename": "greeting.txt",
  "bytes": 12,
  "base64": "SGVsbG8sIPCfjI0h"
}
```

The default endpoint is `http://127.0.0.1:3000/mcp`. Set `PORT` for the server
and `MCP_URL` for the demo client to use a different port. A compatible MCP host
can connect to that endpoint using Streamable HTTP and protocol `2026-07-28`.

To compare with native Node, stop the component server and run
`pnpm run serve:node`, then run the same demo. The native launcher imports
`src/server.js` directly and calls its `start` and `stop` functions. Both runtimes
execute the same server source, including the HTTP listener and request handler.

This is a local tool demo. It accepts requests without an Origin header and
allows localhost origins. Authentication and long-lived subscription examples
are outside its scope.

[spec]: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
