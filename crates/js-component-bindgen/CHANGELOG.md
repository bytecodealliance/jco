# Changelog

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

