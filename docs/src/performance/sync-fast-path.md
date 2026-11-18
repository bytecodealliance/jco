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

Any other component is generated exactly as without the option, with no warning. To find out
whether the option applied, compare the output with and without it.

## What stays the same

A call on the fast path still does everything that a caller, a host function or a guest can
observe:

- an instance that trapped or was stopped cannot be entered, and a trap is recorded and reported
  to `onTrap` wherever it happens: in the guest, in post-return, or thrown by a host function;
- stopping the instance from a host function or from the destructor of a resource fails the call
  that is running, and the guest does not continue after the host function returns;
- a guest may not call an import while it may not leave its instance, for example from `realloc`;
- borrowed handles are scoped to their call, and post-return functions run once per call;
- a promise returned by a host function is tracked until it settles, so that `whenIdle` waits for
  it.

The tests of the option run the same sequences of calls with and without it and compare every
return value, thrown error, reported trap and host callback.

## Measured effect

Nanoseconds per call, bindings with the runtime bundled in, Node.js 26.13 on Linux x86-64:

| case | default | `--perf-sync-fast-path` | speedup |
| --- | ---: | ---: | ---: |
| export `u32 -> u32` | 844 | 21 | 40x |
| export `f64 -> f64` | 830 | 32 | 26x |
| export `tuple` swap | 1012 | 131 | 7.7x |
| export `record -> record` | 1166 | 211 | 5.5x |
| export `string -> string` | 2313 | 1453 | 1.6x |
| export `list<u8> -> list<u8>` | 3839 | 2819 | 1.4x |
| one export that calls 39 numeric imports | 87993 | 6819 | 13x |
| one export that calls 2 string imports | 6198 | 1337 | 4.6x |

The fixed cost of a call is what is removed, so the gain shrinks as lifting and lowering of the
values comes to dominate. Components that use asynchronous functions, streams or futures are
unchanged: their generated bindings are byte for byte the same.

The numbers come from `packages/jco-transpile/bench/perf-experiments`, which interleaves fresh
processes of each variant and keeps the fastest of four observations per case:

```sh
./gen.sh base embedded
./gen.sh fast embedded --perf-sync-fast-path
node compare.mjs --runs=4 base fast
```

They were taken on a shared machine and vary between runs; compare the ratios on your own hardware
rather than relying on the absolute values.
