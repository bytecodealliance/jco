# Changelog

## [0.5.0] - 2026-09-23

### 🐛 Bug Fixes

- _(std)_ support Windows VFS host paths by @vados-cosmonic in #2146

### ⚙️ Miscellaneous Tasks

- _(std)_ update preview2-shim to v0.26.0 by @vados-cosmonic in #2148

## [0.4.0] - 2026-09-14

### 🚀 Features

- _(std)_ add V8 API with explicit Node host capability by @vados-cosmonic

- _(std)_ add configurable VFS storage via WASI filesystem by @vados-cosmonic

- _(std)_ port Node VFS core with memory and injected filesystem providers by @vados-cosmonic

- _(std)_ add the node:wasi shim by @vados-cosmonic

- _(std)_ add the jco:node/http-callbacks host binding by @vados-cosmonic

- _(std)_ honor Error.prepareStackTrace in captureStackTrace by @vados-cosmonic

- _(std)_ implement node:crypto by @vados-cosmonic

- _(std)_ implement portable Node VM execution by @vados-cosmonic

- _(std)_ add host-backed Node zlib API by @vados-cosmonic

- _(std)_ implement worker lifecycle and Node host provider by @vados-cosmonic

- _(std)_ add worker thread contracts and message transport by @vados-cosmonic

- _(std)_ implement Node trace events with explicit host providers by @vados-cosmonic

- _(std)_ implement portable Node util APIs by @vados-cosmonic

- _(std)_ expose UDP adapters and Node host provider by @vados-cosmonic

- _(std)_ implement UDP socket lifecycle and send overloads by @vados-cosmonic

- _(std)_ define UDP socket contracts and errors by @vados-cosmonic

- _(std)_ support buffered HTTP/2 response trailers by @vados-cosmonic

- _(std)_ route Node TLS and HTTP through shared capability by @vados-cosmonic

- _(std)_ add native TLS provider and WASI bridge by @vados-cosmonic

- _(std)_ implement portable Node TLS facade by @vados-cosmonic

- _(std)_ define Node TLS capability contract by @vados-cosmonic

- _(std)_ implement Node URL compatibility APIs by @vados-cosmonic

- _(std)_ add portable Node test runner and reporters by @vados-cosmonic

- _(std)_ add the node:tty shim by @vados-cosmonic

- _(std)_ add the node:repl shim by @vados-cosmonic

- _(std)_ expose callback and promise readline APIs by @vados-cosmonic

- _(std)_ implement readline interfaces and line iteration by @vados-cosmonic

- _(std)_ add readline terminal utilities and stream contracts by @vados-cosmonic

- _(std)_ implement Node SQLite over a typed host capability by @vados-cosmonic

- _(std)_ expose the opt-in Node process provider by @vados-cosmonic

- _(std)_ implement the lazy process guest facade by @vados-cosmonic

- _(std)_ define process capability and denial provider by @vados-cosmonic

- _(std)_ implement portable Node perf_hooks by @vados-cosmonic

- _(std)_ add portable classic Node stream support by @vados-cosmonic

- _(std)_ expose node:net servers and module exports by @vados-cosmonic

- _(std)_ add WASI-backed node:net sockets by @vados-cosmonic

- _(std)_ add node:net address utilities and option types by @vados-cosmonic

- _(std)_ support HTTPS over wasi:tls by @vados-cosmonic

- _(std)_ add the node:https shim by @vados-cosmonic

### 🐛 Bug Fixes

- _(std)_ report unsupported V8 CPU profiling on older hosts by @vados-cosmonic

- _(std)_ compare VFS host paths against the canonical root by @vados-cosmonic

- _(std)_ omit removed recursive option from Node rmdir by @vados-cosmonic

- _(std)_ return catchable filesystem capability denials by @vados-cosmonic

- _(std)_ expose readable state for buffered HTTP requests by @vados-cosmonic

- _(std)_ make the direct node:http server boundary work by @vados-cosmonic

- _(std)_ preserve headers in WASI HTTP responses by @vados-cosmonic

- _(std)_ share the console inspector and print empty containers like Node by @vados-cosmonic

- _(std)_ align process providers with generated bindings by @vados-cosmonic

- _(std)_ align perf_hooks errors and buffering with Node 24 by @vados-cosmonic

- _(std)_ lint README by @vados-cosmonic in #2094

- _(std)_ consume Web streams through public readers by @vados-cosmonic

- _(std)_ retain narrowed socket methods during bind polling by @vados-cosmonic

- _(std)_ defer TLS worker integration until shim export is published by @vados-cosmonic

- _(std)_ reject non-object node:http server options by @vados-cosmonic

- _(std)_ give agent: false requests a fresh node:http agent by @vados-cosmonic

- _(std)_ match Node 24 in the node:http agent by @vados-cosmonic

### 🚜 Refactor

- _(std)_ share structured value transport with V8 by @vados-cosmonic

- _(std)_ extract VFS memory file handles and remove section banners by @vados-cosmonic in #2114

- _(std)_ split util inspection and formatting into helpers by @vados-cosmonic

- _(std)_ consolidate shared Node argument validators by @vados-cosmonic

- _(std)_ share console formatting with util by @vados-cosmonic

- _(std)_ inline process source attribution by @vados-cosmonic

- _(std)_ simplify perf_hooks receiver checks and helpers by @vados-cosmonic

- _(std)_ share WASI TCP transport across HTTP implementations by @vados-cosmonic

- _(std)_ own the opt-in Node TLS provider by @vados-cosmonic

- _(std)_ pass socket streams directly to TLS by @vados-cosmonic

- _(std)_ align the local TLS contract with WASI IO 0.2.12 by @vados-cosmonic

- _(std)_ group TLS under the sockets implementation by @vados-cosmonic

### 🎨 Styling

- _(std)_ separate zlib test setup and cases by @vados-cosmonic

- _(std)_ space out zlib definitions and WIT contracts by @vados-cosmonic

- _(std)_ separate UDP declarations and methods by @vados-cosmonic

- _(std)_ separate readline test declarations by @vados-cosmonic

- _(std)_ space readline function and type declarations by @vados-cosmonic

- _(std)_ separate SQLite WIT declarations by @vados-cosmonic

- _(std)_ space SQLite function and type declarations by @vados-cosmonic

- _(std)_ space process facade definitions by @vados-cosmonic

- _(std)_ space Node process provider definitions by @vados-cosmonic

- _(std)_ format rebased sockets error imports by @vados-cosmonic

### 🧪 Testing

- _(std)_ exercise V8 profiling across host versions by @vados-cosmonic

- _(std)_ verify V8 APIs against native Node by @vados-cosmonic

- _(std)_ cover shared structured value transport by @vados-cosmonic

- _(std)_ cover VFS conformance and filesystem providers by @vados-cosmonic

- _(std)_ add node:wasi unit and provider tests by @vados-cosmonic

- _(std)_ run independent crypto and timer cases concurrently by @vados-cosmonic

- _(std)_ cover the new Node builtin implementations by @vados-cosmonic

- _(std)_ cover VM contracts and explicit engine limits by @vados-cosmonic

- _(std)_ cover Node zlib codecs and provider behavior by @vados-cosmonic

- _(std)_ cover worker lifecycle and structured messages by @vados-cosmonic

- _(std)_ consolidate util type predicates into one suite by @vados-cosmonic in #2101

- _(std)_ preserve shared validator contracts by @vados-cosmonic

- _(std)_ cover Node util APIs and type predicates by @vados-cosmonic

- _(std)_ cover UDP conformance and socket lifecycle by @vados-cosmonic

- _(std)_ cover Node URL API conformance by @vados-cosmonic

- _(std)_ cover Node test runner conformance and mocking by @vados-cosmonic

- _(std)_ add node:tty unit and pty tests by @vados-cosmonic

- _(std)_ add node:repl unit tests by @vados-cosmonic

- _(std)_ cover readline conformance and stream lifecycles by @vados-cosmonic

- _(std)_ cover SQLite conformance and host authority concurrently by @vados-cosmonic

- _(std)_ cover process conformance and capability denial by @vados-cosmonic

- _(std)_ pin perf_hooks validation and runtime edges against Node by @vados-cosmonic in #2090

- _(std)_ group perf_hooks tests by module by @vados-cosmonic

- _(std)_ cover Node perf_hooks conformance by @vados-cosmonic

- _(std)_ cover classic streams and Web reader interop by @vados-cosmonic

- _(std)_ cover shared socket allocation failure cleanup by @vados-cosmonic

- _(std)_ cover node:net conformance and socket lifecycles by @vados-cosmonic

- _(std)_ use the shared transport in HTTP socket tests by @vados-cosmonic

- _(std)_ bind HTTPS hosts to callback factories by @vados-cosmonic

- _(std)_ port TLS lifecycle coverage and fixtures by @vados-cosmonic

- _(std)_ exercise TLS without stream version adaptation by @vados-cosmonic

- _(std)_ update imports for sockets implementation folder by @vados-cosmonic

- _(std)_ cover TLS capability and handshake semantics by @vados-cosmonic

- _(std)_ add node:https unit tests by @vados-cosmonic

### ⚙️ Miscellaneous Tasks

- _(std)_ update preview2-shim to v0.25.0 by @vados-cosmonic in #2123

- _(std)_ remove duplicate UDP license file by @vados-cosmonic

- _(std)_ remove duplicate text decoder license file by @vados-cosmonic in #2103

- _(std)_ consolidate Node stream license notice by @vados-cosmonic

- _(std)_ omit unused wit-deps metadata from TLS WIT by @vados-cosmonic

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
