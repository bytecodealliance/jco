# `node:stream`

| Imports | Implementation |
| --- | --- |
| `node:stream`, `node:stream/promises` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/stream` and `/stream/promises` |
| `node:stream/consumers` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/stream/consumers` |
| `node:stream/iter` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/stream/iter` |

## Classic streams

`node:stream` and `node:stream/promises` provide `Readable`, `Writable`, `Duplex`,
`Transform`, `PassThrough`, callback/promise pipelines, `finished`, readable
operators, cancellation, async disposal, and `duplexPair`. The implementation
reuses [readable-stream 4.7.0](https://github.com/nodejs/readable-stream/tree/v4.7.0),
with typed adaptations targeting Node 24.20, including Web Stream conversions
and support for all typed-array views. Buffer and EventEmitter identities are
shared with the corresponding `node:` imports. Scheduling uses guest microtasks;
no process, filesystem, network, or other host capability is required.

```js
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

await pipeline(
    Readable.from(['hello']),
    new Transform({ transform(chunk, encoding, done) { done(null, chunk.toString().toUpperCase()); } }),
    new Writable({ write(chunk, encoding, done) { /* consume chunk */ done(); } }),
);
```

For Web Streams, use `Readable.fromWeb()`, `Writable.fromWeb()`, or
`Duplex.fromWeb()` before calling `finished`, `addAbortSignal`, or the
readable/writable/error/disturbance inspection helpers. Those helpers need private
engine state when used on Web Streams directly and throw
`ERR_JCO_UNSUPPORTED_NODE_API`. Classic streams and public Web reader/writer
conversions are supported. The deprecated `Duplex.toWeb({ type })` alias throws;
use `readableType` instead.

> [!NOTE]
> Classic streams are tested on QuickJS and StarlingMonkey. The current QuickJS
> backend lacks Web Stream, text-codec, and Abort globals, so Web conversions and
> operations requiring those globals need an engine that supplies them.

## Stream consumers and iterable streams

`node:stream/consumers` supports Node 24 applications written before or after the
24.20 iterable-stream addition. `node:stream/iter` exposes the experimental 24.20
batch-oriented API. Both execute entirely inside the guest and share byte
normalization, limits, text decoding, and collection behavior. Importing either
specifier adds no host or WIT capability.

For example, ordinary Node application source can use both entry points:

```js
import { text as consumeText } from 'node:stream/consumers';
import { from, pull, text } from 'node:stream/iter';

export async function run() {
    const upper = (batch) =>
        batch?.map((chunk) => chunk.map((byte) => (byte >= 97 && byte <= 122 ? byte - 32 : byte))) ?? null;
    return {
        consumed: await consumeText(['consumer']),
        transformed: await text(pull(from('iterable'), upper)),
    };
}
```

Bundle that source normally; the WIT world only needs to describe the component's
own imports and exports:

```console
jco componentize app.js --bundle --backend starlingmonkey -w app.wit -o app.wasm
```

The implementation uses engine-provided iterable, typed-array, Blob, text-codec,
and abort globals. `fromReadable()` and `fromWritable()` work with duck-typed
classic streams. The experimental `toReadable()`, `toReadableSync()`, and
`toWritable()` adapters are not yet connected to the classic implementation.
They throw `ERR_JCO_UNSUPPORTED_NODE_API` without inspecting their arguments;
use the classic constructors directly.

> [!WARNING]
> Node marks `node:stream/iter` experimental. Its Jco implementation is likewise
> experimental and may change incompatibly without a semver-major release as the
> upstream Node 24 API evolves.
