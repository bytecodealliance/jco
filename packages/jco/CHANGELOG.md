# Changelog

## [1.14.0] - 2025-08-25

### 🚀 Features

* *(jco)* support async export generation for guest-types by @vados-cosmonic

* *(jco)* allow configurable wasm-opt bin path by @vados-cosmonic in #957

* *(jco)* enable memory64 by @vados-cosmonic in #941


### 🐛 Bug Fixes

* *(jco)* asyncMode usage in transpile test by @vados-cosmonic in #959

* *(jco)* use unsigned int for pointer load sizing by @vados-cosmonic in #949

* *(jco)* async export type generation by @vados-cosmonic in #946

* *(jco)* improve exec failure message during tests by @vados-cosmonic in #943


### 🧪 Testing

* *(jco)* add memory usage test by @vados-cosmonic in #950


### ⚙️ Miscellaneous Tasks

* *(jco)* update preview2-shim to v0.17.3 by @vados-cosmonic in #968



## New Contributors
* @lrowe made their first contribution in [#956](https://github.com/bytecodealliance/jco/pull/956)


## [1.13.3] - 2025-08-18

### 🐛 Bug Fixes

* *(jco)* fix memory leak for async tasks on non-async fns by @vados-cosmonic


### 🚜 Refactor

* *(jco)* use stack for global component index & task ID by @vados-cosmonic in #938




## [1.13.2] - 2025-08-12

### 🐛 Bug Fixes

* *(jco)* const reassignment of variable in component async state (#929) by @vados-cosmonic in #929


### 🧪 Testing

* *(jco)* allow retries on browser test (#919) by @vados-cosmonic in #919



## New Contributors
* @iamrajiv made their first contribution in [#901](https://github.com/bytecodealliance/jco/pull/901)


## [1.13.1] - 2025-08-08

### 🚀 Features

* *(jco)* begin stabilizing p3 async task implementation (#817) by @vados-cosmonic in #817


### ⚙️ Miscellaneous Tasks

* *(jco)* update upstream wasmtime dependencies (#897) by @vados-cosmonic in #897




## [1.13.1-rc.5] - 2025-08-08



## [1.13.1-rc.4] - 2025-08-08



## [1.13.1-rc.3] - 2025-08-08



## [1.13.1-rc.2] - 2025-08-08



## [1.13.1-rc.1] - 2025-08-08



## [1.13.1-rc.0] - 2025-08-08

### 🚀 Features

* *(jco)* begin stabilizing p3 async task implementation (#817) by @vados-cosmonic in #817


### ⚙️ Miscellaneous Tasks

* *(jco)* update upstream wasmtime dependencies (#897) by @vados-cosmonic in #897




## [1.13.0] - 2025-07-23

### 🚀 Features

* *(jco)* update componentize-js to v0.18.4 (#881) by @vados-cosmonic in #881


### 🐛 Bug Fixes

* *(jco)* optional arguments for jco and opt (#875) by @vados-cosmonic in #875

* *(jco)* opt subcommand usage of '--' (#874) by @vados-cosmonic in #874

* *(jco)* remove double dash option (#871) by @vados-cosmonic in #871


### ⚙️ Miscellaneous Tasks

* *(jco)* update generated types (#864) by @vados-cosmonic in #864




## [1.13.0-rc.0] - 2025-07-23

### 🚀 Features

* *(jco)* update componentize-js to v0.18.4 (#881) by @vados-cosmonic in #881


### 🐛 Bug Fixes

* *(jco)* optional arguments for jco and opt (#875) by @vados-cosmonic in #875

* *(jco)* opt subcommand usage of '--' (#874) by @vados-cosmonic in #874

* *(jco)* remove double dash option (#871) by @vados-cosmonic in #871


### ⚙️ Miscellaneous Tasks

* *(jco)* update generated types (#864) by @vados-cosmonic in #864




## [1.12.0] - 2025-07-17

### 🚜 Refactor

* *(jco)* move type generation functions to separate file (#839) by @vados-cosmonic in #839




## [1.12.0-rc.1] - 2025-07-17

### 🚜 Refactor

* *(jco)* move type generation functions to separate file (#839) by @vados-cosmonic in #839




## [1.12.0-rc.0] - 2025-07-17

### 🐛 Bug Fixes

* *(jco)* run linter on jco package source code (#758) by @andreiltd in #758

### 🚜 Refactor

* refactor: pass more debug options to componentize by @vados-cosmonic in #607

### ⚙️ Miscellaneous Tasks

* chore(deps): update componentize-js to v0.18.3 by @vados-cosmonic in #620


## [1.11.3] - 2025-06-30

### 🐛 Bug Fixes

* *(jco)* run linter on jco package source code (#758)




## [1.11.3-rc.1] - 2025-06-30



## [1.11.3-rc.0] - 2025-06-28

### 🐛 Bug Fixes

* *(jco)* run linter on jco package source code (#758) by @andreiltd in #758




## [1.11.2] - 2025-05-12

### 🐛 Bug Fixes

* *(jco)* missing stat dependency (#650) by @vados-cosmonic in #650

* *(jco)* appending to const value raises error (#648) by @thomas9911 in #648


### 🚜 Refactor

* *(jco)* re-arrange package.json, add contributors (#679) by @vados-cosmonic in #679


### ⚙️ Miscellaneous Tasks

* *(jco)* update printed versions (#677) by @vados-cosmonic in #677

* *(jco)* update printed CLI version by @vados-cosmonic



## New Contributors
* @jco-release-bot made their first contribution in [#684](https://github.com/bytecodealliance/jco/pull/684)
* @dependabot[bot] made their first contribution in [#662](https://github.com/bytecodealliance/jco/pull/662)
* @thomas9911 made their first contribution in [#648](https://github.com/bytecodealliance/jco/pull/648)


## [1.11.2-rc.2] - 2025-05-12

### 🐛 Bug Fixes

* *(jco)* missing stat dependency (#650) by @vados-cosmonic in #650

* *(jco)* appending to const value raises error (#648) by @thomas9911 in #648


### 🚜 Refactor

* *(jco)* re-arrange package.json, add contributors (#679) by @vados-cosmonic in #679


### ⚙️ Miscellaneous Tasks

* *(jco)* update printed versions (#677) by @vados-cosmonic in #677

* *(jco)* update printed CLI version by @vados-cosmonic



## New Contributors
* @jco-release-bot made their first contribution in [#678](https://github.com/bytecodealliance/jco/pull/678)
* @dependabot[bot] made their first contribution in [#662](https://github.com/bytecodealliance/jco/pull/662)
* @thomas9911 made their first contribution in [#648](https://github.com/bytecodealliance/jco/pull/648)


## [1.11.2-rc.1] - 2025-05-12

### ⚙️ Miscellaneous Tasks

* *(jco)* update printed versions (#677) by @vados-cosmonic in #677

* *(jco)* update printed CLI version by @vados-cosmonic




## [1.11.2-rc.0] - 2025-05-11

### 🐛 Bug Fixes

* *(jco)* missing stat dependency (#650) by @vados-cosmonic in #650

* *(jco)* appending to const value raises error (#648) by @thomas9911 in #648



## New Contributors
* @dependabot[bot] made their first contribution in [#662](https://github.com/bytecodealliance/jco/pull/662)
* @thomas9911 made their first contribution in [#648](https://github.com/bytecodealliance/jco/pull/648)


## [jco-v1.11.0] - 2025-04-28

### 🚀 Features

* *(jco)* expose comoponentizejs's debugBuild option on command line (#633) by @pchickey in #633



## New Contributors
* @tanishiking made their first contribution in [#631](https://github.com/bytecodealliance/jco/pull/631)
* @marosset made their first contribution in [#609](https://github.com/bytecodealliance/jco/pull/609)
* @MendyBerger made their first contribution in [#591](https://github.com/bytecodealliance/jco/pull/591)
