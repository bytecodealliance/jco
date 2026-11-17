# External runtime performance experiments

These benchmarks compare the implemented external runtime with `d7e296bed`,
which contains labels but predates the allocation and scheduling changes.
Both sides strip `DEBUG`. The `retained` and `lean` variants use the current
implementation and respectively retain all labels or strip `DEBUG` and `SAFETY`.
No inline runtime or Rust generator code is changed.

## Implemented opportunities

Each opportunity has its own commit on `perf/glue-labels`:

| Opportunity               | Implementation                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Removable diagnostics     | `DEBUG` labels and audited internal `SAFETY` labels; canonical validation stays unconditional.                      |
| Actual label stripping    | The `checked` and `unchecked` profiles bundle public package entries with shared chunks.                            |
| UTF-16 counting           | Count code points during the existing surrogate-aware write.                                                        |
| Context slots             | Resolve and validate thread storage without allocating thread metadata. No Wasm-side slots.                         |
| Component lookup          | One `Map.get` for an existing component state.                                                                      |
| Memory views              | Cache scalar `DataView`s and refresh after buffer replacement, including growth.                                    |
| Flat arguments            | Long or explicitly reused runtime-owned contexts use lazy cursors; short and caller-created contexts retain arrays. |
| Scalar return pairs       | Built-in composite lifts use private scalar functions; custom lifts keep their public pair API.                     |
| Shapes and specialization | Consistent runtime call-context fields and separate direct/memory scalar leaves.                                    |
| Queues                    | Head cursors, amortized compaction, and release of consumed chunks; preserve prepend snapshots.                     |
| Bulk bytes                | Typed guest-to-guest and guest-to-host copies, owned host chunks, array fallback for custom providers.              |
| Ready streams             | Optional synchronous read capability while retaining the public Promise-returning API.                              |
| Batching                  | Coalesce host-completion wakeups and yield after 64 synchronous source reads.                                       |
| Native UTF-8              | Node byte primitives for large ASCII strings; portable/custom codec fallback and exact single allocation.           |

Wasm-side context slots are intentionally deferred to the separate PR. No gain
from these runtime changes should be interpreted as faster V8 Wasm execution.

## Reproduce

Install workspace dependencies, then run from the repository root:

```sh
node packages/jco-cm-runtime/bench/labels/verify.mjs
node packages/jco-cm-runtime/bench/labels/run.mjs
node packages/jco-cm-runtime/bench/labels/confirm.mjs packages/jco-cm-runtime/bench/output/labels
```

`run.mjs` builds all variants before timing, using `git show` to read baseline
sources without changing the checkout. The baseline's context factory is its
original plain object construction; all other baseline implementation modules
come from the recorded commit. It runs five fresh processes per variant with
nine samples per workload. `JCO_LABEL_BENCH_PROCESSES=1` is a useful smoke run.
`JCO_LABEL_BENCH_OUTPUT` chooses an output directory relative to this package.

`confirm.mjs` alternates baseline/candidate samples, with twelve pairs in each
of five fresh processes. It constructs each module's runtime classes once to
avoid creating more receiver shapes for one variant. Raw samples, process
ranges, Node/V8/CPU information, source snapshots and bundle hashes are saved
under the ignored output directory. `results.json` contains isolated runs;
`paired.json` contains confirmation. Run functional tests separately from timing.

The context-Wasm test is a real core Wasm loop calling a bound runtime import,
with actual task/thread owners. It is not a compiled P3/JSPI application. Other
cases invoke the runtime from JavaScript. Flat record tests include complete
fresh caller and runtime-owned contexts; scalar tests also exercise reused
contexts. Buffer tests include constructors and validate the last copied byte.
The 4 KiB bulk-copy test replaces boxed byte iteration, so its large ratio is
specific to that operation, not overall I/O throughput. String allocation uses
a fixed output address to exclude allocator cost. Setup and compilation are
outside timing; per-operation objects remain inside it.

Known-answer checks cover context switching, stale identities, fresh realloc
slots, invalid slots, resource traps, memory growth and surrogate repair. Tests
also cover shared memory, custom callbacks/codecs, retained arrays, cancellation,
late disposal, fairness, minimal-capability imports and mixed public entrypoints.

## Regression checks and builds

From this package directory:

```sh
pnpm types:check
pnpm test
pnpm exec vitest run -c bench/labels/vitest.config.mjs
JCO_RUNTIME_DROP_LABELS=DEBUG,SAFETY pnpm exec vitest run -c bench/labels/vitest.config.mjs
pnpm build
```

The full suite includes release/lean package builds and standalone runtime
conformance checks. Normal `build` and `prepack` retain diagnostics. The alternate
Vitest configurations strip labels in runtime sources before running tests.

## Earlier prototypes

The initial source-substitution probes and their measurements are preserved at
`d7e296bed` (including `prototypes.mjs`). They are historical leads, not results
for the implementations on this branch. In particular, applying accessors to
arbitrary caller-created contexts proved too expensive in the fresh-record
benchmark, despite the earlier reused-context cursor probe looking promising. Cursor setup
is now limited to vectors of at least 64 arguments, or explicit reuse by an
internal caller. The reused 16-field record probe explicitly opts in; the fresh
16-field probes do not. The 128-field test explores a generic helper beyond the
usual Canonical ABI flat-argument limit; it is not a typical generated call.
The current harness measures complete implementations instead of substitutions.

## Implemented measurements

Results are microbenchmarks, not application-level throughput or latency claims.
Small differences whose process ranges overlap one are inconclusive. Bundle
sizes include the benchmark harness and are not application bundle sizes.

Measured source: `f11b4acd8c5131882736a5766891ecbd0825193a`.
Baseline: `d7e296bed`, with `DEBUG` stripped on both sides.
CPU: Intel(R) Xeon(R) Processor @ 2.60GHz, Linux x64.
Node 24.21.0 / V8 13.6.233.17-node.53; Node 26.13.0 / V8 14.6.202.34-node.40.

Each cell is the median of five process median speedup ratios. Parentheses show
the range of those process ratios, not a confidence interval. Values above one
are faster. The first row compares current retained and stripped implementations;
other rows compare the pre-optimization baseline with the current implementation.

| Workload                       | Node 24 speedup (range) | Node 26 speedup (range) |
| ------------------------------ | ----------------------- | ----------------------- |
| Strip DEBUG: context Wasm loop | 1.02× (0.92–1.05)       | 1.01× (0.92–1.02)       |
| record-flat-16-reused          | 1.60× (1.56–1.82)       | 1.65× (1.64–1.66)       |
| record-flat-16-fresh           | 1.02× (0.96–1.11)       | 1.03× (1.01–1.05)       |
| record-flat-16-owned           | 1.02× (1.00–1.16)       | 1.02× (0.97–1.05)       |
| record-flat-128-owned          | 1.54× (1.47–1.65)       | 1.53× (1.48–1.58)       |
| context-js                     | 1.12× (1.09–1.14)       | 1.18× (1.17–1.20)       |
| context-wasm                   | 1.16× (1.09–1.17)       | 1.18× (1.15–1.18)       |
| rep-get                        | 0.31× (0.28–0.32)       | 1.00× (0.99–1.01)       |
| rep-recycle                    | 0.80× (0.79–0.81)       | 1.02× (0.97–1.03)       |
| lift-flat-16                   | 0.78× (0.77–0.82)       | 1.01× (0.99–1.02)       |
| lift-memory-16                 | 2.53× (2.31–2.79)       | 4.26× (4.16–4.73)       |
| utf16-1280-units               | 1.45× (1.41–1.51)       | 1.45× (1.44–1.47)       |
| utf8-ascii-4096                | 2.10× (1.67–2.12)       | 2.31× (2.28–2.35)       |
| utf8-mixed-4096                | 1.02× (0.97–1.04)       | 1.01× (0.99–1.06)       |
| queue-4096-chunks              | 3.08× (3.02–3.12)       | 2.59× (2.53–2.73)       |
| bulk-bytes-4096                | 140.02× (134.35–143.54) | 282.07× (274.34–292.80) |

The short-record regression encountered during implementation was removed by
keeping public integer consumption on its ordinary array path, selecting the
plain record loop once per call, and using named public functions instead of a
shared closure dispatcher. Cursor and scalar-capability paths remain private to
optimized composition. Fresh short records are approximately neutral; reused
records and long vectors benefit. The direct public scalar loop is a control,
not a cursor benchmark.

**Node 24 paired-control anomaly:** the paired run reports regressions for
`rep-get`, `rep-recycle`, and direct public scalar calls. The representation-table
implementation is unchanged from the baseline. A separate five-process isolated
check, using byte-for-byte identical bundle hashes, did not reproduce those
regressions:

| Node 24 isolated control | Baseline ns/op (process range) | Current ns/op (process range) |
| ------------------------ | ------------------------------ | ----------------------------- |
| rep-get                  | 2.38 (2.12–2.48)               | 2.31 (2.29–2.70)              |
| rep-recycle              | 11.52 (9.91–13.66)             | 11.24 (9.72–12.21)            |
| lift-flat-16             | 56.21 (54.90–67.18)            | 55.36 (48.79–57.66)           |

This indicates sensitivity to the combined benchmark/JIT context; it does not
establish a production regression or a speedup for those controls. Absolute
values also varied with machine load. The large allocation/byte-copy gains appear
in both isolated and paired measurements, but application-level throughput,
JSPI latency, cold start, and GC behavior remain unmeasured.

To reproduce the isolated check with Node 24, from this package:

```sh
JCO_LABEL_BENCH_PROCESSES=5 \
JCO_LABEL_BENCH_CASES=rep-get,rep-recycle,lift-flat-16 \
JCO_LABEL_BENCH_OUTPUT=bench/output/controls24 node bench/labels/run.mjs
```

Raw local artifacts are in `bench/output/validated24`, `validated26`, and
`controls24`, including paired samples and matching bundle SHA-256 hashes.

### Bundle size

These are the same benchmark entrypoint, including its test setup and workloads.
Node 24 and Node 26 produced identical bundle hashes.

| Build     | Minified bytes | Gzip bytes |
| --------- | -------------: | ---------: |
| baseline  |        102,657 |     29,610 |
| optimized |        108,214 |     31,082 |
| retained  |        120,827 |     33,694 |
| lean      |        108,110 |     31,028 |

Dropping DEBUG removes 10.4% of current minified bytes and 7.8% of gzip
bytes. The additional fast paths have a code-size cost: the current stripped
bundle is 5.4% larger than the already-stripped pre-optimization baseline.
Label stripping and the aggregate implementation-size change are separate effects.

### Final validation

- TypeScript type checking, formatting, lint, and bundled label/trap verification pass.
- Node 26: all 429 tests pass with labels retained, DEBUG removed, and DEBUG+SAFETY removed.
- Node 24: all 429 tests pass with labels retained.
- Every full suite also builds release and lean packages and runs standalone runtime conformance on both.
- Minimal-capability package imports, custom callback/context handoffs, memory growth, cancellation ordering, fairness, and owned-byte lifetimes are covered.

The native UTF-8 candidate was restricted to large ASCII strings after mixed
Unicode regressed on Node 24. Creating accessors on arbitrary caller objects was
also rejected: a V8 fast-properties probe confirmed that converting existing
`params` data properties puts those objects in dictionary mode, while adding a
shared accessor to a fresh runtime-owned context retains fast properties.
