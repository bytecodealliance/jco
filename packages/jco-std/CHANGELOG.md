# Changelog

## [0.3.1] - 2026-09-08

### 🐛 Bug Fixes

- _(std)_ make OS bindings work across component boundaries by @vados-cosmonic

- _(std)_ defer glob matcher initialization until runtime by @vados-cosmonic

- _(std)_ redeem HTTP callbacks as exported resources by @vados-cosmonic

- _(std)_ dispatch HTTP callbacks by component registration by @vados-cosmonic

- _(std)_ translate HTTP headers and wrapped WASI errors by @vados-cosmonic

- _(std)_ accept unwrapped direct HTTP host results by @vados-cosmonic

- _(std)_ accept unwrapped DNS host results by @vados-cosmonic

- _(std)_ accept filesystem bytes from other realms by @vados-cosmonic

- _(std)_ accept unwrapped filesystem host results by @vados-cosmonic

## [0.3.0] - 2026-09-08

### 🚀 Features

- _(std)_ implement node:http2 over wasi sockets by @vados-cosmonic

- _(std)_ implement node http2 API by @vados-cosmonic

- _(std)_ implement the computable half of node:module by @vados-cosmonic

- _(std)_ publish Node stream entry points by @vados-cosmonic

- _(std)_ implement Node iterable streams by @vados-cosmonic

- _(std)_ implement Node stream consumers by @vados-cosmonic

- _(std)_ implement Node HTTP servers by @vados-cosmonic

- _(std)_ add WASI HTTP transport by @vados-cosmonic

- _(std)_ add WASI sockets HTTP transport by @vados-cosmonic

- _(std)_ add direct Node HTTP provider by @vados-cosmonic

- _(std)_ implement Node HTTP client core by @vados-cosmonic

- _(std)_ implement Node string decoder by @vados-cosmonic

- _(std)_ implement the node:inspector guest adapter by @vados-cosmonic

- _(std)_ align Node path with Node 24 by @vados-cosmonic

- _(std)_ add Node OS adapters by @vados-cosmonic

- _(std)_ add a host-backed node:ffi adapter for Node 26 by @vados-cosmonic

- _(std)_ implement Node filesystem API by @vados-cosmonic

- _(std)_ add filesystem host capability by @vados-cosmonic

- _(std)_ publish Node DNS entry points by @vados-cosmonic

- _(std)_ add the Node DNS adapter by @vados-cosmonic

- _(std)_ implement the node:events entry points unenv leaves as stubs by @vados-cosmonic

- _(std)_ add Node Errors compatibility by @vados-cosmonic

- _(std)_ add node:diagnostics_channel support by @vados-cosmonic

- _(std)_ refuse the deprecated node:domain module by @vados-cosmonic

- _(std)_ add synchronous-scope node:async_hooks support by @vados-cosmonic

- _(std)_ publish Node console entry points by @vados-cosmonic

- _(std)_ add host-backed Node console adapter by @vados-cosmonic

- _(std)_ publish the node:cluster entry point and document its limits by @vados-cosmonic

- _(std)_ add host-backed node:cluster adapter by @vados-cosmonic

- _(std)_ add Node child process adapter by @vados-cosmonic

- _(std)_ add NodeJS shim for 'node:assert' by @vados-cosmonic

- _(std)_ add WASI HTTP 0.2.12 adapter by @vados-cosmonic

### 🐛 Bug Fixes

- _(std)_ satisfy filesystem host lint rules by @vados-cosmonic

- _(std)_ close errors package export by @vados-cosmonic

- _(std)_ exclude generated 0.2.12 bindings from lint by @vados-cosmonic in #1943

### 🚜 Refactor

- _(std)_ split HTTP2 client and server implementations by @vados-cosmonic

- _(std)_ share deny-by-default host providers across node builtins by @vados-cosmonic

- _(std)_ share host-boundary error serialization across node builtins by @vados-cosmonic

- _(std)_ consolidate node builtin coded errors onto errors/core by @vados-cosmonic

- _(std)_ type DNS host operations by @vados-cosmonic

- _(std)_ type filesystem host operations by @vados-cosmonic

- _(std)_ remove the Node DNS worker bridge by @vados-cosmonic

- _(std)_ share the internal event emitter outside cluster by @vados-cosmonic

- _(std)_ share Node error construction by @vados-cosmonic

- _(std)_ match upstream conventions for the node:cluster adapter by @vados-cosmonic

- _(std)_ align node:cluster with the Node WIT injection pattern by @vados-cosmonic

- _(std)_ namespace Node builtin entry points by WASI version by @vados-cosmonic in #1978

- _(std)_ pin Node builtin entry points to node24.x by @vados-cosmonic

### 🧪 Testing

- _(std)_ cover node http2 implementations by @vados-cosmonic

- _(std)_ add per-member node:path unit tests by @vados-cosmonic

- _(std)_ cover the cluster fork lifecycle through the Node host adapter by @vados-cosmonic

- _(std)_ run node builtin unit tests concurrently by @vados-cosmonic

- _(std)_ check node:module against the host's own module by @vados-cosmonic

- _(std)_ cover Node stream modules by @vados-cosmonic

- _(std)_ cover Node HTTP implementations by @vados-cosmonic

- _(std)_ cover Node HTTP transports by @vados-cosmonic

- _(std)_ cover Node string decoder by @vados-cosmonic

- _(std)_ cover node:inspector against the real Node passthrough by @vados-cosmonic

- _(std)_ expand Node path conformance by @vados-cosmonic

- _(std)_ cover Node OS providers by @vados-cosmonic

- _(std)_ cover node:ffi against the real Node passthrough by @vados-cosmonic

- _(std)_ remove dispatcher implementation checks by @vados-cosmonic

- _(std)_ reject DNS query dispatch by @vados-cosmonic

- _(std)_ reject filesystem query dispatch by @vados-cosmonic

- _(std)_ cover Node filesystem compatibility by @vados-cosmonic

- _(std)_ resolve external DNS with Node host by @vados-cosmonic

- _(std)_ cover the asynchronous Node DNS host by @vados-cosmonic

- _(std)_ cover the Node DNS adapter by @vados-cosmonic

- _(std)_ check the node:events entry points against Node by @vados-cosmonic

- _(std)_ cover Node Errors compatibility by @vados-cosmonic

- _(std)_ cover node:diagnostics_channel against Node by @vados-cosmonic

- _(std)_ cover the node:domain refusal by @vados-cosmonic

- _(std)_ cover the Node console adapter by @vados-cosmonic

- _(std)_ exercise the node:cluster adapter against the Node host by @vados-cosmonic

- _(std)_ cover NodeJS assert shim by @vados-cosmonic

- _(std)_ cover WASI HTTP compatibility matrix by @vados-cosmonic

### ⚙️ Miscellaneous Tasks

- _(std)_ update jco-transpile to v0.13.0 by @vados-cosmonic in #2078

- _(std)_ update preview2-shim dep to v0.24.1 by @vados-cosmonic

- _(std)_ update preview2-shim to v0.24.0 by @vados-cosmonic

- _(std)_ fmt by @vados-cosmonic in #2009

- _(std)_ stop publishing internal os and http implementation modules by @vados-cosmonic

- _(std)_ defer changelog updates to release tooling by @vados-cosmonic

- _(std)_ update jco-transpile to v0.12.1 by @vados-cosmonic

- _(std)_ normalize generated WASI bindings by @vados-cosmonic

- _(std)_ update p2-shim to 0.21.0 by @vados-cosmonic

## [0.2.1] - 2026-08-04

### 🚀 Features

- _(std)_ add NodeJS shim for 'node:path' by @vados-cosmonic

### 🐛 Bug Fixes

- _(std)_ invalid ts typings by @vados-cosmonic in #1581

- _(std)_ specify root dir for tsconfig by @vados-cosmonic

### 🧪 Testing

- _(std)_ update vitest config by @vados-cosmonic in #1602

### ⚙️ Miscellaneous Tasks

- _(std)_ update preview2-shim to v0.20.1 by @vados-cosmonic in #1820

- _(std)_ update jco-transpile to v0.6.0 by @vados-cosmonic

- _(std)_ update componentize-js to v0.22.0 by @vados-cosmonic in #1802

- _(std)_ update jco-transpile to 0.5.1 by @vados-cosmonic

## [jco-std-v0.2.0] - 2026-05-22

### 🚀 Features

- _(std)_ introduce 0.2.x export by @vados-cosmonic

- _(std)_ add 0.2.x export by @vados-cosmonic

- _(std)_ separate exports for middlewares, refactor server export by @vados-cosmonic

- _(std)_ remove star imports, add more docs by @vados-cosmonic in #1117

- _(std)_ add jco-std along with hono adapter by @vados-cosmonic

### 🐛 Bug Fixes

- _(std)_ ts compiler options, type errors by @vados-cosmonic

- _(std)_ setup cmd by @vados-cosmonic

- _(std)_ lint:fix target by @vados-cosmonic

- _(std)_ await the inner async handler promise by @andreiltd in #1264

- _(std)_ remove incoming request resource disposal by @vados-cosmonic

- _(std)_ export paths by @vados-cosmonic

- _(std)_ force jco-transpile-build during build step by @vados-cosmonic

- _(std)_ release automation for std by @vados-cosmonic in #1112

- _(std)_ lint by @vados-cosmonic in #1107

- _(std)_ request creation code for hono integration by @vados-cosmonic

- _(std)_ working hacked response by @vados-cosmonic in #1093

- _(std)_ use alias for jco-std test by @vados-cosmonic

### 🚜 Refactor

- _(std)_ add comments, make folder for middleware, fix exports by @vados-cosmonic

- _(std)_ reuse request/response parsing impls by @vados-cosmonic

- _(std)_ switch to wasi:http as the default method by @vados-cosmonic

### 🧪 Testing

- _(std)_ use old componentize-js in tests where necessary by @vados-cosmonic

- _(std)_ remove custom resolver config by @vados-cosmonic in #1125

- _(std)_ update tests to new export format by @vados-cosmonic

- _(std)_ fix node_modules resolution for app fixture tests by @vados-cosmonic

- _(std)_ add retry for e2e app tests by @vados-cosmonic in #1105

- _(std)_ fix up hono tests by @vados-cosmonic

- _(std)_ remove unused config by @vados-cosmonic

### ⚙️ Miscellaneous Tasks

- _(std)_ update componentize-js to 0.21.0-rc.0 by @vados-cosmonic

- _(std)_ update git cliff config by @vados-cosmonic

- _(std)_ update componentize-js to 0.20.0 by @vados-cosmonic

- _(std)_ lint by @vados-cosmonic

- _(std)_ swap eslint for oxlint by @vados-cosmonic

- _(std)_ remove unused code, some fixups by @vados-cosmonic

- _(std)_ improve apps tests, lint, update workflow by @vados-cosmonic

### 🔒️ Security

- _(std)_ move to pnpm by @vados-cosmonic

## [0.1.3] - 2026-02-14

### 🐛 Bug Fixes

- _(std)_ await the inner async handler promise by @andreiltd in #1264

## [0.1.2] - 2026-02-13

### ⚙️ Miscellaneous Tasks

- _(std)_ lint by @vados-cosmonic

- _(std)_ swap eslint for oxlint by @vados-cosmonic

## [0.1.1] - 2026-02-02

### 🐛 Bug Fixes

- _(std)_ remove incoming request resource disposal by @vados-cosmonic

## [0.1.0] - 2025-11-08

### 🚀 Features

- _(std)_ introduce 0.2.x export by @vados-cosmonic

- _(std)_ add 0.2.x export by @vados-cosmonic

- _(std)_ separate exports for middlewares, refactor server export by @vados-cosmonic

### 🚜 Refactor

- _(std)_ add comments, make folder for middleware, fix exports by @vados-cosmonic

### 🧪 Testing

- _(std)_ remove custom resolver config by @vados-cosmonic in #1125

- _(std)_ update tests to new export format by @vados-cosmonic

- _(std)_ fix node_modules resolution for app fixture tests by @vados-cosmonic

## [0.0.2] - 2025-11-07

### 🚀 Features

- _(std)_ remove star imports, add more docs by @vados-cosmonic in #1117

### 🐛 Bug Fixes

- _(std)_ export paths by @vados-cosmonic

## [0.0.1] - 2025-11-07

### 🚀 Features

- _(std)_ add jco-std along with hono adapter by @vados-cosmonic

### 🐛 Bug Fixes

- _(std)_ release automation for std by @vados-cosmonic in #1112

- _(std)_ lint by @vados-cosmonic in #1107

- _(std)_ request creation code for hono integration by @vados-cosmonic

- _(std)_ working hacked response by @vados-cosmonic in #1093

- _(std)_ use alias for jco-std test by @vados-cosmonic

### 🚜 Refactor

- _(std)_ reuse request/response parsing impls by @vados-cosmonic

- _(std)_ switch to wasi:http as the default method by @vados-cosmonic

### 🧪 Testing

- _(std)_ add retry for e2e app tests by @vados-cosmonic in #1105

- _(std)_ fix up hono tests by @vados-cosmonic

- _(std)_ remove unused config by @vados-cosmonic

### ⚙️ Miscellaneous Tasks

- _(std)_ remove unused code, some fixups by @vados-cosmonic

- _(std)_ improve apps tests, lint, update workflow by @vados-cosmonic
