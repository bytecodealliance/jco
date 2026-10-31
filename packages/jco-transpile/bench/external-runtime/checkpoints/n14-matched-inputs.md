# N14 matched input verification

Archived evidence from the original stack; not measurements of the trait-based rewrite.

The complete 166-operation input preparation passed: 17 scenarios, both bundlers,
both resolutions, four modes and 272 complete bundles. This is a build/correctness
milestone, not the completed N14 performance assessment. No accepted timing data
was collected. Browser, allocation and controlled-loss investigations remain.

Frozen factory source is `b5931a41`; current named coverage matches the exact
historical 166-operation set. All four modes match fixture and actual core-Wasm
digests. Current inline/named generated files and complete bundles reproduce the
N13 production Node API reference byte for byte. Runtime package metadata and
dist hashes are checked before and after building; package resolution rejects a
different runtime. Every entry runs in a fresh verification process, checking
export names and 32 varying inputs for each callable workload. Streams remain a
lifecycle control without reusable payload-throughput calls.

All eight empty/scalar entries are byte-identical across all four modes.
The full matrix passed in 176.624 seconds. Separate functional checks cover mode
ordering, wrong varying answers even when all modes agree, raw-sample/ratio
corruption, nonfinite data and worker cleanup. Temporary timing-canary samples
are functional checks, not accepted performance observations.

Representative Rolldown/file complete-chunk sizes follow. Debug behavior remains
dynamic, with no unsafe purity assumptions or omitted factory checks.

| Scenario | Mode | Raw | Gzip | Brotli |
| --- | --- | ---: | ---: | ---: |
| Adder | Old inline | 40,671 | 11,413 | 10,303 |
| Adder | Current inline | 40,691 | 11,406 | 10,302 |
| Adder | Factory | 102,064 | 28,356 | 24,879 |
| Adder | Named | 46,273 | 12,739 | 11,514 |
| Portfolio | Old inline | 1,143,089 | 185,571 | 51,758 |
| Portfolio | Current inline | 1,143,249 | 185,500 | 51,804 |
| Portfolio | Factory | 946,857 | 124,330 | 60,428 |
| Portfolio | Named | 863,550 | 108,930 | 48,864 |

These deterministic sizes show reduced factory overhead in these examples.
Adder remains larger than inline; the portfolio saves all three size formats.
The two inline controls also expose compiler differences. Size improvements
establish no startup, warm-call, browser or memory improvement.

[Full input results](n14-matched-inputs.json) retain all 68 size comparisons,
bundle/fixture/Wasm hashes and source/producer fingerprints. Reproduction uses
the [matched preparation instructions](../investigation/README.md#matched-input-preparation).
Raw input manifests, module graphs and verification outputs remain in the
separate archive named in the JSON. Historical reports and baselines are unchanged.
