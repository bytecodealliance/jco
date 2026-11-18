# Runtime API and provider contracts

## API version 1: named modules and specific contexts

`cmRuntimeEsModule` identifies a **package or directory base**. Generated bindings
statically import `CM_RUNTIME_API_VERSION` from the `runtime` subpath and
resource operations and storage initializers from `intrinsics/resource`, selected conversions from
`intrinsics/conversion`, JavaScript helpers from `intrinsics/js-helper` and
string operations/codecs from `intrinsics/string` and the global WebIDL adapter
from `intrinsics/webidl`, with core operations, constructors and state owners
from `intrinsics/core`, component state/scheduling from `intrinsics/component`,
and waitable constructors/operations from `intrinsics/waitable`.
Error-context storage and operations use `intrinsics/error-context`;
tasks, subtasks and their state use `intrinsics/async-task`;
guest-to-guest host calls and event writing use `intrinsics/host`;
flat lifting helpers use `intrinsics/lift`, lowering helpers use `intrinsics/lower`,
and future classes, tables and operations use `intrinsics/future`.
Only implemented subpaths are published.
Root exports the same metadata and types as `runtime`; there is no root factory.

| Base                               | Resource import                                        | Version import                             |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| `@bytecodealliance/jco-cm-runtime` | `@bytecodealliance/jco-cm-runtime/intrinsics/resource` | `@bytecodealliance/jco-cm-runtime/runtime` |
| `custom-runtime`                   | `custom-runtime/intrinsics/resource`                   | `custom-runtime/runtime`                   |
| `./runtime/`                       | `./runtime/intrinsics/resource.js`                     | `./runtime/runtime.js`                     |
| `file:///path/dist/`               | `file:///path/dist/intrinsics/resource.js`             | `file:///path/dist/runtime.js`             |
| `https://example.test/runtime/`    | `https://example.test/runtime/intrinsics/resource.js`  | `https://example.test/runtime/runtime.js`  |

One optional trailing slash is normalized. Relative bases resolve from the
**generated bindings**, not the transpilation process's working directory.
Directory/URL bases use real `.js` files. Use file URLs for Windows paths.
Control characters, empty bases, unsupported URL schemes and query/fragment
suffixes on directory bases are rejected. Bare packages named `something.js`
are packages; relative/URL file bases such as `./provider.js` must migrate to a
directory. Browser package imports need normal import-map or bundler setup;
map each public subpath to its `.js` file. HTTP servers must serve the whole
runtime directory tree with JavaScript MIME types.

Bindings check version 1 before use. Missing subpaths or named exports fail
through the native ES module loader.

## Implementing an alternative runtime

`dist/runtime.d.ts`, published at `@bytecodealliance/jco-cm-runtime/runtime`, is
the explicit, self-contained structural contract. It has no imports from default
implementation modules. A TypeScript provider can check its module namespace:

```ts
import type { ResourceModule } from '@bytecodealliance/jco-cm-runtime/runtime';
import * as resource from './intrinsics/resource.js';

const conformance: ResourceModule = resource;
```

Export `CM_RUNTIME_API_VERSION = 1` from your `runtime.js`. Expose `./runtime`
and the implemented `./intrinsics/resource`, `./intrinsics/conversion` and
`./intrinsics/js-helper`, `./intrinsics/string`, `./intrinsics/webidl` and
`./intrinsics/core`, `./intrinsics/component`, `./intrinsics/waitable`,
`./intrinsics/error-context`, `./intrinsics/async-task`, `./intrinsics/host`,
`./intrinsics/lift`, `./intrinsics/lower` and `./intrinsics/future` subpaths
in your package's `exports` map, with their matching
JavaScript and declaration targets. `RuntimeModuleContracts` is a type-only map
of public suffixes to their interfaces; no assembled runtime object is required.
Function-property signatures support strict parameter checking. Type-only
consumption produces no runtime imports.

Structural conformance does not prove package resolution, exact JavaScript arity,
or Canonical ABI behavior. TypeScript permits implementations to ignore arguments.
Test the installed package and its behavior, especially traps and shared state.
Providers may re-export selected default functions. Those functions retain their
own statically imported dependencies: overriding a sibling export does not
intercept its calls. There is no mutable namespace receiver or implicit override
registry. Context-free operations take no dummy context argument.

See the [intrinsic contracts](intrinsics/README.md) for individual operations and capabilities.

## Runtime profiles

Runtime diagnostic statements carry a `DEBUG` JavaScript label.
A profile is the choice of whether to keep them:

| Profile   | Diagnostics (`DEBUG`) | Package entry                                |
| --------- | --------------------- | -------------------------------------------- |
| `checked` | removed               | `@bytecodealliance/jco-cm-runtime` (default) |
| `debug`   | kept                  | `@bytecodealliance/jco-cm-runtime/debug`     |

Removing a labeled statement removes the whole statement,
including object literals, string formatting, and diagnostic getters passed as log arguments.
Diagnostic arguments must not perform required work.

Canonical ABI traps, resource-handle validation, Unicode validation, ownership, cancellation,
and lifecycle checks are never labeled, and remain in both profiles.

Assertions about internal implementation invariants carry a `SAFETY` label, and also remain in both profiles.
The label marks statements that guard against defects of the runtime itself rather than against its callers,
such as the check of the representation table's internal freelist head.
Adding a `SAFETY` label requires auditing both the checked condition
and any work performed while evaluating it.

Only the `debug` profile logs: when `JCO_DEBUG` is set,
or for bundled runtimes when an instance is created with the `debug` option.
The `checked` profile omits runtime log calls even when `JCO_DEBUG` is set.
The exported `debugLog` is an empty function in the checked profile. When a
bundler includes the checked runtime, it can remove calls to that function
from the generated bindings as well.

### Bindings that bundle the runtime

The transpiler applies a profile when it bundles the runtime into generated bindings.
Select it with `runtimeProfile` (`--runtime-profile` on the command line); the default is `checked`.

### Bindings that import the runtime

Both profiles have the same exports, type declarations, and runtime API version,
so the profile is chosen by the base that bindings import:

```sh
jco transpile component.wasm --cm-runtime-es-module @bytecodealliance/jco-cm-runtime       # checked
jco transpile component.wasm --cm-runtime-es-module @bytecodealliance/jco-cm-runtime/debug # debug
```

Modules of different profiles do not share state or private brands,
so one program should import a single profile.

### Building profiles

`pnpm --filter @bytecodealliance/jco-cm-runtime build` builds the package:
the `checked` profile at the top of `dist`, with `dist/debug` beside it.
The `checked` profile is bundled and minified, one module per entry point with shared chunks;
the `debug` profile keeps one module per source file.

To build one profile into a directory of its own,
run `node scripts/build.mjs --profile <profile> --out-dir /path/to/runtime` from this package,
and use that directory as `cmRuntimeEsModule`.

A bundler can also remove labels from the `debug` profile itself, for example with Rolldown:

```js
const bundle = await rolldown({
    input: 'component.js',
    transform: { dropLabels: ['DEBUG'] },
});
```

The runtime must be included in the bundle, rather than marked external.
Apply label removal before optimization passes that discard unused labels.

See the [runtime microbenchmarks](../bench/labels/README.md) for label-removal checks and measurements.

## Allocation and scheduling behavior

### Consuming flat arguments

`params` holds the arguments a lift has yet to consume. For example, a provider
can lift two integers in sequence using the context returned by each lift.

```js
const input = { componentIdx: 0, useDirectParams: true, params: [10, 20] };
const [x, rest] = liftFlatS32(input);
const [y, end] = liftFlatS32(rest);
// x === 10, y === 20, end.params is empty
```

Caller-created contexts, including ones with custom accessors, keep ordinary
array consumption. The runtime uses the same approach for short, one-shot calls.
For runtime-owned vectors of at least 64 arguments, or contexts explicitly
created for reuse, a private cursor lets successive built-in lifts advance
without copying the remaining array for each field. Reading `params` between
lifts can materialize that array. Read it when a custom lift needs the remaining
values or must retain a snapshot.

### Lifting scalars from guest memory

A scalar lift from memory advances the byte offset and reuses a `DataView` while
the backing buffer stays the same. The next lift refreshes the view if the memory
grows. A provider that keeps its own views must check the buffer after any call
that can grow or replace memory.

```js
const ctx = { componentIdx: 0, memory, useDirectParams: false, storagePtr: 0, storageLen: 8 };
const [first, next] = liftFlatS32(ctx); // reads bytes 0–3
memory.grow(1);
const [second] = liftFlatS32(next); // reads bytes 4–7 of the current buffer
```

Built-in composite lifts can read scalar fields directly into a record, avoiding
a temporary result pair per field. Custom lift functions return `[value, context]`.
Return a replacement context when the next field should use different storage.

### Encoding UTF-8 into guest memory

Reuse the store’s encoder across calls. The default uses the Web platform’s
`TextEncoder.encodeInto` to write directly into the guest allocation in browsers
and Node.js. For long ASCII inputs the byte length and scalar count both equal
the JavaScript string length. Mixed Unicode needs a sizing pass. Each nonempty
string makes one exact allocation, and the encoder obtains the destination view
after `realloc` returns so growth during allocation is safe.

```js
const encoder = initializeUtf8Encoder();
const { ptr, len, codepoints } = utf8Encode(encoder, 'A😀', realloc, memory);
// Five bytes at ptr encode two Unicode scalars.
```

A provider can supply its own `encodeInto(input, destination)` to instrument
writes or integrate an existing UTF-8 codec. It reports the UTF-16 units read
and bytes written. It may stop before the end of the string, on a scalar
boundary. The runtime then encodes the rest into the same allocation, as some
Node.js releases stop early although the buffer has room.

### Transferring byte buffers

Compatible byte buffers can copy directly between typed arrays. This avoids
building an intermediate JavaScript array of individual bytes. A custom buffer
can decline the bulk copy before consuming anything. For resource payloads the
element-wise path carries the ownership options through both operations.

```js
if (!source.copyTo?.(target, count)) {
    target.write(source.read(count, options), options);
}
```

For a byte stream delivered to the host, an optional `readBytes(count)` returns
an owned `Uint8Array`. Copy guest-backed bytes before returning them so later
guest writes and memory growth cannot change a chunk the host has retained.

### Reading streams and yielding to the host

The public `queue.readSource()` returns a promise. A provider with data already
available can also expose `readSourceOrPromise()`, which returns the number of
items appended immediately or a promise for that count. Stream injection uses
this capability to avoid a promise and microtask for every ready chunk.

```js
const read = queue.readSourceOrPromise?.() ?? queue.readSource();
const appended = typeof read === 'number' ? read : await read;
```

Use the promise path for a source waiting on I/O. The runtime can deliver
buffered async values while the rest of a requested batch is still unavailable.
After 64 consecutive synchronous source reads, the default queue yields to the
host so timers and cancellation can run. The store tracks that yield as pending
work. Host completions within a microtask checkpoint share a scheduler wakeup.
Each tick resumes one guest thread, giving it time to restore its registers
before the next continuation runs.

### Reading a host stream returned by the guest

A stream lowered from a host source keeps that source on its readable end. When
a guest hands the end back to the host, for example by returning the stream it
was given, both ends belong to the host: a host read then takes its values from
the source's queue, where a write injected for a guest read takes them, without
the buffers and events of a copy. Values a guest read left queued come first,
and a queue that exposes `takeBytes` has byte chunks copied whole. The read
still marks the end as copying, ends with a drop or an instance stop, and honors
`rejectLength` and `dropAfterCopy`. An end that is not idle, such as one with an
event the guest has yet to take, is read through a copy as before.

Such a read of a `u8` stream whose metadata names no typed array returns bytes
as the source gave them. A chunk the source produced as a `Uint8Array` or an
`ArrayBuffer` is read as `Uint8Array` copies of its bytes, and the read ends
with the chunk. Numbers and arrays of numbers are read as values, as they are
through a copy.
