# Preview 2 HTTP serving performance

Performance depends on the component, generated bindings, JavaScript runtime, hardware, and workload.
Measurements from one application or machine should not be treated as production capacity estimates.
Benchmark the relevant component in its deployment environment when performance affects a design
decision.

> **Warning:** `jco serve` is intended for development and testing only. It is not production ready,
> and these benchmarks should not be interpreted as production deployment guidance.

## Request isolation

By default, `jco serve` reuses a component instance across requests. The
`--isolate-requests=instance` mode creates a fresh component instance while retaining the same
JavaScript isolate and module cache. The stronger `--isolate-requests=worker` mode creates a worker
thread with a separate V8 isolate and module cache for every request. A bare `--isolate-requests`
option selects worker isolation.

Worker mode maintains a pool of 50 prewarmed workers by default. Workers are one-shot: each handles
exactly one request and is then terminated and replaced, so prewarming does not reuse JavaScript
globals or module caches across requests. The capacity can be adjusted with
`--isolate-worker-pool-size`. Larger pools can hide worker startup latency during bursts, at the cost
of higher server startup time and memory use.

Jco includes an opt-in end-to-end benchmark that compares both isolation modes with a shared
component and a native Node.js HTTP handler:

```console
pnpm --filter @bytecodealliance/jco bench:serve-isolation
```

The benchmark is not part of the normal test suite. It builds a minimal HTTP component, starts a real
server for each mode, and makes sequential requests to expose per-request overhead. It reports
requests per second and mean, median, and p95 latency. By default, each mode receives 100 warmup
requests followed by 10,000 measured requests.

Worker isolation intentionally creates a worker for every request, so a complete default run can take
a long time. Based on the reference result below, benchmarking both worker pool sizes makes a default
run take approximately one hour. A smaller smoke run can be requested before committing to the full
benchmark:

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

The following result was collected on August 22, 2026 using Node.js 24.19.0 on a 6-vCPU Intel Xeon
2.60 GHz virtual machine. The benchmark made 10 warmup requests followed by 100 measured sequential
requests per mode:

| Mode                 | Requests/s | Mean latency | Median latency | p95 latency |
| -------------------- | ---------: | -----------: | -------------: | ----------: |
| Native `node:http`   |     572.03 |      1.75 ms |        1.72 ms |     2.29 ms |
| Shared component     |     218.05 |      4.59 ms |        4.55 ms |     5.50 ms |
| Instance isolation   |      21.19 |     47.18 ms |       46.97 ms |    57.49 ms |
| Worker, pool size 1  |       4.18 |    239.26 ms |      239.93 ms |   264.04 ms |
| Worker, pool size 50 |      12.67 |     78.91 ms |       77.21 ms |   116.28 ms |

This result illustrates the relative cost of the isolation mechanisms for a minimal component. A
larger component, concurrent traffic, different response sizes, pool utilization, or another Node.js
version can change both the absolute results and the ratios between modes. In this sequential sample,
the 50-worker pool improved worker throughput by approximately 3x, while instance isolation remained
the faster isolation mechanism.
