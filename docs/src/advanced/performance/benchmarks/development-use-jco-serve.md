# Development-use `jco serve`

`jco serve` is a convenient development utility for running Preview 2 HTTP components (in particular
components that export the `wasi:http/incoming-handler` interface) in Node.js.

> [!WARNING]
> `jco serve` is intended for development and testing only.
>
> It is not production ready, and these benchmarks should not be
> interpreted as production deployment guidance.
>
> `jco serve` does not yet support Preview 3 HTTP components.

## Caveats

Given the "for development" development nature of `jco serve`, this benchmark measures Jco's
Node.js development server, not the general performance of Preview 2 HTTP components.

A production deployment would typically use [Wasmtime][wasmtime] or another production-oriented
component runtime, which is substantially more efficient than `jco serve`.

Performance depends on the component, generated bindings, JavaScript runtime, hardware, and workload.
Measurements from one application or machine should not be treated as production capacity estimates.
Use this benchmark to compare development-server configurations rather than to estimate production
capacity.

[wasmtime]: https://wasmtime.dev

## Request isolation

By default, `jco serve` reuses a single instantiated component across requests.

The `--isolate-requests=instance` argument introduces a light (and permeable) layer of isolation:
a fresh component instance while retaining the same JavaScript isolate and module cache.

The stronger `--isolate-requests=worker` mode creates a worker thread with a separate V8
isolate and module cache for every request.

> [!NOTE]
> The `--isolate-requests` option selects worker isolation by default

### Worker mode efficiency

Workers are one-shot: each handles exactly one request and is then terminated and replaced, so
prewarming does not reuse JavaScript globals or module caches across requests.

As the cost of isolated workers is quite high, Worker mode maintains a pool of 50 prewarmed workers by default.

The capacity can be adjusted with `--isolate-worker-pool-size`. Larger pools can hide worker
startup latency during bursts, at the cost of higher server startup time and memory use.

## Running the benchmark

Jco includes an opt-in end-to-end benchmark that compares both isolation modes with a shared
component and a native Node.js HTTP handler:

```console
pnpm --filter @bytecodealliance/jco bench:serve-isolation
```

> [!NOTE]
> The benchmark is not part of the normal test suite.

The `serve-isolation` benchmark suite builds a minimal HTTP component, starts a real
NodeJS server for each mode, and makes sequential requests to expose per-request overhead. It reports
requests per second and mean, median, and p95 latency.

By default, each mode receives 100 warmup requests followed by 10,000 measured requests.

Worker isolation intentionally creates a worker for every request, so a complete default run can take
a long time.

Based on the reference result below, benchmarking all three worker pool sizes may take a while.
A smaller smoke run can be requested before committing to the full benchmark:

```console
JCO_SERVE_BENCH_WARMUP=5 \
JCO_SERVE_BENCH_REQUESTS=30 \
pnpm --filter @bytecodealliance/jco bench:serve-isolation
```

The reference result recorded below can be reproduced with its original sample sizes:

```console
JCO_SERVE_BENCH_WARMUP=10 \
JCO_SERVE_BENCH_REQUESTS=100 \
pnpm --filter @bytecodealliance/jco bench:serve-isolation
```

Componentization is deliberately excluded from the timed measurements. Because building the fixture
can still make repeated benchmark runs inconvenient, the generated component can be retained and
reused:

```console
JCO_SERVE_BENCH_COMPONENT_OUT=/tmp/jco-serve-benchmark.wasm \
pnpm --filter @bytecodealliance/jco bench:serve-isolation

JCO_SERVE_BENCH_COMPONENT=/tmp/jco-serve-benchmark.wasm \
pnpm --filter @bytecodealliance/jco bench:serve-isolation
```

### Reference result

Using Node.js 24.19.0 on a 6-vCPU Intel Xeon 2.60 GHz virtual machine, the benchmark made 10 warmup requests
followed by 100 measured sequential requests per mode:

| Mode                  | Requests/s | Mean latency | Median latency | p95 latency |
| --------------------- | ---------: | -----------: | -------------: | ----------: |
| Native `node:http`    |     598.13 |      1.67 ms |        1.69 ms |     2.03 ms |
| Shared component      |     225.07 |      4.44 ms |        4.31 ms |     5.40 ms |
| Instance isolation    |      22.88 |     43.71 ms |       43.24 ms |    47.59 ms |
| Worker, pool size 1   |       4.15 |    240.95 ms |      239.36 ms |   274.28 ms |
| Worker, pool size 50  |      13.55 |     73.82 ms |       70.14 ms |   100.00 ms |
| Worker, pool size 100 |      14.78 |     67.66 ms |       65.14 ms |    95.25 ms |

> [!NOTE]
> The performance ratios here are likely more improtant than the absoltue numbers.

This result illustrates the relative cost of the isolation mechanisms for a minimal component.

A larger component, concurrent traffic, different response sizes, pool utilization, or another Node.js
version can change both the absolute results and the ratios between modes.
