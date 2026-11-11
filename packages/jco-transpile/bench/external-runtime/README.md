# Named runtime benchmarks

These benchmarks compare bindings that bundle the runtime (`inline`) with bindings
that import its named exports (`external`).
Each run builds both modes from the same revision and fixtures.

## Running

Run the complete CI benchmark locally from the repository root:

```sh
node script/bench-runtime.mjs
```

This installs dependencies, builds the transpiler, runtime and fixtures, checks
types and bundled correctness, and runs the existing full parity suite. It requires
Node.js 24+, pnpm 11 and the repository's Rust toolchain. Use `--skip-build` to reuse
prepared dependencies and artifacts. Run on an otherwise idle machine; Linux runs
also audit for leftover workers before timing.

The independent `runtime bench` workflow runs this same script on pushes
and pull requests to `main`, for merge groups, and through **Run workflow** in the
GitHub Actions UI once the workflow is on the default branch. Its build and benchmark
work runs independently of the main test workflow. It publishes the results tables
and run status to the GitHub Actions run summary and uploads the `runtime-bench`
artifact even when the benchmark fails. If the run ends before measurements complete,
the summary explains that results are unavailable and points to the job logs.

Print the latest report locally without running the benchmark again:

```sh
node script/bench-runtime.mjs --summary
```

The same command appends to `GITHUB_STEP_SUMMARY` when run in GitHub Actions.

Build the local transpiler, Component Model runtime, and test fixtures first
(see [transpilation tests](../../test/README.md)).
Run measurements on an otherwise idle machine, after builds and functional tests finish.

```sh
cd packages/jco-transpile
pnpm bench:external-runtime:verify          # Bundled correctness checks without timing
pnpm bench:external-runtime:smoke           # Smaller matrix; checks inline/external budgets
pnpm bench:external-runtime                 # Full matrix; checks inline/external budgets
pnpm bench:external-runtime:parity          # Compatibility alias for the full matrix
```

Every measurement run checks external-runtime size and timing against the inline
runtime from the same build. No historical measurements are required or loaded.
`--parity` remains an accepted compatibility option; `--record` is no longer supported.
Full and smoke runs share `test/foundation.ts` and the same fixture catalog.

The top-level script runs the full matrix, which builds and verifies each bundle once before
measuring it and runs the integrity canaries once. Use `verify` independently when only
correctness checks are needed. Both entry points use `verify.ts` for coverage, import
controls and bundle validation, and share the integrity tests. The standalone verifier
always covers the full matrix; timing commands select either the full or smoke matrix.

Per-run artifacts support inspection, visualization and reanalysis:

| Artifact                       | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `manifest.json`                | Inputs, environment, fingerprints and built graphs for one run |
| `benchmark-source.json`        | Benchmark source text captured for that run                    |
| `result.json` / `summary.json` | Measurements, raw samples, uncertainty and comparison outcomes |
| `summary.md`                   | Readable size, timing and uncertainty tables                   |

Run artifacts go under `bench/output/external-runtime-named/run-*`.
`JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT` overrides the output root; `latest.json` identifies the latest run and its status.
Completed measurement runs include a manifest, captured benchmark sources, raw measurements,
and JSON/Markdown summaries even when parity fails. Keep generated run artifacts out of commits;
the workflow uploads them as CI artifacts.

## Measurements and checks

- Each scenario is bundled with Rolldown, using both file-URL and package imports.
  Both modes are tree-shaken and minified, including retained external-runtime code.
- Size reports count JavaScript bytes: raw, gzip level 9, and Brotli quality 11.
  Core Wasm is recorded separately and must match across modes.
- Known-answer tests and unused-import controls run before timing.
  All bundles are built before measured processes start.
- Timing separates parsing, linking/evaluation, initialization, and warm calls.
  It excludes process launch and core Wasm compilation.
  Defaults are five fresh processes and 15 paired samples per process, with alternating mode order.
- Reports include process-based confidence intervals and identical-code noise controls.
  Cold imports and memory counters are separate diagnostics.

All measurement runs enforce external-versus-inline budgets.
The exact thresholds and statistical rules live in [report.ts](report.ts).
Gzip allows 7.5% overhead plus 256 bytes, Brotli 6% plus 256 bytes, and raw size 5% plus 256 bytes.
Parity failures list every affected scenario, resolution, and metric, with inline and external
measurements, the budget formula, and the excess in bytes or nanoseconds and as a percentage of the budget.

## Input fingerprints

`inputFingerprint` in the manifest and results is a lowercase SHA-256 digest of the benchmark inputs.
It identifies the inputs for provenance; it does not select a comparison target.
[The benchmark test](test/foundation.ts) computes:

```js
inputFingerprint = sha256(
    JSON.stringify({
        coverage,
        settings,
        implementation,
        versions,
        node: environment.node,
        lock: environment.lockHash,
        fixtureHashes,
        bindings: environment.bindingSourceHashes,
        compilerArtifacts,
        runtimeArtifacts,
        shimArtifacts,
    }),
);
```

- `coverage` is parsed `coverage.json`; `settings` includes the portfolio, sampling, and transpilation options.
- `implementation` hashes compact JSON mapping sorted benchmark `.ts`/`.mjs` paths to their UTF-8 contents,
  followed by `scripts/bench-external-runtime.mjs`.
  Markdown and generated reports are excluded.
- `versions`, `node`, and `lock` identify tools, Node, and the lockfile contents.
- `fixtureHashes` hashes input fixture bytes; `bindings` hashes all generator `.rs` files by sorted relative path.
- Artifact maps hash the built generator JS/Wasm, runtime package metadata and JS, and preview2-shim JS.

File digests hash the exact bytes.
The outer digest uses compact `JSON.stringify` output in the insertion order above, without a trailing newline.
Use the implementation from the measured revision when reconstructing the fingerprint.

Changing a hashed input changes the fingerprint. Each invocation writes a fresh run directory.
CPU, platform, Rust version, and execution flags are recorded as context but are not directly included in the fingerprint.
Compare runs in matching environments; the fingerprint alone does not guarantee comparable timing.
Retain the run's `manifest.json` and `benchmark-source.json` to inspect or reconstruct its inputs;
`summary.md` alone does not contain every hash input.

Recompute uncertainty from raw samples without overwriting the original measurements:

```sh
node bench/external-runtime/reanalyze.mjs path/to/result.json path/to/analysis.json
```

Reanalysis accepts current schema 3 results and older schema 2 results that used
`checkpointKey` for the input fingerprint.
