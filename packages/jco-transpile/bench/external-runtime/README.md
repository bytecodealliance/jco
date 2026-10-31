# Named external runtime smoke measurements

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
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime:smoke --record
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime:smoke
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime:parity
```

N01 supplies the early smoke matrix. `bench:external-runtime` currently runs this
same matrix; N13 expands it to the full historical portfolio. Investigation and
matched factory comparisons follow at N14. These commands are separate from
normal, LTS and extended functional discovery. Run them serially on an idle machine
after builds and functional suites stop. Select an installed Rust toolchain with
`RUSTUP_TOOLCHAIN` if the local `stable` wrapper tries to update itself.

The matrix covers a truly empty component, a code-only scalar noise control, adder, resource create/read/drop and
two independent resource components sharing one bundle. Rolldown and Rollup each
resolve both file URLs and actual package exports. Used and unused `tableGet`
imports execute known answers; an instrumented child confirms that the used
operation constructs no scratch arrays, codecs or maps. Both modes must have
identical core Wasm digests. The empty component and scalar control must be byte-identical in both modes;
the scalar control calibrates noise on all timing axes. Every timed workload validates varying inputs and
an independent checksum, including both components in the sharing workload.

All bundles and correctness checks finish before timing starts. Defaults are five
fresh processes per matrix entry, each with 15 alternating paired samples after
common warmup/calibration. Scenario order rotates deterministically (seed 20261021).
`JCO_EXTERNAL_RUNTIME_BENCH_PROCESSES=10` expands an unresolved comparison;
`JCO_EXTERNAL_RUNTIME_BENCH_SAMPLES` may increase samples above 15. Preserve the
initial run when expanding; never retain only a favorable retry.

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
these exclude native/Wasm allocations and are not memory-footprint claims or gates.

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
requires the complete matrix and is refused in CI or with filters. It occurs only
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
