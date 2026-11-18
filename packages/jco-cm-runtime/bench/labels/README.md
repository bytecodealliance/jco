# Runtime microbenchmarks

These workloads measure flat lifting, thread context lookups from JavaScript and
core Wasm, resource table operations, UTF encoding, stream queues, and byte
copies. Run the commands below from the repository root after installing the
workspace dependencies.

```sh
node packages/jco-cm-runtime/bench/labels/verify.mjs
node packages/jco-cm-runtime/bench/labels/run.mjs
```

`verify.mjs` checks that removing diagnostics also removes argument evaluation
and preserves resource and Unicode traps. Run the package behavior suites with
`pnpm --filter @bytecodealliance/jco-cm-runtime test` and
`pnpm --filter @bytecodealliance/jco-cm-runtime test:checked`.

## Comparing profiles and revisions

By default the runner measures the working tree with three sets of labels. The
`checked` bundle drops DEBUG, `debug` retains all labels, and the benchmark-only
`lean` bundle drops DEBUG and SAFETY. All use the same minifier and workloads.

Pass `--baseline <ref>` to add a checked build of another Git revision.
Pass `--candidate <ref>` to measure a committed candidate instead of the working
tree. Both options accept local Git revision expressions. For example, compare
the current commit with its parent:

```sh
node packages/jco-cm-runtime/bench/labels/run.mjs --baseline HEAD^ --candidate HEAD
```

Each revision supplies its own runtime sources and test helpers. The runner uses
Git and tar to extract them into a temporary directory. The workload driver and
bundler come from the checkout running the comparison. Revisions must support
the runtime operations used by the driver. For runtimes that accept plain lift
contexts directly, the record workloads pass the context options as an object.
The report records which factory each build used.

## Sampling and results

The runner builds before timing, rotates bundle order across five fresh processes
per variant, and collects nine warmed samples per workload per process. For a
shorter run with a subset of workloads:

```sh
JCO_LABEL_BENCH_PROCESSES=1 JCO_LABEL_BENCH_CASES=context-js,context-wasm \
  node packages/jco-cm-runtime/bench/labels/run.mjs
```

Bundles and `results.json` go to `packages/jco-cm-runtime/bench/output/labels/`.
Set `JCO_LABEL_BENCH_OUTPUT` to keep runs in separate directories (relative paths
resolve from the runtime package). The report includes raw samples, process medians,
Node/V8 and CPU details, revisions, label settings, bundle sizes, and hashes.
The sizes include the workload driver. Times are nanoseconds per operation, or
per scalar field for record and scalar lift workloads.

For a paired comparison, run `confirm.mjs` against the completed output directory.
It checks the bundle hashes and uses the recorded workload selection and process
count. It alternates the order of each pair across twelve samples and writes
`paired.json` with per-process ratios and their range.

```sh
node packages/jco-cm-runtime/bench/labels/confirm.mjs packages/jco-cm-runtime/bench/output/labels
```

A speedup above one means the second bundle took less time. Inspect process
ranges as well as medians. The Wasm case loops over a bound runtime import,
the string cases use a fixed allocation address, and the byte-copy case moves
4 KiB per operation. For end-to-end calls through generated bindings, see the
[generated binding benchmarks](../../../jco-transpile/bench/perf/README.md).
