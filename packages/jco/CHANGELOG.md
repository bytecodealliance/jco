# Changelog

## [1.17.0] - 2026-02-13

### 🐛 Bug Fixes

- _(jco)_ eslint use in tests, avoid formatting tsc output by @vados-cosmonic

### 🚜 Refactor

- _(jco)_ comment out unminify by @vados-cosmonic

### 🧪 Testing

- _(jco)_ temporarily disable post-codegen lint by @vados-cosmonic in #1255

- _(jco)_ use assert.strictEqual in value check by @vados-cosmonic in #1256

- _(jco)_ temporarily disable s32 stream test by @vados-cosmonic

- _(jco)_ add tests for p3 streams by @vados-cosmonic

- _(jco)_ add regression test for improved mapping semantics by @vados-cosmonic

### ⚙️ Miscellaneous Tasks

- _(jco)_ oxfmt by @vados-cosmonic

- _(jco)_ swap eslint for oxlint by @vados-cosmonic

## [1.16.1] - 2026-02-04

### ⚙️ Miscellaneous Tasks

- (update of js-component-bindgen to v1.14.1)

## [1.16.0] - 2026-02-01

### 🚀 Features

- _(jco)_ error on attempt to set async imports for sync transpile by @vados-cosmonic

- _(jco)_ enable p3 async post return test by @vados-cosmonic

### 🐛 Bug Fixes

- _(jco)_ test use of push context by @vados-cosmonic

- _(jco)_ browser tests by @vados-cosmonic

- _(jco)_ tests, async tick() behavior by @vados-cosmonic

### 🧪 Testing

- _(jco)_ test telemetry directive by @vados-cosmonic in #1228

- _(jco)_ re-add basic custom component tests by @vados-cosmonic

- _(jco)_ re-add basic backpressure test by @vados-cosmonic

- _(jco)_ update previously deleted test to use test components by @vados-cosmonic

- _(jco)_ add machinery for building local rust p3 test components by @vados-cosmonic

- _(jco)_ simply remove outdated async component tests by @vados-cosmonic

- _(jco)_ fix the post-return tests for updated upstream deps by @vados-cosmonic

- _(jco)_ update error-context tests by @vados-cosmonic

- _(jco)_ update error context to newer binaries by @vados-cosmonic

- _(jco)_ fix ts generation helper usage by @vados-cosmonic

- _(jco)_ refactor typescript fixture generation code by @vados-cosmonic

- _(jco)_ use p2-shim in strings test by @vados-cosmonic

- _(jco)_ update browser template by @vados-cosmonic

- _(jco)_ update async context test by @vados-cosmonic

- _(jco)_ re-enable skipped and excluded tests by @vados-cosmonic

- _(jco)_ add basic test for async imports by @vados-cosmonic

- _(jco)_ improve documentation for setup helper by @vados-cosmonic

- _(jco)_ add test for basic direct import async function by @vados-cosmonic

- _(jco)_ add/improve testing for direct exported async returns by @vados-cosmonic

- _(jco)_ skip hanging context.get/set test by @vados-cosmonic

- _(jco)_ print actual usage for memory leak test by @vados-cosmonic

- _(jco)_ update/fix tests with updated component bindgen by @vados-cosmonic

- _(jco)_ port p3 post-return scenario tests by @vados-cosmonic

- _(jco)_ port p3 backpressure scenario tests by @vados-cosmonic

### ⚙️ Miscellaneous Tasks

- _(jco)_ update transpile tests, replace & updatte wasm binaries by @vados-cosmonic

- _(jco)_ re-enable all error-context tests by @vados-cosmonic

- _(jco)_ update upstream p3 test binaries by @vados-cosmonic

- _(jco)_ update to latest upstream deps by @vados-cosmonic

- _(jco)_ fix lint by @vados-cosmonic

- _(jco)_ remove stale TODO by @vados-cosmonic

## New Contributors

- @molarmanful made their first contribution in [#1184](https://github.com/bytecodealliance/jco/pull/1184)
- @wffurr made their first contribution in [#1172](https://github.com/bytecodealliance/jco/pull/1172)
- @wooorm-arcjet made their first contribution in [#1156](https://github.com/bytecodealliance/jco/pull/1156)

## [1.15.4] - 2025-12-01

### 🐛 Bug Fixes

- _(jco)_ async return writing for caller memory by @vados-cosmonic in #1143

- _(jco)_ require utf8 decoder for flat string lifts by @vados-cosmonic in #1142

### 🧪 Testing

- _(jco)_ refactor vite SSR hack for vitest by @vados-cosmonic

### ⚙️ Miscellaneous Tasks

- _(jco)_ fix imports of bare node 'url' builtin by @vados-cosmonic

## [1.15.3] - 2025-11-03

### 🚀 Features

- _(jco)_ js-component-bindgen -> v1.13.0 by @vados-cosmonic in #1090

## [1.15.2] - 2025-10-27

### 🧪 Testing

- _(jco)_ add upstream error-context caller/callee tests by @vados-cosmonic

- _(jco)_ port single-component p3 error-context scenario by @vados-cosmonic

- _(jco)_ add machinery for running upstream tests by @vados-cosmonic

- _(jco)_ fix rmdirSync use with recursive by @vados-cosmonic in #1056

### ⚙️ Miscellaneous Tasks

- _(jco)_ update componentize-js to v0.19.3 by @vados-cosmonic in #1070

- _(jco)_ update upstream wasm deps to \*.240.0 by @vados-cosmonic in #1065

- _(jco)_ update wit-bindgen to v0.47.0 by @vados-cosmonic

- _(jco)_ fix lint by @vados-cosmonic in #1061

## [1.15.1] - 2025-10-10

### 🧪 Testing

- _(jco)_ port more tests, use updated wit-bindgen-core by @vados-cosmonic

- _(jco)_ port p3-prototyping tests by @vados-cosmonic

### ⚙️ Miscellaneous Tasks

- _(jco)_ update componentize-js to v0.19.1 by @vados-cosmonic in #1044

- _(jco)_ update jco version in examples by @vados-cosmonic in #1045

## [1.15.0] - 2025-09-11

### 🚀 Features

- _(jco)_ add --debug, refactor feature enable/disable by @vados-cosmonic in #984

- _(jco)_ add wit & output path defaults for type generation by @vados-cosmonic in #986

### 🐛 Bug Fixes

- _(jco)_ remove missing return keys from awaitable by @vados-cosmonic in #1014

### 🚜 Refactor

- _(jco)_ remove chalk dependency by @vados-cosmonic in #1010

### 🧪 Testing

- _(jco)_ remove declare use from tests by @vados-cosmonic in #994

- _(jco)_ add test for transpile mapping by @vados-cosmonic in #987

### ⚙️ Miscellaneous Tasks

- _(jco)_ eslint fix by @vados-cosmonic

- _(jco)_ remove prettier in favor of eslint w/ fix by @vados-cosmonic

- _(jco)_ update componentize-js to v0.18.5 by @vados-cosmonic in #992

- _(jco)_ regenerate internal type declarations by @vados-cosmonic in #990

- _(jco)_ update deps (wit-bindgen 0.45.0, wasm-\* 0.238.0) by @vados-cosmonic

## [1.14.0] - 2025-08-25

### 🚀 Features

- _(jco)_ support async export generation for guest-types by @vados-cosmonic

- _(jco)_ allow configurable wasm-opt bin path by @vados-cosmonic in #957

- _(jco)_ enable memory64 by @vados-cosmonic in #941

### 🐛 Bug Fixes

- _(jco)_ asyncMode usage in transpile test by @vados-cosmonic in #959

- _(jco)_ use unsigned int for pointer load sizing by @vados-cosmonic in #949

- _(jco)_ async export type generation by @vados-cosmonic in #946

- _(jco)_ improve exec failure message during tests by @vados-cosmonic in #943

### 🧪 Testing

- _(jco)_ add memory usage test by @vados-cosmonic in #950

### ⚙️ Miscellaneous Tasks

- _(jco)_ update preview2-shim to v0.17.3 by @vados-cosmonic in #968

## New Contributors

- @lrowe made their first contribution in [#956](https://github.com/bytecodealliance/jco/pull/956)

## [1.13.3] - 2025-08-18

### 🐛 Bug Fixes

- _(jco)_ fix memory leak for async tasks on non-async fns by @vados-cosmonic

### 🚜 Refactor

- _(jco)_ use stack for global component index & task ID by @vados-cosmonic in #938

## [1.13.2] - 2025-08-12

### 🐛 Bug Fixes

- _(jco)_ const reassignment of variable in component async state (#929) by @vados-cosmonic in #929

### 🧪 Testing

- _(jco)_ allow retries on browser test (#919) by @vados-cosmonic in #919

## New Contributors

- @iamrajiv made their first contribution in [#901](https://github.com/bytecodealliance/jco/pull/901)

## [1.13.1] - 2025-08-08

### 🚀 Features

- _(jco)_ begin stabilizing p3 async task implementation (#817) by @vados-cosmonic in #817

### ⚙️ Miscellaneous Tasks

- _(jco)_ update upstream wasmtime dependencies (#897) by @vados-cosmonic in #897

## [1.13.1-rc.5] - 2025-08-08

## [1.13.1-rc.4] - 2025-08-08

## [1.13.1-rc.3] - 2025-08-08

## [1.13.1-rc.2] - 2025-08-08

## [1.13.1-rc.1] - 2025-08-08

## [1.13.1-rc.0] - 2025-08-08

### 🚀 Features

- _(jco)_ begin stabilizing p3 async task implementation (#817) by @vados-cosmonic in #817

### ⚙️ Miscellaneous Tasks

- _(jco)_ update upstream wasmtime dependencies (#897) by @vados-cosmonic in #897

## [1.13.0] - 2025-07-23

### 🚀 Features

- _(jco)_ update componentize-js to v0.18.4 (#881) by @vados-cosmonic in #881

### 🐛 Bug Fixes

- _(jco)_ optional arguments for jco and opt (#875) by @vados-cosmonic in #875

- _(jco)_ opt subcommand usage of '--' (#874) by @vados-cosmonic in #874

- _(jco)_ remove double dash option (#871) by @vados-cosmonic in #871

### ⚙️ Miscellaneous Tasks

- _(jco)_ update generated types (#864) by @vados-cosmonic in #864

## [1.13.0-rc.0] - 2025-07-23

### 🚀 Features

- _(jco)_ update componentize-js to v0.18.4 (#881) by @vados-cosmonic in #881

### 🐛 Bug Fixes

- _(jco)_ optional arguments for jco and opt (#875) by @vados-cosmonic in #875

- _(jco)_ opt subcommand usage of '--' (#874) by @vados-cosmonic in #874

- _(jco)_ remove double dash option (#871) by @vados-cosmonic in #871

### ⚙️ Miscellaneous Tasks

- _(jco)_ update generated types (#864) by @vados-cosmonic in #864

## [1.12.0] - 2025-07-17

### 🚜 Refactor

- _(jco)_ move type generation functions to separate file (#839) by @vados-cosmonic in #839

## [1.12.0-rc.1] - 2025-07-17

### 🚜 Refactor

- _(jco)_ move type generation functions to separate file (#839) by @vados-cosmonic in #839

## [1.12.0-rc.0] - 2025-07-17

### 🐛 Bug Fixes

- _(jco)_ run linter on jco package source code (#758) by @andreiltd in #758

### 🚜 Refactor

- refactor: pass more debug options to componentize by @vados-cosmonic in #607

### ⚙️ Miscellaneous Tasks

- chore(deps): update componentize-js to v0.18.3 by @vados-cosmonic in #620

## [1.11.3] - 2025-06-30

### 🐛 Bug Fixes

- _(jco)_ run linter on jco package source code (#758)

## [1.11.3-rc.1] - 2025-06-30

## [1.11.3-rc.0] - 2025-06-28

### 🐛 Bug Fixes

- _(jco)_ run linter on jco package source code (#758) by @andreiltd in #758

## [1.11.2] - 2025-05-12

### 🐛 Bug Fixes

- _(jco)_ missing stat dependency (#650) by @vados-cosmonic in #650

- _(jco)_ appending to const value raises error (#648) by @thomas9911 in #648

### 🚜 Refactor

- _(jco)_ re-arrange package.json, add contributors (#679) by @vados-cosmonic in #679

### ⚙️ Miscellaneous Tasks

- _(jco)_ update printed versions (#677) by @vados-cosmonic in #677

- _(jco)_ update printed CLI version by @vados-cosmonic

## New Contributors

- @jco-release-bot made their first contribution in [#684](https://github.com/bytecodealliance/jco/pull/684)
- @dependabot[bot] made their first contribution in [#662](https://github.com/bytecodealliance/jco/pull/662)
- @thomas9911 made their first contribution in [#648](https://github.com/bytecodealliance/jco/pull/648)

## [1.11.2-rc.2] - 2025-05-12

### 🐛 Bug Fixes

- _(jco)_ missing stat dependency (#650) by @vados-cosmonic in #650

- _(jco)_ appending to const value raises error (#648) by @thomas9911 in #648

### 🚜 Refactor

- _(jco)_ re-arrange package.json, add contributors (#679) by @vados-cosmonic in #679

### ⚙️ Miscellaneous Tasks

- _(jco)_ update printed versions (#677) by @vados-cosmonic in #677

- _(jco)_ update printed CLI version by @vados-cosmonic

## New Contributors

- @jco-release-bot made their first contribution in [#678](https://github.com/bytecodealliance/jco/pull/678)
- @dependabot[bot] made their first contribution in [#662](https://github.com/bytecodealliance/jco/pull/662)
- @thomas9911 made their first contribution in [#648](https://github.com/bytecodealliance/jco/pull/648)

## [1.11.2-rc.1] - 2025-05-12

### ⚙️ Miscellaneous Tasks

- _(jco)_ update printed versions (#677) by @vados-cosmonic in #677

- _(jco)_ update printed CLI version by @vados-cosmonic

## [1.11.2-rc.0] - 2025-05-11

### 🐛 Bug Fixes

- _(jco)_ missing stat dependency (#650) by @vados-cosmonic in #650

- _(jco)_ appending to const value raises error (#648) by @thomas9911 in #648

## New Contributors

- @dependabot[bot] made their first contribution in [#662](https://github.com/bytecodealliance/jco/pull/662)
- @thomas9911 made their first contribution in [#648](https://github.com/bytecodealliance/jco/pull/648)

## [jco-v1.11.0] - 2025-04-28

### 🚀 Features

- _(jco)_ expose comoponentizejs's debugBuild option on command line (#633) by @pchickey in #633

## New Contributors

- @tanishiking made their first contribution in [#631](https://github.com/bytecodealliance/jco/pull/631)
- @marosset made their first contribution in [#609](https://github.com/bytecodealliance/jco/pull/609)
- @MendyBerger made their first contribution in [#591](https://github.com/bytecodealliance/jco/pull/591)
