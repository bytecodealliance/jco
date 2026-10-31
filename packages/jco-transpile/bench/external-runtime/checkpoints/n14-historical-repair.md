# N14: clean repair of the historical timing-isolation gap

Archived evidence from the original stack; not measurements of the trait-based rewrite.

The N08–N11 timing observations retain their documented background-load
limitation: eight orphan CLI fixture workers from the first N08 functional run
were alive during those collections. The original samples, baselines, bundles,
core Wasm and branch refs remain unchanged. This report adds clean evidence;
it does not relabel those original observations as isolated.

The repair infrastructure is committed at `88434f1e`. Seven real-process/CLI
tests, five real owned-worker guard canaries, strict types, lint and format
passed before collection. Verification-only preflights checked all 32 reports
and 232 N08 or 280 shared N09/N10 controls, without accepting timing samples.

Before new timing results, four complete cohorts were mandatory: N08 five/ten
and a shared N09/N10 five/ten. Each report uses 15 alternating paired samples
per fresh process after the original warmup/calibration and deterministic
scenario rotation. Every control and known answer finishes before timing.
Elevated in-process audits find no competing workspace workers before/after.
The original matrix deadline and two-minute child deadline remain enforced;
abort/timeout handling waits for owned children to be reaped.

| Scope          | Clean cohort | Processes x paired samples | Reports / controls |         Size losses | Timing budget losses |
| -------------- | ------------ | -------------------------- | ------------------ | ------------------: | -------------------: |
| N08            | run-sxP3HW   | 5 x 15                     | 32 / 232           | 12 axes / 8 entries |                    0 |
| N08            | run-h8QaOG   | 10 x 15                    | 32 / 232           | 12 axes / 8 entries |                    0 |
| N09/N10 shared | run-ptjgBY   | 5 x 15                     | 32 / 280           | 10 axes / 8 entries |                    0 |
| N09/N10 shared | run-XUUVCD   | 10 x 15                    | 32 / 280           | 10 axes / 8 entries |                    0 |

Every cohort completed and fails strict size parity. No baseline was replaced,
budget relaxed or favorable retry selected. The complete
[repair audit and absolute metrics](n14-historical-repair.json) records all keys,
source-result hashes, size losses, per-axis estimates, findings and exclusions.

The collector verifies all 64 saved bundle hashes, their originally recorded
raw/gzip/Brotli sizes and every saved core Wasm digest before/after collection
(152 core-file checks per cohort). The N08 hash anchor was captured during repair
preflight from the preserved originals, after verifying original five/ten bundle
identity; it is not claimed as a checksum published during the original runs.
The archived runner, workload and report sources are copied byte-for-byte, and
the original Node flags and actual child environments are retained. The report
module first reproduces all original process-cluster estimates, then analyzes
the new samples with those same gates and noise rules. The controller and guard
sources are separately hashed. Native ESM and vm probes load the complete saved
bundle/core Wasm; no current unbundled runtime is substituted.

Independent reanalysis matches every new uncertainty/noise finding in all 32
reports per cohort:

- [N08 five-process analysis](n14-repair-n08-five-analysis.json)
- [N08 ten-process analysis](n14-repair-n08-ten-analysis.json)
- [Shared N09/N10 five-process analysis](n14-repair-n09-n10-five-analysis.json)
- [Shared N09/N10 ten-process analysis](n14-repair-n09-n10-ten-analysis.json)

Material findings require at least 5%, a process-cluster 95% interval excluding
one and an effect exceeding identical-code control noise. Passing the additive
timing budgets does not remove penalties inside those budgets.

| Scope / processes | Parse regressions / improvements | Link/evaluation regressions | Initialization regressions | Warm-call material findings |
| ----------------- | -------------------------------: | --------------------------: | -------------------------: | --------------------------: |
| N08 / 5           |                            8 / 2 |                          24 |                         13 |                           0 |
| N08 / 10          |                           20 / 4 |                          24 |                         12 |                           0 |
| N09/N10 / 5       |                           12 / 3 |                          23 |                         16 |                           0 |
| N09/N10 / 10      |                           15 / 4 |                          24 |                         20 |                           0 |

Startup costs therefore remain a concern in clean data. No warm-call improvement
is established for these frozen portfolios, and these collections do not isolate
why the older background load changed individual estimates. Five-process and
expanded findings remain visible rather than selecting the more favorable one.

N09 and N10 have identical consumed timing inputs: all 64 bundles/core Wasm,
runner/workload/measurement/report sources, component parts/known answers,
settings and actual child environments. All 248 N09 controls are byte-identical
to their N10 counterparts; the new collections recheck the complete 280-control
N10 superset. See the [consumed-input proof](n14-n09-n10-input-equivalence.json).
Each new cohort is one sample population supporting both historical checkpoints,
not two independent sets of repetitions. Different producer mapping inventories
do not make these particular saved workload programs different.

N11 uses the already clean N12 cohorts `run-nsVj37` (5 x 15) and `run-6ggOQL`
(10 x 15), transparently referencing the same samples. All 64 timed bundles,
core Wasm, four consumed sources, settings, fixture/part selections and actual
child environments match. The five-process proof checks 256 verification/timing/
memory configurations; the ten-process proof checks 416. Four selected waitable
class control bundles differ from N12, so all 336 original frozen N11 controls
were freshly checked, including 168 isolated native-constructor traces. Known
answers and counts match both original N11 cohorts. See the full
[N11 equivalence and fresh-control proof](n14-n11-input-equivalence.json).
This repairs the N11 smoke timing gap; it does not add independent N11 timing
repetitions or establish performance for unselected operations. Those same clean
cohorts retain N12's documented 52 size-axis losses and startup/call tradeoffs.

Negative-GC memory modes remain excluded: 32 in each N08 cohort and 33 in each
shared N09/N10 cohort. Counters overlap, external accounting can include Wasm
linear memory, and no total-process or general memory-saving claim follows.
Cold native import/initialization remains a separate diagnostic, excluding
process launch, core compilation and host-import setup. These Node/CPU/toolchain
results do not establish browser or end-to-end performance.

The required historical isolation repair is now supported for N08–N11 at their
frozen smoke scope. N14 remains in progress: matched 166-operation factory/named
measurements with both inline controls, browser sessions, allocation/context and
lazy-init investigation, and the remaining diagnostic port are still required.
Inline remains the production default.
