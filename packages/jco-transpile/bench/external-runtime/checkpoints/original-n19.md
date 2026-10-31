> Historical record of the original stack. Its commits, API version, validation counts, and performance results do not describe the trait-based rewrite.

# Complete named-runtime conversion

All 274 logical intrinsic variants are converted. Inline remains the production
default; the external runtime uses API-v2 named exports, actual shared owners and
constructors selected once per generated store. The final audit adds test-provider
migrations and the complete-coverage assessment harness. No runtime optimization
is included in this audit.

The new stack starts at the pinned `feat/runtime-named-exports` commit
`b434557f76304802b07047fec4da728fd8d94757`. Every original reference is preserved.
The branch names below use the `feat/newbase-runtime-` prefix.

| Step | Branch suffix                     | Completed tip          |
| ---- | --------------------------------- | ---------------------- |
| N00  | default-test-harness              | 87e430fb               |
| N01  | benchmark-foundation              | 9f260abd               |
| N02  | conversion-intrinsics             | 297344a7               |
| N03  | js-helper-intrinsics              | f4246e7d               |
| N04  | string-intrinsics                 | 6bc26072               |
| N05  | webidl-intrinsics                 | 25658a2a               |
| N06  | resource-intrinsics               | 22a28b01               |
| N07  | core-intrinsics                   | 6c71a11c               |
| N08  | component-intrinsics              | 9c70264d               |
| N09  | waitable-intrinsics               | 87a15771               |
| N10  | error-context-intrinsics          | ebbfd8c8               |
| N11  | async-task-intrinsics             | 1b22921a               |
| N12  | host-intrinsics                   | e7a73f4c               |
| N13  | bundle-metrics-tests              | 29dcd997               |
| N14  | bundle-optimization-investigation | 6f49ae32               |
| N15  | lift-intrinsics                   | ab356e2e               |
| N16  | lower-intrinsics                  | 5e0c56fb               |
| N17  | future-intrinsics                 | fcb8f349               |
| N18  | stream-intrinsics                 | 3d3415fc               |
| N19  | final-audit                       | 2b293b90 frozen inputs |

N14's further investigation was deferred when the user requested conversion first
and benchmarking at the end. Its complete five-process matched-166 cohort and
interrupted ten-process cohort remain separate historical evidence; the latter
is incomplete. No optimization candidate was adopted or revived.

Lift and lower preserve live/replacement cursors, selected codecs, strictness
and resource ownership. Future and stream operations now share their real table,
creation and injection owners. The temporary inline bridges are removed. Endpoint
classes retain private brands, inherited statics, shared pending buffers and
`allowPendingEvent` disposal behavior. Default operations retain static internal
dependencies; sibling export overrides intercept only explicit capabilities.

The custom provider fixtures and browser import map include all public families.
Task-provider checks use the selected `FutureValue` constructor in place of the
removed temporary predicate. The standalone `runtime.d.ts` contract remains
self-contained. Existing unsupported borrow and indirect error-context lifting
paths retain explicit diagnostics.

Validated before timed assessment:

- 282 runtime/package tests, 121 Rust tests and Clippy.
- Fresh native generation of 20 fixtures in both modes with two retained stores,
  independent known answers and matching core Wasm.
- Full WASI compiler/vendor rebuild and runtime package build.
- Four CLI/API optional-runtime checks.
- 48 bundled benchmark correctness/integrity checks across 23 scenarios.
- Browser correctness preflight for 13 representative/payload scenarios with JSPI;
  this is one preflight session and does not provide timing evidence.
- Original 36 references remain unchanged.

The complete normal integration suites pass in both modes: **892 passed and three
existing skips each**, across 88 files. Named mode took 481.07 seconds and inline
mode 509.93 seconds; these are functional-suite durations, not benchmark findings.
Compiler output copies are restored independently with verified unchanged bytes.
The [source audit](./original-n19-source-audit.json) records coverage, classifications and
compiler/runtime inputs. The predeclared
[measurement protocol](./n19-protocol.json) requires complete five- and ten-process
Node cohorts with 15 paired samples per process, both bundlers and both runtime
resolution modes: 92 reports and 384 import controls per cohort. Three independent
browser sessions would reuse the exact verified Rolldown package bundles.

The user subsequently paused the broad goal and requested one complex P3
comparison in place of the remaining matrix. The full five-process cohort
completed and was independently audited; strict parity was not achieved. The
expanded ten-process cohort was stopped at 192 of 920 paired processes, with all
partial evidence preserved. It is incomplete and supports no final conclusions.
The three-session browser timing assessment was not run.

The completed [focused P3 comparison](./n19-focused-p3.md) exercises eight async
operations through the existing Rust `stream-lower` component, including payload
streams, compound values, owned resources, nested streams and pending futures.
Both modes pass full output validation. Across five fresh processes and 75 paired
samples, complete transactions took 62.11 ms inline and 62.34 ms external: the
paired ratio was 1.003 with a 95% process interval of 0.994–1.021. This does not
establish an execution-speed advantage for either mode. External JavaScript was
larger and module evaluation slower. Raw samples and provenance are linked in
the focused report. No optimization was made.

The new cases transfer sixteen u32 values through canonical stream buffers and
through actual host stream injection, cancel pending reads, and exercise resolved,
pending, rejected and nested futures. The old zero-length stream case remains a
lifecycle control. Persistent-pair stream handles and global stream records are
bounded during repeated calls. Existing buffer-manager/future retention and
allocation behavior remains included; no leak-free or constant-memory claim is
made. Memory measurements describe initialized retained stores and exclude warm
payload accumulation.

Browser module-import timing includes fetch/parse/link/evaluation. No isolated
browser parse axis is claimed. All measurements are engine/platform specific;
invalid GC deltas and incomplete collections cannot support conclusions.
