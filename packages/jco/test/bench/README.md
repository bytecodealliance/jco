# Jco benchmarks

These opt-in benchmarks exercise the built workspace Jco CLI. Run the repository's
normal dependency setup and build first, using Node.js 24 or newer. Benchmarks are
excluded from the normal test suite and are not CI performance gates.

Run the commands below from `packages/jco/test/bench`, or use the package scripts
from the repository root:

| Benchmark                 | Command from this directory                                               | Package script                                                                                             |
| ------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Componentization backends | `node componentize-backends.mjs --perry-cli-path /absolute/path/to/perry` | `pnpm --filter @bytecodealliance/jco bench:componentize-backends --perry-cli-path /absolute/path/to/perry` |
| Serve request isolation   | `node serve-request-isolation.js`                                         | `pnpm --filter @bytecodealliance/jco bench:serve-isolation`                                                |

## Componentization backends

[`componentize-backends.mjs`](./componentize-backends.mjs) compares Perry,
componentize-js (StarlingMonkey), and componentize-qjs (QuickJS). It calls
`jco componentize`, applies the same `jco opt` pass, and calls `jco transpile`
for each backend. The guest fixture reads a host file, obtains its size, and
prints both. Fixtures belong to this suite in [`fixtures/filesystem`](./fixtures/filesystem).
The benchmark does not build or run the Perry example.

### Setup and running

Perry must support `--target wasi`, with its matching runtime archive and
wasi-sdk configured. The [Perry example's installer](../../../../examples/components/perry-filesystem/README.md#prerequisites)
can provision a pinned source-built toolchain without sudo. Its setup is a
separate prerequisite; this benchmark does not install compilers.

| Setting                                    | Purpose                                                           |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `--perry-cli-path` or `JCO_PERRY_CLI_PATH` | Path to the WASI-enabled Perry executable or JavaScript launcher. |
| `PERRY_RUNTIME_DIR`                        | Directory containing the matching `libperry_runtime.a`.           |
| `WASI_SDK_PATH`                            | wasi-sdk installation directory.                                  |
| `JCO_PERRY_REF` (optional)                 | Source revision to record alongside the compiler version.         |

After configuring the runtime and SDK in your environment:

```sh
node componentize-backends.mjs --perry-cli-path /absolute/path/to/perry
```

The script checks every sample's output, prints sizes in KiB/MiB and timings in
milliseconds, and writes exact byte counts, raw timing samples, tool versions,
input hashes, and host details to
`packages/jco/test/output/bench/componentize-backends/results.json`.
Component artifacts and build metadata are retained in the same ignored directory.
Use `--samples 50 --warmup 5` to change the default sample counts, or
`--skip-build` to reuse unchanged components without requiring the compiler.
The optional `--wasm-opt-bin` setting is passed to Jco's optimizer launcher hook.
Build and transpilation time are excluded from the measurements.

### Recent results

Example results measured on 2026-10-22 on a shared Linux x86_64 development host
(Intel Xeon at 2.60 GHz, Node.js 24.21.0), using the bundled 26-byte input file:

| Backend                          | As-built size | Optimized size |
| -------------------------------- | ------------: | -------------: |
| Perry                            |     11.42 MiB |       7.40 MiB |
| componentize-js (StarlingMonkey) |     15.99 MiB |      15.42 MiB |
| componentize-qjs (QuickJS)       |      6.79 MiB |       6.66 MiB |

Timings for the optimized components:

| Backend                          | Run (median ms) | Load + run (median ms) | Node process (median ms) |
| -------------------------------- | --------------: | ---------------------: | -----------------------: |
| Perry                            |           91.77 |                 168.26 |                   310.67 |
| componentize-js (StarlingMonkey) |           51.03 |                 212.28 |                   421.66 |
| componentize-qjs (QuickJS)       |           36.17 |                 136.58 |                   361.60 |

Tool versions: Jco `d5ae42df` (package version 1.39.0), componentize-js 0.23.0,
componentize-qjs 0.4.5, and
Perry 0.5.1659 built at commit `3945beb23ebeca54846a30d89cb4971de59b0c6c`
with LLVM 22.1.8 and wasi-sdk 34. All three components were optimized with
Binaryen 132 using `-Oz --low-memory-unused --enable-bulk-memory
--enable-reference-types --strip-debug`. These are example measurements from one
host; rerun the comparison for results on your machine.

- **Component size:** the uncompressed `.wasm` component before transpilation,
  reported both as built and after optimization. MiB means 1,048,576 bytes.
  All timings use the optimized components.
- **Run:** the first command call on a fresh instance, including file read, stat, and output.
- **Load + run:** importing and instantiating the transpiled component, then running it.
- **Node process:** elapsed time from launching a fresh Node process until it exits,
  including host setup, component loading, and execution.

All three use explicit asynchronous instantiation with the same host setup.
Each backend runs in a fresh process for every sample. The default is 20 measured
samples per backend after three warmup rounds, rotating backend order between
rounds. File and OS caches are not cleared. Builds and transpilation are excluded
from the timing. To repeat measurements without rebuilding unchanged components:

```sh
node componentize-backends.mjs --skip-build --samples 50 --warmup 5
```

The JavaScript backends wrap the guest's statements in the WASI command export
so StarlingMonkey's build-time preinitialization cannot read the input file.
Their components include Jco's Node filesystem adapter, mapped to the same host
file through the Node filesystem capability. Perry lowers those calls directly
to WASI filesystem operations. QuickJS uses synchronous bindings for this
synchronous workload; StarlingMonkey uses its default build without Weval AOT.
These measurements compare this fixture's complete backend paths. The tiny file
and console output make them sensitive to host overhead; they do not establish
general JavaScript throughput or performance under sustained load.

### Perry component size

AoT compilation removes the need to interpret this guest's TypeScript, but its
JavaScript semantics still require runtime support: object layouts, strings,
closures, exceptions, built-ins, and garbage collection. This pinned Perry build
links a broad runtime. Its [WASI link path][perry-wasi-link] explicitly skips the
app-specific runtime rebuild used by native targets, and the
[WASI runtime build script][perry-wasi-runtime] enables almost all default runtime
features.

Inspecting the unoptimized core module found 9,630 defined functions and about
8.12 MiB of Wasm instructions, including broad object/built-in support, GC,
streams, regular expressions, and filesystem helpers. It also contained about
1.63 MiB of DWARF debug information and 0.75 MiB of function names. The optimized
size above removes debug information and runs size optimization and dead-code
elimination; the remaining payload is mostly runtime code.

The emitted function names contain no SWC parser or dynamic-evaluation
interpreter functions. Perry supports an optional interpreter for runtime-created
code, but the evidence here does not attribute the size to that interpreter.
Instead, general runtime dispatch and built-in registries retain helpers that a
small statically known guest should ideally avoid. Once helpers are reachable
through those registries, ordinary linker/Binaryen dead-code elimination cannot
assume they will never be called. Further reductions would require specializing
the WASI runtime to the program's needs, then measuring the resulting component.

[perry-wasi-link]: https://github.com/PerryTS/perry/blob/3945beb23ebeca54846a30d89cb4971de59b0c6c/crates/perry/src/commands/compile/link/wasi.rs
[perry-wasi-runtime]: https://github.com/PerryTS/perry/blob/3945beb23ebeca54846a30d89cb4971de59b0c6c/scripts/wasi_build_runtime.py

## Serve request isolation

[`serve-request-isolation.js`](./serve-request-isolation.js) compares a native
Node.js HTTP handler with Jco's shared component, fresh-instance, and worker
isolation modes. It builds a minimal HTTP component, runs a local server for
each mode, checks the response, and reports requests per second and mean,
median, and p95 latency. Default counts are 100 warmups and 10,000 sequential
requests per mode; a full worker-isolation run can take a long time.

For a smaller run, set `JCO_SERVE_BENCH_WARMUP=5` and
`JCO_SERVE_BENCH_REQUESTS=30` in your environment, then run:

```sh
node serve-request-isolation.js
```

Set `JCO_SERVE_BENCH_COMPONENT_OUT` to retain a newly built component, or
`JCO_SERVE_BENCH_COMPONENT` to reuse an existing one. Componentization is excluded
from timing. Temporary server output is cleaned up automatically.

### Most recent documented reference result

The existing reference used Node.js 24.19.0 on a 6-vCPU Intel Xeon 2.60 GHz
virtual machine, with 10 warmup requests followed by 100 measured sequential
requests per mode. These results come from the
[development-use serve benchmark](../../../../docs/src/performance/benchmarks/development-use-jco-serve.md#reference-result);
they were not rerun as part of the componentization backend comparison.

| Mode                  | Requests/s | Mean latency | Median latency | p95 latency |
| --------------------- | ---------: | -----------: | -------------: | ----------: |
| Native `node:http`    |     598.13 |      1.67 ms |        1.69 ms |     2.03 ms |
| Shared component      |     225.07 |      4.44 ms |        4.31 ms |     5.40 ms |
| Instance isolation    |      22.88 |     43.71 ms |       43.24 ms |    47.59 ms |
| Worker, pool size 1   |       4.15 |    240.95 ms |      239.36 ms |   274.28 ms |
| Worker, pool size 50  |      13.55 |     73.82 ms |       70.14 ms |   100.00 ms |
| Worker, pool size 100 |      14.78 |     67.66 ms |       65.14 ms |    95.25 ms |

This benchmark measures Jco's development server overhead. It does not estimate
production component-runtime capacity. Request concurrency, component size,
worker pool utilization, and host load can change both absolute and relative
results.
