# Named runtime benchmarks

These baselines compare inline intrinsics with named exports from the external runtime.
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

The independent `external-runtime-bench` workflow runs this same script on pushes
and pull requests to `main`, for merge groups, and through **Run workflow** in the
GitHub Actions UI once the workflow is on the default branch. Its build and benchmark
work runs independently of the main test workflow. Measurement artifacts are uploaded
even when the benchmark fails.

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

`named-baselines/` contains saved JSON measurements, not executable benchmark
suites. Baseline and parity measurements share `test/foundation.ts` and the same
fixture catalog; `verify` runs the separate functional tests:

| Command                         | Portfolio    | Acceptance check                                                           |
| ------------------------------- | ------------ | -------------------------------------------------------------------------- |
| `bench:external-runtime`        | Full         | Regression against the matching saved baseline                             |
| `bench:external-runtime:smoke`  | Smoke subset | Regression against its matching saved baseline                             |
| `bench:external-runtime:parity` | Full         | Inline/external budgets from the current build; no saved baseline required |
| `bench:external-runtime:verify` | Full         | Functional correctness and integrity checks; no timing gate                |

The top-level script calls `verify` and then `parity`; it does not add another timing
suite or run a second baseline comparison. Correctness checks intentionally overlap:
the functional preflight verifies bundles, and the timing suite verifies its own
freshly built bundles before measuring them. Integrity canaries also run in both
commands. Historical baseline files can describe
older fixture matrices and toolchains; they are selected only by an exact input
fingerprint, not run as separate suites.

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
