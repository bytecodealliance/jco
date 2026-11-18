# Call overhead experiments

Measures the cost of calls through generated bindings under Node.js,
against any build of the Component Model runtime.

Build the transpile example and the runtime once:

```sh
cargo build -p js-component-bindgen --example transpile --features embedded-cm-runtime,external-runtime
pnpm --filter @bytecodealliance/jco-cm-runtime build
pnpm --filter @bytecodealliance/preview2-shim build
```

Then build variants and compare them:

```sh
./gen.sh base "$(realpath ../../../jco-cm-runtime/dist)"   # bindings importing a runtime directory
./gen.sh embedded embedded                                 # bindings with the runtime bundled in
node compare.mjs --runs=4 base embedded
```

Flags after the runtime are passed on to the transpile example,
for example `./gen.sh debug embedded --profile=debug` to keep the diagnostics of the bundled runtime.

A variant is a directory under `../output/perf/`.
To try a runtime change, copy `dist` elsewhere, edit the copy, and pass it to `gen.sh`.

- `bench.mjs` times one variant in one process:
  synchronous calls of the `runtime` fixtures,
  and asynchronous calls, streams and futures of the checked-in `p3` fixtures, awaited one at a time.
- `bench.mjs` checks each result before warm-up and after measurement, outside timed sections,
  and reports all samples plus min/median/max nanoseconds per call.
- `compare.mjs` rotates fresh-process order, reports median speedups and the full observed range,
  and prints the raw samples as JSON after the comparison table.
- `strip.mjs` removes labeled statements, or calls of named functions, from built JavaScript.
- `profile-summary.mjs` lists self time per function of a `--cpu-prof` profile.
- `sharing.mjs` times the first instance of a variant as further instances load in the same process.
- `sharing-instantiate.mjs` does the same for bindings that export `instantiate`.
- `list-array.mjs` times lowering a plain array as `list<u8>`, which `bench.mjs` does not cover.

Run on an idle machine: timings vary severalfold under load.
Cases share one process, so runtime functions see every fixture's objects;
a case run alone (`--filter`) can be much faster than in the full set.
