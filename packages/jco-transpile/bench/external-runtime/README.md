# Named external runtime measurements

Build the local transpiler/vendor and the Component Model runtime first. Validate
the complete smoke matrix without collecting timing samples:

```sh
pnpm --filter @bytecodealliance/jco-transpile test:bench:external-runtime
```

This checks matching core Wasm, known answers, both bundlers and both resolution
methods on every rewritten branch. Source provenance covers the trait contract,
both runtime implementations and their callers, including nested family mappings.
The public runtime API remains version 1. Timing comparisons are a separate run:

```sh
pnpm --filter @bytecodealliance/jco-transpile types:check:bench:external-runtime
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime:verify
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime:smoke --record
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime:smoke
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime --record
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime:parity
```

N13 restores the full historical portfolio. The default and parity commands run
all 17 scenarios through both bundlers and both resolutions: 68 reports. Explicit
`--smoke` keeps the original eight-scenario, 32-report matrix. Both selections
require every declared report and all 360 used/unused import controls; partial
recording is refused. Investigation and matched factory comparisons follow at N14. These commands are separate from
normal, LTS and extended functional discovery. Run them serially on an idle machine
after builds and functional suites stop. Select an installed Rust toolchain with
`RUSTUP_TOOLCHAIN` if the local `stable` wrapper tries to update itself.

N14's separate `bench:external-runtime:investigate` command consumes the verified
four-mode matrix and an independent bundle-hash anchor. It runs serially outside
Vitest, with mandatory complete five- and ten-process cohorts and both inline
controls. See the [input preparation and collection instructions](investigation/README.md).
It preserves failures and raw samples, refuses recording/filters and keeps
browser/allocation investigations separate from accepted timing.

The matrix covers a truly empty component, a code-only scalar noise control, adder, resource create/read/drop and
two independent resource components sharing one bundle. N02 also includes the
existing numbers and variant-bitcast components, with varying verified checksums. Rolldown and Rollup each
resolve both file URLs and actual package exports. Used and unused `tableGet`
imports execute known answers; an instrumented child confirms that the used
operation constructs no scratch arrays, codecs or maps. Conversion controls verify
that scalar imports allocate no scratch, while each bitcast initializer constructs
only its selected pair of views. N03 adds a context-free no-op control and a
selected DataView cache control: importing the no-op allocates nothing, and the
cache initializes one empty view and refreshes once on first memory use. Repeated
access to the same buffer reuses that view. Both modes must have
identical core Wasm digests. The empty component and scalar control must be byte-identical in both modes;
the scalar control calibrates noise on all timing axes. Every timed workload validates
returned values against independent expected answers, including both components in
the sharing workload. Numeric, bitcast, string, list, record and future workloads
vary their payloads; fixed-protocol cases retain their fixture's known result.

N04 adds the existing string component, including its actual WASI and string host
imports. The workload verifies Unicode/BOM round trips and the host-import
protocol, then hashes every returned UTF-16 code unit for varying string payloads;
expected hashes start from an independently fixed prefix checksum. Separate
string-character, UTF-8/UTF-16 decoder, UTF-8 encoder/allocation and UTF-16
endianness controls trace only selected codecs and views. Constructor tracing now
also counts Uint8Array and Uint16Array, separately from timing.
State inventories include initialized codec values as well as context objects;
the string graph must record its selected UTF-8 encoder and decoder owners.

N05 adds used/unused WebIDL cache and proxy controls. Empty-cache initialization
must access no Proxy/Symbol capability; first adapter use creates exactly two
private symbols and one proxy, and repeated use reuses it. Tracing uses a captured
native Proxy to keep instrumentation wrappers out of its own counts. The component
portfolio still uses explicit instantiation, so its WebIDL imports come from
supplied imports rather than the direct-module global adapter; direct WebIDL
behavior is covered by the functional Node/browser cases.

N06 adds resource cells, table-owner and shared-allocator controls. Cell and table
initializers allocate no traced constructors. Allocating two resource kinds for
one component and removing an owned handle selects exactly two Maps (allocator
and scope-task lookup), with no task, scratch or codec initialization. The mapped
set now includes all resources plus the shared handle-table and scope owners
(50 variants). Real component graphs record the selected owner initializers and
remaining inline task dependencies separately.

N07 expands the mapped set to 102 variants and adds eight used/unused core
controls: scalars, native error-payload capability, task registers, representation
and error constructors, memory lookup, buffer-manager ownership and empty
conditional-JSPI module storage. Pure/task/error controls allocate no traced
constructors; two representation classes create two private symbols. Memory
lookup creates one Map; the buffer manager plus its explicitly supplied resource
owners create four Maps. Empty conditional storage reads no optional JSPI API.
These are isolated import controls, separate from real component graphs.
The checkpoint records hashes of both the central descriptor source and its
nested core descriptor module, in addition to the actual compiler artifacts.

N08 expands coverage to 118 variants and adds five component controls. Empty
component owners create two Maps; the may-leave and trap-message controls create
one each. Synchronous host-operation tracking creates only its state Map and
returns the synchronous result unchanged. Selected component-class construction
uses actual prerequisites from the core and resource subpaths: six Maps and one
private representation-table symbol, with no waitable, codec or scratch storage.
Controls can import explicit prerequisites from multiple public subpaths under
the same file/package resolution policy. The manifest also hashes the nested
component descriptor source. The paired inline backpressure fix is part of this
checkpoint's same-revision comparison; older inline bundle hashes can change.

N09 expands coverage to 126 variants and adds selected waitable/set constructor
controls. The waitable initializer takes no context, and the set initializer
receives only the selected live cancellation code. These controls create no
instances of the traced native constructors; ordinary objects, arrays, class
environments and Promises are outside those counters. The component-class
control now explicitly selects its waitable constructor from the new subpath,
without constructing a waitable. The checkpoint hashes the nested waitable
descriptor source. Four paired inline waitable fixes are included, so every
comparison uses fresh inline output from this revision.

N10 expands coverage to 137 variants and adds four error-context controls.
Empty owners allocate one Map; selecting the lazy global-table class allocates
only the selected representation-table class's private symbol. Global reservation
and refcount adjustment use that same class without selecting component/task
state. Local upsert allocates two Maps and one symbol. These native-constructor
counts exclude ordinary objects, arrays, functions and class environments. The
manifest hashes the nested error-context descriptor source. The checkpoint
compares every bundle with N09 before attributing any new graph cost to this
family; the broader error-context/shared portfolio remains N14/N19 work.

All bundles and correctness checks finish before timing starts. Defaults are five
fresh processes per matrix entry, each with 15 alternating paired samples after
common warmup/calibration. Scenario order rotates deterministically (seed 20261021).
`JCO_EXTERNAL_RUNTIME_BENCH_PROCESSES=10` expands an unresolved comparison;
`JCO_EXTERNAL_RUNTIME_BENCH_SAMPLES` may increase samples above 15. Preserve the
initial run when expanding; never retain only a favorable retry.
The whole-matrix harness deadline scales with entry/process/sample counts (30
seconds per entry at five processes and 15 samples, with a ten-minute minimum).
It is recorded separately from the unchanged two-minute child deadline and all
statistical/size acceptance budgets.

Raw, gzip level 9 and Brotli quality 11 are separate axes. Fresh unique source is
parsed in `vm.SourceTextModule`; the next axis includes linking and evaluation.
Initialization uses precompiled core Wasm. Warm calls keep synchronous operations
synchronous. Cold native ESM import plus initialization is separately reported;
it includes native module loading, excludes process launch, core compilation and
host import setup, and is not end-to-end network latency. Dynamic debug behavior
remains enabled in the code; no debug-removal or purity transforms apply.

Raw samples and per-process paired ratios are retained. Process medians are
summarized with their range and a deterministic percentile cluster bootstrap
(10,000 resamples, 95% interval); inner samples are not independent repetitions.
Five processes provide limited uncertainty resolution. A material speedup requires
at least 5%, a ratio interval below 1, and an effect exceeding the identical-code
control's noise. Other timing differences remain inconclusive. Constructor tracing
runs separately from timing. Memory runs in a separate process per mode, warms up,
retains 64 stores in an explicit global until after GC and validation, and records
heap/external/ArrayBuffer deltas. Negative observations invalidate the diagnostic;
they are not complete process-memory claims or gates. The counters overlap and
must not be added together. In the measured Node 24 environment, external accounting
includes WebAssembly linear memory while ArrayBuffer accounting does not fully
represent it. A retained 16 MiB Wasm memory raised external by approximately 16 MiB
and left ArrayBuffer accounting unchanged. Earlier blanket native/Wasm exclusions
were too broad; the original counter values stay unchanged. Native code, stacks,
allocator overhead, reserved address space and total RSS are not fully measured.
The separate `node --expose-gc bench/external-runtime/memory-accounting-probe.mjs`
diagnostic reproduces this counterexample; accounting details depend on the engine.

Each invocation creates a fresh `bench/output/external-runtime-named/run-*` archive,
including generated inputs, bundles, graphs, hashes, raw samples and a manifest.
`latest.json` identifies running/failed/complete runs, so stale output cannot appear
current. `JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT` changes the output root. The old
`bench/output/external-runtime` evidence remains untouched.

The snapshot carried from the original stack is historical evidence; it does not
validate the rewritten trait-based generator. A changed generator requires a fresh
checkpoint. New snapshots live in `named-baselines/<checkpoint hash>.json`. Their schema keys
coverage, fixture/options, resolution matrix, toolchain, lockfile and benchmark
implementation. A coverage change creates a fresh reviewed checkpoint. Recording
requires the complete selected matrix and is refused in CI or with filters. An
existing checkpoint baseline cannot be overwritten. It occurs only
after all correctness and integrity tests pass. Missing data and failed runs never
publish a complete summary. Historical factory baselines remain unchanged at
`11f17e35`/`b5931a41` and are not used as current measurements.

Regression acceptance and inline parity are separate. Size regression checks both
absolute modes (+5% +128 bytes) and their ratio. Timing regression allows the larger
of the parity ratio and the checkpoint ratio times 1.35, plus the noise floor.
Strict parity budgets are inline +5% +256 raw bytes, +5% +128 compressed bytes,
+25% +25 microseconds parse/link+evaluation, +25% +50 microseconds initialization,
and +25% +250 ns calls. Cold import and memory are diagnostic, without acceptance
budgets. Never re-record merely to hide a regression. Inline remains the production
default; passing a baseline gate does not establish parity.

To recompute uncertainty from a preserved complete result without changing its
measurements or parity gates (using the validated Node 24 toolchain):

```sh
node bench/external-runtime/reanalyze.mjs bench/output/external-runtime-named/run-EXAMPLE/result.json /tmp/fresh-analysis.json
```

The output must be a new file. It embeds the analysis sources and hashes its input.
The corrected process-cluster sampler uses mixed full-word random indices; this
avoids the ten-process low-bit parity correlation found during N06. Original
reports remain unchanged; label reanalysis separately from fresh collection.

N11 expands coverage to 162 variants and adds seven task controls: the blocked
value, independent owners, pure lookup, selected raw register instances,
creation/lookup/clearing through structural task views, subtask class selection
and task class/resource-scope sharing. All 336 used/unused combinations run with
the complete portfolio. Class controls use actual selected component, resource,
core and waitable owners and verify that initialization does not invoke the lazy
future predicate. Counts cover only the native constructors traced by the harness;
ordinary class instances, arrays, objects, closures and Promise internals are
not inferred from them. The raw-register control uses a selected constructor
witness; native cross-realm globals have separate functional tests. The checkpoint
hashes the nested task descriptor and current compiler/runtime. Prior inline
measurements do not replace this revision's paired measurements.

## Full portfolio and CI

The full catalog retains the twelve historical component cases: adder, numbers,
strings, lists, records, variants, flavorful, resource ownership/drop, waitable
events, sync-lowered async guest calls, streams and futures. The independent
resource fixture, empty component and scalar noise control remain. Aggregates
cover two resource components and the historical eight-component portfolio
(adder/numbers/strings/lists/records/variants/flavorful/resources).

List workloads verify subarray offsets and stable guest allocation counts; record
and flavorful workloads check nested values. Resources check actual drop counts;
async and future calls check known results and timed checksums. The zero-length
stream case leaves a read pending, so it supplies lifecycle/initialization evidence
without a reusable warm-call or payload-throughput claim. Broader payload and
steady-state async/stream/future work remains N14/N19.

`bench:external-runtime:verify` runs real bundled known answers and integrity
canaries separately from timing. The normal/LTS/extended configurations do not
discover benchmark files. CI runs strict types, this preflight and the complete
strict-parity command once on Ubuntu/Node 24/inline, after functional suites.
It checks Linux `/proc` for remaining workspace fixture, Vitest, compiler,
browser and benchmark workers before timing; completing a command alone does
not establish process isolation. This read-only audit never stops processes.
It uploads raw artifacts even if parity fails. CI never records or silently uses
a baseline from a different producer/toolchain fingerprint; documented parity
losses can therefore produce an explicit failed comparison step. Local regression
acceptance continues to require the exact reviewed checkpoint.

The original N12 reached the historical 166-variant set and added context-free event
writing, selected prepare traps and lazy start-capability controls. Its 360
used/unused combinations remain in both matrices. The trait-based rewrite also
includes the new base's thread operations; `coverage.json` records its selected
variants. Source fingerprints include the complete trait, inline and external
implementation trees rather than the original metadata layout. An elevated process audit found
eight orphan workers from the initial N08 run; N08–N11 observations retain an
isolation limitation and require clean frozen-artifact repair during N14. N12
collected both clean cohorts after verified cleanup. On this long-running local
workspace, use the elevated process view when checking for old test workers; the
sandbox process view missed them.
