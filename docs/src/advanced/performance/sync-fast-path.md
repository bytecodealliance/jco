# Sync fast path

By default, every call of a component function creates Component Model task state: a task and a
thread for an export, and a subtask and a host task for an import. Asynchronous functions need that
state. A component whose functions are all synchronous pays for it without using it.

`jco transpile --perf-sync-fast-path` (`perfSyncFastPath` in the JS API) generates the synchronous
exports and imports of such a component without that state. The option is off by default.

## When it applies

The option takes effect for a whole component, and only when nothing in it can observe the state
that is skipped:

- one component instance owns every core module, lift and lower (a component composed of several
  instances calls between them through adapters, which run on behalf of the calling task);
- no function is `async`, and no lift or lower is asynchronous or has a callback;
- no stream, future or error-context type is used;
- no core module imports a canonical built-in other than `resource.new`, `resource.rep` and
  `resource.drop` (this excludes `context.get`, `context.set`, and the task, thread, waitable and
  backpressure built-ins);
- no import or export is asynchronous through `--async-mode jspi`;
- `--call-tracking`, `--js` and the optimized import bindings are not in use.

Any other component is generated exactly as without the option, and nothing is printed by
default.

When the option was set but did not apply, the transpile result says which of the rules above
ruled it out: `syncFastPathBlocker` in the JS API, `sync_fast_path_blocker` on the Rust
`Transpiled` result. It is unset when the option applied or was not set. With `JCO_DEBUG` set,
`jco transpile` and `@bytecodealliance/jco-transpile` also log it with `console.debug`, for
example `component [calls] does not use the sync fast path (perfSyncFastPath): call tracking is
enabled`.

The `js-component-bindgen` crate also logs whether it used the fast path, and if not why, as a
debug message of the Rust `log` crate, which a Rust program sees once it installs a logger.

## What stays the same

A call on the fast path still does everything that a caller, a host function or a guest can
observe:

- an instance that trapped or was stopped cannot be entered, and a trap is recorded and reported
  to `onTrap` wherever it happens: in the guest, in post-return, or thrown by a host function;
- stopping the instance from a host function or from the destructor of a resource fails the call
  that is running, and no host function is called for the guest afterwards;
- a host function that throws fails the export that called it with what it threw first, even if
  the guest catches the exception and returns normally;
- a guest may not call an import while it may not leave its instance, for example from `realloc`;
- borrowed handles are released at the end of their call, and a post-return function runs after
  each call that returned a value, including an error value of a `result`;
- a promise that a host function returns from a synchronous import is counted as a pending host
  operation until it settles or the instance is stopped. As by default, the guest receives the
  promise object itself, not its value, and `whenIdle` does not wait for it.

The tests of the option run the same sequences of calls with and without it and compare every
return value, thrown error, reported trap and host callback.

One difference is known. When a host function throws `null` or `undefined` and the guest catches
it, the export fails by default with an internal error that says its task is already resolved;
on the fast path it fails with the thrown value.

## Measured effect

Nanoseconds per call, bindings with the runtime bundled in, Node.js 26.13 on Linux x86-64:

| case | default | `--perf-sync-fast-path` | speedup |
| --- | ---: | ---: | ---: |
| export `u32 -> u32` | 711 | 18 | 40x |
| export `f64 -> f64` | 735 | 33 | 22x |
| export `tuple` swap | 905 | 131 | 6.9x |
| export `record -> record` | 1037 | 187 | 5.5x |
| export `string -> string` | 2074 | 1296 | 1.6x |
| export `list<u8> -> list<u8>` | 2967 | 2541 | 1.2x |
| one export that calls 39 numeric imports | 71063 | 5884 | 12x |
| one export that calls 2 string imports | 5435 | 944 | 5.8x |

The fixed cost of a call is what is removed, so the gain shrinks as lifting and lowering of the
values comes to dominate. Components that use asynchronous functions, streams or futures are
unchanged: their generated bindings are byte for byte the same.

The numbers come from `packages/jco-transpile/bench/perf`, which interleaves fresh processes of
each variant; the table keeps the fastest of four observations per case:

```sh
node gen.mjs base embedded
node gen.mjs fast embedded --perf-sync-fast-path
node compare.mjs --runs=4 base fast
```

They were taken on a shared machine and vary between runs; compare the ratios on your own hardware
rather than relying on the absolute values.
