# Generated binding call benchmarks

Measure calls through generated bindings for numbers, strings, lists, records,
async imports, streams, and futures. Each variant uses the same Wasm fixtures.
A variant can bundle the runtime or import a runtime built in another checkout.

With the workspace dependencies and `wasm-tools` installed, build the prerequisites from the repository root.

```sh
cargo build -p js-component-bindgen --example transpile --features embedded-cm-runtime,external-runtime
pnpm --filter @bytecodealliance/jco-cm-runtime build
```

From this directory, generate a set of bindings for each variant and compare them
with a Node.js version that supports WebAssembly JSPI.

```sh
node gen.mjs external ../../../jco-cm-runtime/dist
node gen.mjs embedded embedded
node compare.mjs external embedded
```

The first argument to `gen.mjs` names the directory under `../output/perf/`.
Generating the same name again replaces its bindings. The second argument is
either `embedded` or a runtime directory relative to the current working directory.
Additional arguments go to the transpiler, e.g. `node gen.mjs debug embedded --profile=debug`,
or `node gen.mjs fast embedded --perf-sync-fast-path` to skip the task of synchronous calls.
To compare runtime revisions, build each runtime and supply its dist directory under a distinct variant name.

`compare.mjs` takes the baseline first, followed by one or more variants.
It rotates process order over five runs and prints median nanoseconds per call,
the observed range, baseline-to-variant ratios, and raw samples as JSON.
A ratio above one means the variant took less time. Keep the host, Node version,
and workload selection the same across runs.

```sh
node compare.mjs --runs=3 --filter=string external embedded
node bench.mjs embedded 'export tuple swap'
```

Each process checks the fixture results, warms the selected calls, then measures
five samples. Async calls settle before the next call starts. The list cases
measure both a typed byte array and an ordinary JavaScript array.

Two scripts cover what `bench.mjs` does not:

- `composed.mjs` times calls between two components with a memory each (`echo-composed.wat`),
  for example `node gen.mjs multi-memory embedded --multi-memory` against a variant built without the flag.
- `string-lower.mjs` times lowering strings of several lengths and kinds as UTF-8,
  given runtime builds instead of variants: `node string-lower.mjs <dist-copy> ../../../jco-cm-runtime/dist`.
