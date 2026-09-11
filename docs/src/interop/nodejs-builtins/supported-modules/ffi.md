# `node:ffi` (Node.js v26+)

| Imports | Implementation |
| --- | --- |
| `node:ffi` | `@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi` |

`node:ffi` lets a component call native code on the host.

As WASI has no dynamic loader and a component has no host address space, this is host-backed, like
`node:child_process`, and is **denied by default**.

To use the NodeJS passthrough version, you can map it in:

```console
jco transpile component.wasm \
  --map 'jco:node/ffi@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi/host/node'
```

> [!NOTE]
> The host adapter forwards to the runtime's real `node:ffi`, so the runtime
> must itself be Node 26 started with `--experimental-ffi`.
>
> Without it, calls fail with a message naming the version and the flag rather
> than a missing-module error.

using the load-call-read-write cycle would look something liek this:

```js
import { DynamicLibrary, exportString, getInt32, setInt32, toString } from 'node:ffi';

// null resolves symbols from the host process image, which links libc.
const lib = new DynamicLibrary(null);
const malloc = lib.getFunction('malloc', { arguments: ['uint64'], return: 'pointer' });
const strlen = lib.getFunction('strlen', { arguments: ['pointer'], return: 'uint64' });

const pointer = malloc(64n);
setInt32(pointer, 0, 123456);
getInt32(pointer, 0); // 123456, read back out of host memory
exportString('hello ffi', pointer, 64);
strlen(pointer); // 9n -- native code reading what the guest wrote
toString(pointer); // "hello ffi"
```

Pointers cross as `bigint`, matching NodeJS.

Errors keep NodeJS's own codes, so `ERR_FFI_LIBRARY_CLOSED` and friends behave as they would on Node.

## `node:ffi` incompatibilities

These are refused guest-side, before the host is reached, because a WebAssembly component
cannot express them:

| Surface                                                                          | Why                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getRawPointer(buffer)`                                                          | Guest memory is not mapped into the host address space, so a component's buffer has no host address. Any number returned would be a lie native code then dereferences.                                                                                                                       |
| `registerCallback()`, `unregisterCallback()`, `refCallback()`, `unrefCallback()` | A native callback is a function pointer the host would call back into the guest through, which the component boundary cannot carry.                                                                                                                                                          |
| `toBuffer(p, n, false)`, `toArrayBuffer(p, n, false)`                            | `copy: false` asks for a live view into host memory. Omit the argument for the copy Node returns by default.                                                                                                                                                                                 |
| A `buffer`, `arraybuffer`, or `function` **argument type**                       | A buffer argument would be copied, so native code writing through the pointer would write into a copy the guest never sees -- silently. Declare a `pointer` and use `toBuffer`/`exportBuffer`, which copy explicitly. Refused when the signature is declared, so the message names the type. |

## `node:ffi`'s use of `suffix`

`suffix` comes from the host, but not at module load: a component's top-level code runs under
Wizer, which refuses imported calls outright ("You cannot call arbitrary imported functions during
Wizer initialization").

`suffix` is seeded with `"so"` and replaced the first time the guest touches
the host -- or on the first read of `ffi.suffix`, which syncs before answering.

The one stale window is a destructured `import { suffix }` read before any FFI call, which is also
the documented ``dlopen(`./lib.${suffix}`)`` idiom.

The host adapter therefore lets the application set it, which is the reliable way to
serve a guest that names `.dylib` or `.dll` files:

```js
import { setSuffix } from '@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi/host/node';

setSuffix('dylib'); // before instantiating the component
```

Note that you may not need to change the suffix if the runtime already has it set properly, as
`suffix` defaults to the runtime's own `ffi.suffix`.
