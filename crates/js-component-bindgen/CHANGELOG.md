# Changelog

## [1.19.0-rc.2] - 2026-05-13

This RC tests new release machinery that allows for augmenting changelog entries
with custom messages (like this one).


## [1.19.0-rc.1] - 2026-05-13



## [1.19.0-rc.0] - 2026-05-12

### 🚀 Features

- _(bindgen)_ add support for stream reads with count > 1 by @andreiltd


### 🐛 Bug Fixes

- _(bindgen)_ register p3 global table-map intrinsics before per-table assignments by @GamePad64 in #1464

- _(bindgen)_ fix result rejection lowering and stream drop propagation by @andreiltd in #1461

- _(bindgen)_ allow external crates to use intrinsic renderer by @vados-cosmonic in #1462

- _(bindgen)_ ensure moving storage pointers by abi size by @andreiltd in #1452

- _(bindgen)_ cache the listValue implementation by @andreiltd in #1445

- _(bindgen)_ lift numeric p3 lists and streams as typed arrays by @andreiltd

- _(bindgen)_ populate imported resource lower metadata by @andreiltd in #1450

- _(bindgen)_ use async ABI for async imports by @andreiltd in #1449

- _(bindgen)_ address code review by @andreiltd

- _(bindgen)_ get blocked copy result from pending event by @andreiltd

- _(bindgen)_ avoid async future and stream host injection deadlocks by @andreiltd


### 🚜 Refactor

- _(bindgen)_ move stream host injection readiness check by @andreiltd in #1437



## New Contributors
* @GamePad64 made their first contribution in [#1464](https://github.com/bytecodealliance/jco/pull/1464)


## [1.18.0] - 2026-04-29

### 🚀 Features

- _(bindgen)_ implement future<future<t>> lower by @vados-cosmonic

- _(bindgen)_ fill out future lower impl by @vados-cosmonic


### 🐛 Bug Fixes

- _(bindgen)_ return state-only handle when async-lowered import resolves eagerly by @andreiltd in #1434

- _(bindgen)_ use waitable index in p3 future event payload by @andreiltd in #1433

- _(bindgen)_ lint & nested future check by @vados-cosmonic in #1422

- _(bindgen)_ progress towards nested futture read by @vados-cosmonic

- _(bindgen)_ fix task.return param spill check by @vados-cosmonic

- _(bindgen)_ more direct task failure by @vados-cosmonic

- _(bindgen)_ fix error passing for initial export call errors by @vados-cosmonic

- _(bindgen)_ re-enable determinism coinflip by @vados-cosmonic


### ⚙️ Miscellaneous Tasks

- _(bindgen)_ update comment by @vados-cosmonic

- _(bindgen)_ set errored on tasks that error early by @vados-cosmonic




## [1.17.0] - 2026-04-22


## New Contributors
* @QuantumSegfault made their first contribution in [#1421](https://github.com/bytecodealliance/jco/pull/1421)


## [1.16.8] - 2026-04-18

### 🚜 Refactor

- _(bindgen)_ update 'use jco' directive to 'use components' by @vados-cosmonic




## [1.16.7] - 2026-04-17

### 🚀 Features

- _(bindgen)_ add --strict option for enabling type checks by @vados-cosmonic


### 🐛 Bug Fixes

- _(bindgen)_ remove leftover debug code by @vados-cosmonic




## [1.16.6] - 2026-04-16

### 🚀 Features

- _(bindgen)_ add support for p3 futures by @vados-cosmonic

- _(bindgen)_ add explicit checks for lowered numeric primitives by @vados-cosmonic

- _(bindgen)_ host side stream writes from any async iterator by @vados-cosmonic

- _(bindgen)_ implement Instruction::StreamLower by @vados-cosmonic


### 🐛 Bug Fixes

- _(bindgen)_ use IndexMap for deterministic export iteration order by @wondenge

- _(bindgen)_ resource hookup for imports by @vados-cosmonic in #1371

- _(bindgen)_ use adhoc mapping while generating lift/lower fns by @vados-cosmonic

- _(bindgen)_ impl async stream lower owned resources by @vados-cosmonic

- _(bindgen)_ implementation of flat lower own by @vados-cosmonic

- _(bindgen)_ fix async future JS codegen producing invalid output by @wondenge in #1367

- _(bindgen)_ async stream list lower impl by @vados-cosmonic

- _(bindgen)_ option, result, flag lowers by @vados-cosmonic

- _(bindgen)_ async stream option & result lowering by @vados-cosmonic

- _(bindgen)_ revert utf16 encoding changes by @vados-cosmonic

- _(bindgen)_ utf16 decode logic by @vados-cosmonic

- _(bindgen)_ fill in missing lower impls by @vados-cosmonic

- _(bindgen)_ async stream record lowering impl by @vados-cosmonic

- _(bindgen)_ async string flat lowering missing realloc by @vados-cosmonic

- _(bindgen)_ missing ctx in memory usage by @vados-cosmonic

- _(bindgen)_ host-side write post-read event clearing by @vados-cosmonic

- _(bindgen)_ fix Instruction::StreamLift in async contexts by @vados-cosmonic

- _(bindgen)_ done check during read by @vados-cosmonic

- _(bindgen)_ check for host data in host-controlled streams by @vados-cosmonic

- _(bindgen)_ stream drop logic by @vados-cosmonic


### 🚜 Refactor

- _(bindgen)_ use upstream indexmap dep by @vados-cosmonic

- _(bindgen)_ factor out strewam write injection, use w/ lower by @vados-cosmonic

- _(bindgen)_ resource lift handling by @vados-cosmonic

- _(bindgen)_ move resouce scope tracking by @vados-cosmonic in #1358

- _(bindgen)_ use older iteration pattern for node 18/20 by @vados-cosmonic in #1343

- _(bindgen)_ rework lowering code by @vados-cosmonic

- _(bindgen)_ late handling of string encoding by @vados-cosmonic


### ⚙️ Miscellaneous Tasks

- _(bindgen)_ update wasm/wit deps to 0.245.1 by @vados-cosmonic

- _(bindgen)_ fmt by @vados-cosmonic

- _(bindgen)_ clippy by @vados-cosmonic



## New Contributors
* @wondenge made their first contribution


## [1.16.5] - 2026-03-30

### 🚀 Features

- _(bindgen)_ configure wasmparser for wasm 3.0 support by @vados-cosmonic in #1348

- _(bindgen)_ add drop for external stream class by @vados-cosmonic


### 🐛 Bug Fixes

- _(bindgen)_ generate ancillary type generation for functions by @vados-cosmonic

- _(bindgen)_ bindgen runtime bugs by @vados-cosmonic in #1347

- _(bindgen)_ flat stream lift for nested streams by @vados-cosmonic

- _(bindgen)_ allow for imported resources to be lifted out by @vados-cosmonic

- _(bindgen)_ more gracefully handle missing type data by @vados-cosmonic

- _(bindgen)_ add remaining stream lift tests by @vados-cosmonic




## [1.16.4] - 2026-03-24

### 🐛 Bug Fixes

- _(bindgen)_ regression in support for core wasm export initialize by @vados-cosmonic




## [1.16.3] - 2026-03-23

### 🚀 Features

- _(bindgen)_ add stream lift for flags by @vados-cosmonic

- _(bindgen)_ add flat lift for tuple<t> by @vados-cosmonic


### 🐛 Bug Fixes

- _(bindgen)_ stream timing issue by @vados-cosmonic

- _(bindgen)_ list canon lower for special cased list<u8> by @vados-cosmonic

- _(bindgen)_ use of async enter by @vados-cosmonic

- _(bindgen)_ error tag name by @vados-cosmonic

- _(bindgen)_ async flat lift impl for fixed length lists by @vados-cosmonic

- _(bindgen)_ list async lift impls for list & fixed size list by @vados-cosmonic


### 🚜 Refactor

- _(bindgen)_ impl for fixed/unknown length lists by @vados-cosmonic

- _(bindgen)_ rework async lift for enums by @vados-cosmonic


### ⚙️ Miscellaneous Tasks

- _(bindgen)_ clippy by @vados-cosmonic

- _(bindgen)_ show value in debug msg for incorrect variant input by @vados-cosmonic




## [1.16.2] - 2026-03-18

### 🚀 Features

- _(bindgen)_ implement fixed length lists by @yannbolliger


### 🐛 Bug Fixes

- _(bindgen)_ make all bindings const by @yannbolliger in #1315




## [1.16.1] - 2026-03-18

### 🐛 Bug Fixes

- _(bindgen)_ variant lifting impl, update code for lowering by @vados-cosmonic in #1316

- _(bindgen)_ record lift implementation by @vados-cosmonic




## [1.16.0] - 2026-03-17

### 🚀 Features

- _(bindgen)_ add stubs for {Enter,Exit}SyncCall by @vados-cosmonic in #1279

- _(bindgen)_ add basic avoidance of overlapping async task runs by @vados-cosmonic


### 🐛 Bug Fixes

- _(bindgen)_ flat string lift by @vados-cosmonic

- _(bindgen)_ allow overriding lower import trampolines for deno by @vados-cosmonic

- _(bindgen)_ err ctx impl by @vados-cosmonic

- _(bindgen)_ stream impl, determinism, async machinery by @vados-cosmonic

- _(bindgen)_ wait for exits rather than result returns by @vados-cosmonic

- _(bindgen)_ avoid component invariant checking for host tasks by @vados-cosmonic

- _(bindgen)_ remove lift/lower duplication on task.resolve by @vados-cosmonic

- _(bindgen)_ stream end handling, event loop by @vados-cosmonic


### 🚜 Refactor

- _(bindgen)_ consistent use of promise with resolvers ponyfill by @vados-cosmonic


### ⚙️ Miscellaneous Tasks

- _(bindgen)_ remove leftover debug line by @vados-cosmonic in #1308

- _(bindgen)_ add debugging to unexpected results branch by @vados-cosmonic

- _(bindgen)_ update upstream deps by @vados-cosmonic

- _(bindgen)_ remove extra tick by @vados-cosmonic

- _(bindgen)_ fmt by @vados-cosmonic




## [1.15.0] - 2026-02-13

### 🚀 Features

- _(bindgen)_ add p3 stream implementation by @vados-cosmonic

- _(bindgen)_ add semver-compatible matching by @ricochet


### 🐛 Bug Fixes

- _(bindgen)_ enable wasm exceptions proposal support by @rioam2 in #1258

- _(bindgen)_ missing scope_id for resource borrow by @vados-cosmonic

- _(bindgen)_ async host import lookup by @vados-cosmonic

- _(bindgen)_ resource connecting, comments around lifts for futures by @vados-cosmonic

- _(bindgen)_ resource tracking by @vados-cosmonic

- _(bindgen)_ typo in lift code by @vados-cosmonic

- _(bindgen)_ unit stream copy check by @vados-cosmonic

- _(bindgen)_ refactor canon list lower handling by @vados-cosmonic

- _(bindgen)_ s32 flat lower by @vados-cosmonic


### ⚙️ Miscellaneous Tasks

- _(bindgen)_ lint by @vados-cosmonic

- _(bindgen)_ fix clippy by @vados-cosmonic in #1252

- _(bindgen)_ cargo fmt by @vados-cosmonic



## New Contributors
* @rioam2 made their first contribution in [#1258](https://github.com/bytecodealliance/jco/pull/1258)


## [1.14.1] - 2026-02-04

### 🐛 Bug Fixes

* let instead of const on backpressureCleared because it is reassigned

## New Contributors
* @rgripper made their first contribution in [#1241](https://github.com/bytecodealliance/jco/pull/1241)


## [1.14.0] - 2026-02-01

### 🚀 Features

* *(bindgen)* add "use jco" telemetry directive by @vados-cosmonic

* *(bindgen)* add a check for multiple tasks for a wasm export by @vados-cosmonic

* *(bindgen)* lower impl for results/variants, error context by @vados-cosmonic

* *(bindgen)* add machinery for lowering guest->guest async results by @vados-cosmonic

* *(bindgen)* require lifted exports to be async lowered by @vados-cosmonic

* *(bindgen)* wrap detected lowers for host fns by @vados-cosmonic

* *(bindgen)* record call metadata with subtasks by @vados-cosmonic

* *(bindgen)* support recording memories for components by @vados-cosmonic

* *(bindgen)* introduce global per-component async lower lookup by @vados-cosmonic

* *(bindgen)* async lowering logic for host imports by @vados-cosmonic

* *(bindgen)* add trampoline for lower import by @vados-cosmonic

* *(bindgen)* generate subtasks for async host imports by @vados-cosmonic

* *(bindgen)* distinguish host provided imports by @vados-cosmonic

* *(bindgen)* implement gc valtype conversion by @vados-cosmonic


### 🐛 Bug Fixes

* *(bindgen)* remove extraneous subtask resolve by @vados-cosmonic

* *(bindgen)* params/result ptr separation, import key trimming by @vados-cosmonic

* *(bindgen)* waitable set poll functionality for latest p3 updates by @vados-cosmonic

* *(bindgen)* param checking logic, prepare call by @vados-cosmonic

* *(bindgen)* fix bugs in future/stream & waitable trampolines by @vados-cosmonic

* *(bindgen)* post-return test, loosen reqs for fused post-return by @vados-cosmonic

* *(bindgen)* lowers for top level (root) host imports by @vados-cosmonic

* *(bindgen)* disable useful error test, fix fn name parsing by @vados-cosmonic

* *(bindgen)* async host imports by @vados-cosmonic

* *(bindgen)* subtask return logic for fused components by @vados-cosmonic

* *(bindgen)* wire up fused lift lower by @vados-cosmonic

* *(bindgen)* interpolation on string length during encoding by @vados-cosmonic

* *(bindgen)* working basic async host imports by @vados-cosmonic

* *(bindgen)* lowering, refactor string intrinsics for clarity by @vados-cosmonic

* *(bindgen)* memory index usage by @vados-cosmonic

* *(bindgen)* update async task & host code by @vados-cosmonic

* *(bindgen)* pass in memory getter to lower import by @vados-cosmonic

* *(bindgen)* host import in subtask start logic by @vados-cosmonic

* *(bindgen)* backpressure functionality by @vados-cosmonic

* *(bindgen)* fix missing backpressure machinery by @vados-cosmonic

* *(bindgen)* webidl binding account for missing internal keys by @vados-cosmonic

* *(bindgen)* allow missing current task by @vados-cosmonic

* *(bindgen)* required intrisnics for err context by @vados-cosmonic

* *(bindgen)* host provided hint on constructors by @vados-cosmonic

* *(bindgen)* use of size param, increase code limit by @vados-cosmonic

* *(bindgen)* fix host async import calling by @vados-cosmonic

* *(bindgen)* workaround lint for unused variables in macros by @vados-cosmonic in #1166

* *(bindgen)* loosen checks for task completion, fix conflict by @vados-cosmonic

* *(bindgen)* fix post return lookup by @vados-cosmonic

* *(bindgen)* async impl for task state & subtask management by @vados-cosmonic

* *(bindgen)* use ponyfill for `Promise.withResolvers` by @wooorm-arcjet in #1156


### 🚜 Refactor

* *(bindgen)* remove AsyncTask#pollForEvent by @vados-cosmonic

* *(bindgen)* clean up some code by @vados-cosmonic

* *(bindgen)* rework memory idx setting for tasks by @vados-cosmonic

* *(bindgen)* followup for rename of task creation intrinsic by @vados-cosmonic

* *(bindgen)* rename task creation intrinsic by @vados-cosmonic

* *(bindgen)* more flexibility for missing memories by @vados-cosmonic

* *(bindgen)* rework async task/subtask resolution handling by @vados-cosmonic

* *(bindgen)* exclusive locking logic by @vados-cosmonic


### ⚙️ Miscellaneous Tasks

* *(bindgen)* wit-bindgen -> 0.52.0 by @vados-cosmonic in #1229

* *(bindgen)* add backpressure dec/inc to early trampolines by @vados-cosmonic

* *(bindgen)* rustfmt by @vados-cosmonic in #1151

* *(bindgen)* fix lint by @vados-cosmonic

* *(bindgen)* cleanup testing code by @vados-cosmonic

* *(bindgen)* prep for writing out results for async calls by @vados-cosmonic

* *(bindgen)* remove some overly verbose logging by @vados-cosmonic

* *(bindgen)* temporarily use pre-merged wit-bindgen code by @vados-cosmonic

* *(bindgen)* fix lint by @vados-cosmonic



## New Contributors
* @molarmanful made their first contribution in [#1184](https://github.com/bytecodealliance/jco/pull/1184)
* @wffurr made their first contribution in [#1172](https://github.com/bytecodealliance/jco/pull/1172)
* @wooorm-arcjet made their first contribution in [#1156](https://github.com/bytecodealliance/jco/pull/1156)


## [1.13.0] - 2025-11-03

### 🚀 Features

* *(bindgen)* return promises for sync lowered async functions by @vados-cosmonic


### 🐛 Bug Fixes

* *(bindgen)* allow extended const wasm feature during parse by @vados-cosmonic in #1085

* *(bindgen)* async task return value by @vados-cosmonic in #1084

* *(bindgen)* assert for stack values during a return for async by @vados-cosmonic

* *(bindgen)* fix async return param logic by @vados-cosmonic

* *(bindgen)* declare within declare for reserved words by @vados-cosmonic


### ⚙️ Miscellaneous Tasks

* *(bindgen)* fix lint by @vados-cosmonic

* *(bindgen)* fix lint by @vados-cosmonic

* *(bindgen)* update upstream deps by @vados-cosmonic in #1028

* *(bindgen)* remove leftover debug logs by @vados-cosmonic in #979




## [1.12.0] - 2025-08-25

### 🚀 Features

* *(bindgen)* generate Disposable interface for wasm resources (#901) by @iamrajiv in #901

* *(bindgen)* support futures and streams (#806) by @vados-cosmonic in #806

* *(bindgen)* implement waitable set intrinsics (#767) by @vados-cosmonic in #767

* *(bindgen)* implement yield (#745) by @vados-cosmonic in #745

* *(bindgen)* implement task.cancel (#743) by @vados-cosmonic in #743

* *(bindgen)* implement backpressure.set (#742) by @vados-cosmonic in #742

* *(bindgen)* context.{get|set}, initial task.return impl (#736) by @vados-cosmonic in #736


### 🐛 Bug Fixes

* *(bindgen)* dispose type generation by @vados-cosmonic in #954

* *(bindgen)* small fixups to global task id tracking codegen by @vados-cosmonic in #951


### 🚜 Refactor

* *(bindgen)* intrinsics (#811) by @vados-cosmonic in #811



## New Contributors
* @lrowe made their first contribution in [#956](https://github.com/bytecodealliance/jco/pull/956)
* @dependabot[bot] made their first contribution in [#958](https://github.com/bytecodealliance/jco/pull/958)
* @jco-release-bot made their first contribution in [#930](https://github.com/bytecodealliance/jco/pull/930)
* @iamrajiv made their first contribution in [#901](https://github.com/bytecodealliance/jco/pull/901)
* @elmerbulthuis made their first contribution in [#859](https://github.com/bytecodealliance/jco/pull/859)
* @andreiltd made their first contribution in [#764](https://github.com/bytecodealliance/jco/pull/764)
* @thomas9911 made their first contribution in [#765](https://github.com/bytecodealliance/jco/pull/765)
* @emmanuel-ferdman made their first contribution in [#756](https://github.com/bytecodealliance/jco/pull/756)


## [1.12.0-rc.0] - 2025-08-21

### 🚀 Features

* *(bindgen)* generate Disposable interface for wasm resources (#901) by @iamrajiv in #901

* *(bindgen)* support futures and streams (#806) by @vados-cosmonic in #806

* *(bindgen)* implement waitable set intrinsics (#767) by @vados-cosmonic in #767

* *(bindgen)* implement yield (#745) by @vados-cosmonic in #745

* *(bindgen)* implement task.cancel (#743) by @vados-cosmonic in #743

* *(bindgen)* implement backpressure.set (#742) by @vados-cosmonic in #742

* *(bindgen)* context.{get|set}, initial task.return impl (#736) by @vados-cosmonic in #736


### 🐛 Bug Fixes

* *(bindgen)* small fixups to global task id tracking codegen by @vados-cosmonic in #951


### 🚜 Refactor

* *(bindgen)* intrinsics (#811) by @vados-cosmonic in #811



## New Contributors
* @dependabot[bot] made their first contribution in [#947](https://github.com/bytecodealliance/jco/pull/947)
* @jco-release-bot made their first contribution in [#930](https://github.com/bytecodealliance/jco/pull/930)
* @iamrajiv made their first contribution in [#901](https://github.com/bytecodealliance/jco/pull/901)
* @elmerbulthuis made their first contribution in [#859](https://github.com/bytecodealliance/jco/pull/859)
* @andreiltd made their first contribution in [#764](https://github.com/bytecodealliance/jco/pull/764)
* @thomas9911 made their first contribution in [#765](https://github.com/bytecodealliance/jco/pull/765)
* @emmanuel-ferdman made their first contribution in [#756](https://github.com/bytecodealliance/jco/pull/756)



## [js-component-bindgen-v1.11.0] - 2025-04-28

### ⚙️ Miscellaneous Tasks

* *(bindgen)* decouple jco and component bindgen versioning (#635) by @vados-cosmonic in #635

