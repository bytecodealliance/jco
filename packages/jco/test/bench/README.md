# Jco benchmarks

These opt-in benchmarks exercise the built workspace Jco CLI. Run the repository's
normal dependency setup and build first, using Node.js 24 or newer. Benchmarks are
excluded from the normal test suite and are not CI performance gates.

Run the commands below from `packages/jco/test/bench`, or use the package scripts
from the repository root:

| Benchmark                 | Command from this directory                                                                           | Package script                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Componentization backends | `node componentize-backends.mjs --perry-cli-path /path/to/perry --perry-source /path/to/perry-source` | `pnpm --filter @bytecodealliance/jco bench:componentize-backends --perry-cli-path /path/to/perry --perry-source /path/to/perry-source` |
| Serve request isolation   | `node serve-request-isolation.js`                                                                     | `pnpm --filter @bytecodealliance/jco bench:serve-isolation`                                                                            |

## Componentization backends

[`componentize-backends.mjs`](./componentize-backends.mjs) compares Perry,
componentize-js (StarlingMonkey), and componentize-qjs (QuickJS). It calls
`jco componentize`, applies the same `jco opt` pass, and calls `jco transpile`
for each backend. The guest fixture reads a host file, obtains its size, and
prints both. Fixtures belong to this suite in [`fixtures/filesystem`](./fixtures/filesystem).
The benchmark does not build or run the Perry example.

### Setup and running

Use a WASI-enabled compiler built from Perry commit
`3945beb23ebeca54846a30d89cb4971de59b0c6c`, a clean checkout of that revision,
wasi-sdk 34, and Rust `nightly-2026-10-08` with the `wasm32-wasip2` target.
The [Perry example's installer](../../../../examples/components/perry-filesystem/README.md#prerequisites)
can provision these prerequisites; the benchmark does not install compilers.

Every full benchmark build rebuilds Perry's runtime with **optimization level
`z`, fat LTO, and default features disabled**, retaining `keepalive-anchors`
to preserve the entry points called by generated code.
This is the smallest profile validated for this filesystem fixture. Cargo caches
unchanged builds. The benchmark selects the resulting archive automatically,
overriding `PERRY_RUNTIME_DIR`, and records the recipe, archive SHA-256, source
revision, and toolchain versions in its build metadata. The normal Perry
installation is unchanged. This feature subset is specific to the fixture;
other applications may need additional runtime features.

| Setting                                    | Purpose                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `--perry-cli-path` or `JCO_PERRY_CLI_PATH` | Matching WASI-enabled Perry executable or JavaScript launcher.         |
| `--perry-source` or `JCO_PERRY_SOURCE`     | Clean checkout of the pinned Perry revision.                           |
| `WASI_SDK_PATH`                            | wasi-sdk installation directory.                                       |
| `CARGO_TARGET_DIR` (optional)              | Reuse a Cargo build cache; defaults to the benchmark output directory. |
| `CARGO_BUILD_JOBS` (optional)              | Runtime build parallelism; defaults to 2.                              |

After setting `WASI_SDK_PATH`, run:

```sh
node componentize-backends.mjs \
  --perry-cli-path /path/to/perry \
  --perry-source /path/to/perry-source
```

The script checks every build and runtime sample's output, prints sizes in KiB/MiB
and timings in milliseconds, and writes exact byte counts, raw timing samples, tool versions,
input hashes, and host details to
`packages/jco/test/output/bench/componentize-backends/results.json`.
Component artifacts and build metadata are retained in the same ignored directory.
Use `--output-dir /path/to/artifacts` to select another location; pass the same
location when using `--skip-build`.
Use `--samples 50 --warmup 5` to change the default sample counts, or
`--skip-build` to reuse unchanged components without requiring the toolchain.
Cached builds from the old runtime recipe are rejected and must be rebuilt.
The optional `--wasm-opt-bin` setting is passed to Jco's optimizer launcher hook.
Componentization and optimization are measured separately from runtime execution.
Compiler/engine/runtime builds and transpilation are excluded from both timing groups.

### Compilation speed

A full run measures **TS/JS source to a complete, usable Wasm component**, including
the JavaScript engine for StarlingMonkey and QuickJS. It does not measure a
script-only payload that requires a separately deployed engine.

The compilation table reports three medians:

- **TS/JS → component:** wall time around a fresh `jco componentize` process,
  through successful exit after writing the component. This includes CLI startup,
  TypeScript lowering and bundling, backend compilation or preinitialization,
  linking/component encoding, and writing the output. Perry's CLI capability
  probe is included as part of the normal Jco workflow.
- **Optimize:** wall time around a fresh `jco opt` process on that sample's
  component, using the common optimization flags.
- **TS/JS → optimized component:** median of each sample's componentization plus
  optimization time. This need not equal the sum of the first two medians.

The default is **five measured builds per backend after one warmup round**.
`--build-samples` and `--build-warmup` control these independently of the runtime
`--samples` and `--warmup` settings. Builds run sequentially, rotating backend order
between rounds. Every build starts with fresh output and WIT directories; Jco's
injected WIT imports cannot accumulate between samples. Prebuilt engine binaries,
Perry's prepared runtime archive, and OS/filesystem caches are reused. These are
warm-cache application builds, not clean-machine toolchain bootstrap timings.

The benchmark prepares its command wrapper and WIT fixture outside the timer;
the timed CLI still performs the actual TypeScript transformation and bundling.
Perry compiler installation, its one-time runtime archive preparation, dependency
installation, transpilation and validation are also outside the timer. Every
as-built **and** optimized component is transpiled and executed after the timed
commands; incorrect output fails the benchmark instead of becoming a timing
sample. The final optimized artifacts are reused for runtime measurements.

```sh
node componentize-backends.mjs \
  --perry-cli-path /path/to/perry \
  --perry-source /path/to/perry-source \
  --build-samples 5 --build-warmup 1 \
  --samples 20 --warmup 3
```

`build.json` and `results.json` retain compilation medians, every raw sample's
stage timings and output sizes, round/order, sampling settings, host details,
input hash, and measurement timestamps under `build.compilation` in the results.
`--skip-build` runs only runtime measurements and explicitly labels compilation
results as reused with their original timestamp. Older build receipts without
compilation measurements remain usable but show no compilation table.

For environments needing a componentize-js build-time shim workaround,
`JCO_BENCH_BUILD_PRELOAD=/absolute/path/to/preload.mjs` adds Node's `--import` only
to componentization processes. The path is recorded in build metadata and its
execution cost is included in compilation time. It is not loaded during
optimization, validation, or runtime samples. Leave it unset for normal builds.

### Compilation results (2026-10-23)

Five measured builds per backend after one warmup, on the Linux x86_64 Intel
Xeon 2.60 GHz host with Node.js 24.21.0:

| Backend        | TS/JS → component (median ms) | Optimize (median ms) | TS/JS → optimized component (median ms) |
| -------------- | ----------------------------: | -------------------: | --------------------------------------: |
| perry          |                       3328.06 |             10924.11 |                                14098.32 |
| starlingmonkey |                       6839.72 |             23536.53 |                                30376.25 |
| quickjs        |                       2619.39 |              3500.37 |                                 6119.76 |

QuickJS was fastest for both endpoints on this fixture. These measurements use
componentize-qjs 0.4.5, componentize-js 0.23.0 without Weval AOT, the pinned Perry
0.5.1659 compiler and reduced runtime recipe described above, and native Binaryen
132 through `--wasm-opt-bin`. They do not use the experimental local Perry
specialization or QuickJS 0.5's size runtime. Jco was rebuilt from the comparison
branch for this run; package versions alone do not identify local compiler changes.

Output artifacts were written to tmpfs; normal OS/file caches were retained.
The componentize-js 0.23.0 WIT-splicer shim needed the build-only preopen workaround
described above; its startup cost is included. All 18 builds (warmups included)
passed execution checks for both their as-built and optimized components. Results
on other source graphs, hosts, disks, or tool versions can differ; this is not a
universal compiler-throughput ranking.

### Recent results

Example results measured on 2026-10-23 on a shared Linux x86_64 development host
(Intel Xeon at 2.60 GHz, Node.js 24.21.0), using the bundled 26-byte input file:

| Backend                          | As-built size | Optimized size |
| -------------------------------- | ------------: | -------------: |
| Perry                            |      6.80 MiB |       3.21 MiB |
| componentize-js (StarlingMonkey) |     15.99 MiB |      15.42 MiB |
| componentize-qjs (QuickJS)       |      6.79 MiB |       6.66 MiB |

Timings for the optimized components:

| Backend                          | Run (median ms) | Load + run (median ms) | Node process (median ms) |
| -------------------------------- | --------------: | ---------------------: | -----------------------: |
| Perry                            |           98.80 |                 153.66 |                   301.14 |
| componentize-js (StarlingMonkey) |           59.58 |                 228.90 |                   465.38 |
| componentize-qjs (QuickJS)       |           40.96 |                 145.42 |                   403.16 |

Tool versions: Jco `feaa7d23` (package version 1.39.0) with this runtime build
recipe, componentize-js 0.23.0,
componentize-qjs 0.4.5, and
Perry 0.5.1659 built at commit `3945beb23ebeca54846a30d89cb4971de59b0c6c`
with LLVM 22.1.8 and wasi-sdk 34. All three components were optimized with
Binaryen 132 using `-Oz --low-memory-unused --enable-bulk-memory
--enable-reference-types --strip-debug`. These are example measurements from one
host; rerun the comparison for results on your machine. A local shim compatibility
workaround enabled filesystem access for componentize-js's build-time WIT splicer;
it was disabled for timings.

- **Component size:** the uncompressed `.wasm` component before transpilation,
  reported both as built and after optimization. MiB means 1,048,576 bytes.
  Runtime timings use the optimized components; compilation measures both output stages.
- **Run:** the first command call on a fresh instance, including file read, stat, and output.
- **Load + run:** importing and instantiating the transpiled component, then running it.
- **Node process:** elapsed time from launching a fresh Node process until it exits,
  including host setup, component loading, and execution.

All three use explicit asynchronous instantiation with the same host setup.
Each backend runs in a fresh process for every sample. The default is 20 measured
samples per backend after three warmup rounds, rotating backend order between
rounds. File and OS caches are not cleared. The runtime timing group excludes
builds and transpilation; compilation is reported separately. To repeat measurements without rebuilding unchanged components:

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

### Why Perry components are still several MiB

The size-focused runtime reduces this fixture from **7.40 MiB to 3.21 MiB**.
The guest's original generated functions total only **1,918 bytes**; most of the
payload implements JavaScript semantics:

- **Broad runtime defaults:** Perry's [WASI link path][perry-wasi-link] bypasses
  native per-application specialization, while its [runtime builder][perry-wasi-runtime]
  enables nearly all default features, including diagnostics. The native
  `PERRY_SIZE_OPT` / `PERRY_SIZE_LTO` settings have no effect here, so this
  benchmark explicitly rebuilds a reduced runtime at level `z` with fat LTO.
- **Reachable generic helpers:** object property reads, string coercion,
  exceptions, built-ins, and GC retain general runtime code. Importing `node:fs`
  also [registers streams][perry-fs-registry]. These dispatch paths keep helpers
  reachable even when the fixture never calls them directly, limiting dead-code
  elimination.
- **Small packaging overhead:** the 7.40 MiB baseline already had debug data
  stripped; component wiring and auxiliary modules added only 19 KiB. An empty
  Perry program still optimized to 6.30 MiB with the default runtime. Equivalent
  C file I/O using the same SDK produced 60.9 KiB, without JS semantics.

The reduced runtime passed changed-file, Unicode, and larger-input checks.
Hundreds of KiB will require narrower dispatch or code generation; Perry's
[tiny-program specialization][perry-tiny-program] currently excludes WASI.

[perry-wasi-link]: https://github.com/PerryTS/perry/blob/3945beb23ebeca54846a30d89cb4971de59b0c6c/crates/perry/src/commands/compile/link/wasi.rs
[perry-wasi-runtime]: https://github.com/PerryTS/perry/blob/3945beb23ebeca54846a30d89cb4971de59b0c6c/scripts/wasi_build_runtime.py
[perry-fs-registry]: https://github.com/PerryTS/perry/blob/3945beb23ebeca54846a30d89cb4971de59b0c6c/crates/perry-runtime/src/object/native_module_registry.rs#L361-L370
[perry-tiny-program]: https://github.com/PerryTS/perry/blob/3945beb23ebeca54846a30d89cb4971de59b0c6c/crates/perry/src/commands/compile/tiny_program/mod.rs#L204-L220

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
