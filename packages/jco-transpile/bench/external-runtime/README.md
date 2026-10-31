# Named runtime benchmarks

These baselines compare inline intrinsics with named exports from the external runtime.
Each run builds both modes from the same revision and fixtures.

## Running

Build the local transpiler, Component Model runtime, and test fixtures first
(see [transpilation tests](../../test/README.md)).
Run measurements on an otherwise idle machine, after builds and functional tests finish.

```sh
cd packages/jco-transpile
pnpm bench:external-runtime:verify          # Bundled correctness checks; no baseline needed
pnpm bench:external-runtime:smoke           # Smaller matrix; checks its recorded baseline
pnpm bench:external-runtime                 # Full matrix; checks its recorded baseline
pnpm bench:external-runtime:parity          # Full matrix; checks inline/external budgets
node scripts/bench-external-runtime.mjs --smoke --record
```

Omit `--smoke` when recording the full matrix.
Recording requires a complete matrix, is disabled in CI and parity mode, and never overwrites an existing baseline.
A missing matching baseline fails ordinary runs; use `--parity` to check parity without one.
Recording observations does not establish parity.

Run artifacts go under `bench/output/external-runtime-named/run-*`.
`JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT` overrides the output root; `latest.json` identifies the latest run and its status.
Successful runs include a manifest, captured benchmark sources, raw measurements, and JSON/Markdown summaries.
Keep generated run artifacts and checkpoints out of commits.

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

Ordinary runs check regressions against the matching baseline.
Parity runs instead enforce absolute external-versus-inline budgets.
The exact thresholds and statistical rules live in [report.ts](report.ts).

## Filename hashes

`named-baselines/<checkpointKey>.json` uses a lowercase SHA-256 digest of the benchmark inputs.
It is neither a Git commit ID nor a hash of the baseline JSON or measured timings.
[The benchmark test](test/foundation.ts) computes:

```js
checkpointKey = sha256(
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
  Markdown and baseline JSON files are excluded.
- `versions`, `node`, and `lock` identify tools, Node, and the lockfile contents.
- `fixtureHashes` hashes input fixture bytes; `bindings` hashes all generator `.rs` files by sorted relative path.
- Artifact maps hash the built generator JS/Wasm, runtime package metadata and JS, and preview2-shim JS.

File digests hash the exact bytes.
The outer digest uses compact `JSON.stringify` output in the insertion order above, without a trailing newline.
Use the implementation from the recording revision: older baselines may use earlier input sets.

Changing a hashed input selects a new filename.
CPU, platform, Rust version, and execution flags are recorded as context but are not directly included in the key.
Compare runs in matching environments; the key alone does not guarantee comparable timing.
Retain the run's `manifest.json` and `benchmark-source.json` to inspect or reconstruct its inputs;
the baseline JSON alone does not contain every hash input.
