> Historical measurement of the original stack; not a performance result for the trait-based rewrite.

# Focused complex P3 comparison

Inline and the complete named external runtime have **no meaningful warm execution
speed difference** on this workload. The external runtime has a larger bundle and
more module-evaluation overhead. No implementation optimization was made.

The existing Rust `stream-lower` component is the P3 counterpart to the earlier
`flavorful` comparison. Its source is
`crates/test-components/src/bin/stream_lower.rs` and its component binary is
517,423 bytes. Each transaction makes eight sequential async guest calls:

- Sixteen u32 stream payloads.
- Unicode strings in records and option-bearing variants.
- Lists of bytes.
- Owned resources with calls back to their host methods.
- Nested streams of strings.
- Streams of pending string futures, resolved through microtasks.
- Both ok and err result values.

The exact previously built Rolldown minified package-resolution bundles were
reused. Both modes use identical core Wasm (455,898 bytes). A separate correctness
preflight checked full outputs in two independent stores per mode for three
varying inputs. Every warm measured output and every freshly instantiated store
was also checked, outside timing. Both modes passed.

Five serial fresh Node 24.21.0 processes each collected 15 paired samples, with
eight transactions per sample after 16 warmup transactions. Mode order alternated
between processes and samples. Ratios below are medians of within-process paired
ratios; absolute times are medians of process medians, so dividing the absolute
columns need not reproduce the paired ratio. Intervals resample the five process
clusters rather than treating the 75 inner samples as independent experiments.

| Measurement                     |   Inline | External | External / inline, paired | 95% process interval |
| ------------------------------- | -------: | -------: | ------------------------: | -------------------: |
| Complete eight-call transaction | 62.11 ms | 62.34 ms |                     1.003 |          0.994–1.021 |
| JavaScript parse                | 16.66 ms | 17.18 ms |                     1.051 |          0.990–1.180 |
| Module link/evaluation          | 0.098 ms | 0.151 ms |                     1.401 |          1.381–1.800 |
| Store instantiation             |  4.55 ms |  4.84 ms |                     1.065 |          0.966–1.117 |

The warm execution interval spans a small advantage for either mode. Parse and
instantiation intervals also overlap equal performance. Module link/evaluation
consistently favors inline, with a small absolute difference. Five clusters
provide limited precision; this is a focused workload result, not a universal
runtime ranking. Cold native import plus first instantiation medians were
35.50 ms inline and 44.01 ms external; these are descriptive first-use observations
with only one observation per mode per process.

| Minified JavaScript |    Inline |  External | External growth |
| ------------------- | --------: | --------: | --------------: |
| Raw                 | 453,243 B | 475,357 B |            4.9% |
| gzip, level 9       |  53,777 B |  58,592 B |            9.0% |
| Brotli, quality 11  |  42,281 B |  45,287 B |            7.1% |

Timing includes host input construction, `ReadableStream`/Promise handling, ABI
work and guest execution. It excludes output validation, process launch, core
Wasm compilation and host-import setup. These results describe end-to-end calls
through this component; they do not isolate individual intrinsic costs. Existing
buffer/future retention behavior is included. No constant-memory claim is made.
No other builds, browser sessions or benchmarks ran during collection.

The [raw measurements and provenance](./n19-focused-p3.json) include every sample,
bundle/core hashes, frozen compiler/runtime provenance, and the exact measured
script with its digest. Size compression and hashes were recomputed before and
after collection; raw medians, paired ratios and process intervals were replayed
independently. The committed runner received formatting only after collection;
the embedded measured script preserves the exact executed bytes.

To repeat against an existing full-stack build manifest, without running the
matrix, use a new output directory:

```sh
node packages/jco-transpile/bench/external-runtime/focused-p3.mjs \
  packages/jco-transpile/bench/output/external-runtime-named/run-oPViEG/manifest.json \
  packages/jco-transpile/bench/output/focused-p3-repeat
```

The broad goal remains paused at the user's request. The expanded full matrix
was terminated with 192 of 920 paired processes complete; all partial artifacts
remain preserved and support no final conclusions. Its three-session browser
assessment was not run. The earlier full five-process cohort remains complete
and independently audited, separate from this focused assessment.
