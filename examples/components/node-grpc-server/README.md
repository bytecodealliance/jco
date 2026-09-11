# Node.js gRPC server

This example runs the same gRPC server source directly in Node.js and as a
WebAssembly component using jco-std's Node.js API support. The HTTP/2 listener,
request handling, and service implementation all live in
[`src/server.js`](./src/server.js). Both runtimes are tested with [Buf's gRPC client][buf-cli].

[`@bufbuild/buf`][buf-npm] and `@bufbuild/protoc-gen-es` are development
dependencies. Buf lints the schema and generates JavaScript bindings locally;
no Buf account, remote code-generation plugin, or separate `protoc` installation
is required. The server uses `@connectrpc/connect` for the gRPC protocol and
`@bufbuild/protobuf` for serialization.

> [!WARNING]
> Jco's Node.js built-in compatibility for components is experimental and subject
> to change. APIs, behavior, and generated component interfaces may change
> incompatibly without a semver-major release.

## How it works

[`proto/example/greeter/v1/greeter.proto`](./proto/example/greeter/v1/greeter.proto)
defines `GreeterService.Greet`, a unary RPC that returns a greeting or rejects an
empty name with `INVALID_ARGUMENT`. The service also sets a response header and
a trailer containing the UTF-8 byte count of the supplied name.

| API or tool | Purpose |
| --- | --- |
| `node:http2` | Create the shared HTTP/2 server and send response trailers. |
| `node:buffer` | Count UTF-8 bytes and construct empty response bodies. |
| `node:stream/consumers` | Collect the SDK's response stream as a buffer. |
| Buf CLI | Lint the schema, run the local code generator, and call the server over gRPC. |
| Connect router | Handle gRPC envelopes, protobuf messages, status codes, and metadata. |

The server uses Connect's router with only the gRPC protocol enabled. A small
bridge connects its request/response interface to Node's HTTP/2 API. The
`@connectrpc/connect-node` adapter also loads compression and other Node APIs;
this example uses the portable router directly and leaves compression disabled.
Both launchers execute the same bridge and service code.

Jco compiles `src/server.js` with `--with-nodejs-http2-via direct`, replacing Node
built-in imports with jco-std implementations. Protobuf decoding, gRPC handling,
and the service itself execute inside WebAssembly. The generated component
imports `jco:node/http2@0.1.0` and exports `jco:node/http2-callbacks@0.1.0`, plus
the application's `start` and `stop` functions.

[`run-transpiled.js`](./run-transpiled.js) supplies jco-std's Node HTTP/2 host and
preview2-shim's WASI capabilities, then calls `start`. The host provides network
I/O. Import mappings preserve WIT interface names. Node's
`--experimental-wasm-jspi` flag enables the asynchronous component callbacks.
[`serve-node.js`](./serve-node.js) imports the same source directly on Node.

## Quickstart

Use Node.js 24 or newer and pnpm. This example uses workspace packages to exercise
the HTTP/2 trailer support from this checkout. From the repository root:

```console
pnpm install
pnpm --filter @bytecodealliance/jco run build
pnpm --filter @bytecodealliance/jco-std run build:ts
pnpm --filter @bytecodealliance/preview2-shim run build
```

Then run the complete example:

```console
cd examples/components/node-grpc-server
pnpm run all
```

The `all` script lints and generates the protobuf bindings, builds
`component.wasm`, transpiles it into `dist/transpiled`, and runs the e2e tests.
The tests start both servers on automatically allocated localhost ports and
call them using `buf curl --protocol grpc --http2-prior-knowledge`.
They also inspect the HTTP/2 response to verify protobuf framing, headers,
`grpc-status` trailers, Unicode input, repeated calls, multi-frame bodies,
invalid arguments, and unknown routes. The same script runs in the examples CI matrix.

Generated bindings under `src/gen` are ignored and recreated by `pnpm run generate`.

## Run the demo

After `pnpm run all`, start the component server:

```console
pnpm run serve
```

In another terminal in this directory:

```console
pnpm run demo
```

Expected output:

```json
{
  "message": "Hello, World!"
}
```

To compare with native Node, stop the component server and run
`pnpm run serve:node`, then run the same demo. Both servers use port 3000 by
default. Set `PORT` to select another server port and call it explicitly:

```console
pnpm exec buf curl --schema proto --protocol grpc --http2-prior-knowledge \
  --data '{"name":"World"}' \
  http://127.0.0.1:3001/example.greeter.v1.GreeterService/Greet
```

This local example uses cleartext HTTP/2 (`h2c`) and unary, uncompressed RPCs.
The component boundary buffers complete requests and responses. TLS,
authentication, server reflection, and streaming RPCs are outside this example.
Buf uses the local schema instead of server reflection.

[buf-npm]: https://www.npmjs.com/package/@bufbuild/buf
[buf-cli]: https://buf.build/docs/reference/cli/buf/curl/
