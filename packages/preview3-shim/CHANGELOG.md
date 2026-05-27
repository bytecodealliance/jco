# Changelog

## [0.1.0] - 2026-05-27

### 🚀 Features

- _(p3-shim)_ bump latest wasi rc to 2026-03-15 by @andreiltd in #1446

- _(p3-shim)_ back StreamReader with async iterator by @andreiltd in #1382

- _(p3-shim)_ sync with latest 0.3.0 draft by @andreiltd in #1268

- _(p3-shim)_ generate types for preview3-shim package (#755) by @andreiltd in #755

- _(p3-shim)_ implement wasi preview3 http API (#733) by @andreiltd in #733

- _(p3-shim)_ close socket's server explicitly on symbol dispose (#748) by @andreiltd in #748

- _(p3-shim)_ implement wasi preview3 sockets API (#735) by @andreiltd in #735

- _(p3-shim)_ implement wasi preview3 cli API (#731) by @andreiltd in #731

- _(p3-shim)_ implement wasi preview3 random API (#734) by @andreiltd in #734

- _(p3-shim)_ implement wasi preview3 nodejs clocks API (#732) by @andreiltd in #732

- _(p3-shim)_ implement wasi preview3 nodejs filesystem API (#724) by @andreiltd in #724

### 🐛 Bug Fixes

- _(p3-shim)_ resume socket on the stream write fail by @andreiltd in #1563

- _(p3-shim)_ serialize errors from worker by @andreiltd in #1562

- _(p3-shim)_ enforce outbound request content length by @andreiltd in #1560

- _(p3-shim)_ make tcp send/recv streams survive parent socket disposal by @andreiltd in #1548

- _(p3-shim)_ drop unconsumed body streams by @andreiltd in #1519

- _(p3-shim)_ lint:fix target by @vados-cosmonic

- _(p3-shim)_ complete http transmit futures from worker by @andreiltd in #1504

- _(p3-shim)_ address code review by @andreiltd in #1484

- _(p3-shim)_ align socket behavior with WASI tests by @andreiltd

- _(p3-shim)_ handle filesystem stream edge cases by @andreiltd in #1483

- _(p3-shim)_ cache text encoder for byte stream by @andreiltd in #1441

- _(p3-shim)_ export types namespace by @andreiltd in #1442

- _(p3-shim)_ address code review by @andreiltd in #1435

- _(p3-shim)_ adapt shim to newest bindings by @andreiltd

- _(p3-shim)_ destroy request on timeout by @andreiltd in #1267

- _(p3-shim)_ flaky http client test server creation by @vados-cosmonic

- _(p3-shim)_ avoid flakiness in http test (#761) by @vados-cosmonic in #761

- _(p3-shim)_ relax timestamp test asserts (#751) by @andreiltd in #751

- _(p3-shim)_ remove UUID from udp worker (#746) by @andreiltd in #746

- _(p3-shim)_ avoid side effects when loading filesystem API (#738) by @andreiltd in #738

### 🚜 Refactor

- _(p3-shim)_ break apart http tests by @vados-cosmonic in #1100

### ⚙️ Miscellaneous Tasks

- _(p3-shim)_ add CHANGELOG.md by @vados-cosmonic in #1553

- _(p3-shim)_ downgrade to 0.0.1 before first release by @vados-cosmonic in #1551

- _(p3-shim)_ update git cliff config by @vados-cosmonic

- _(p3-shim)_ oxfmt by @vados-cosmonic

- _(p3-shim)_ swap eslint for oxlint by @vados-cosmonic

- _(p3-shim)_ update package.json by @vados-cosmonic in #1108

- _(p3-shim)_ require vite ^7.1.5 by @vados-cosmonic in #1097

- _(p3-shim)_ eslint fix by @vados-cosmonic in #993

- _(p3-shim)_ update preview2-shim to v0.17.3 by @vados-cosmonic in #966

- _(p3-shim)_ add release automation, docs for p3-shim (#740) by @vados-cosmonic in #740

### 🔒️ Security

- _(p3-shim)_ move to pnpm by @vados-cosmonic

## [0.1.0-rc.0] - 2026-05-26

### 🚀 Features

- _(p3-shim)_ bump latest wasi rc to 2026-03-15 by @andreiltd in #1446

- _(p3-shim)_ back StreamReader with async iterator by @andreiltd in #1382

- _(p3-shim)_ sync with latest 0.3.0 draft by @andreiltd in #1268

- _(p3-shim)_ generate types for preview3-shim package (#755) by @andreiltd in #755

- _(p3-shim)_ implement wasi preview3 http API (#733) by @andreiltd in #733

- _(p3-shim)_ close socket's server explicitly on symbol dispose (#748) by @andreiltd in #748

- _(p3-shim)_ implement wasi preview3 sockets API (#735) by @andreiltd in #735

- _(p3-shim)_ implement wasi preview3 cli API (#731) by @andreiltd in #731

- _(p3-shim)_ implement wasi preview3 random API (#734) by @andreiltd in #734

- _(p3-shim)_ implement wasi preview3 nodejs clocks API (#732) by @andreiltd in #732

- _(p3-shim)_ implement wasi preview3 nodejs filesystem API (#724) by @andreiltd in #724

### 🐛 Bug Fixes

- _(p3-shim)_ drop unconsumed body streams by @andreiltd in #1519

- _(p3-shim)_ lint:fix target by @vados-cosmonic

- _(p3-shim)_ complete http transmit futures from worker by @andreiltd in #1504

- _(p3-shim)_ address code review by @andreiltd in #1484

- _(p3-shim)_ align socket behavior with WASI tests by @andreiltd

- _(p3-shim)_ handle filesystem stream edge cases by @andreiltd in #1483

- _(p3-shim)_ cache text encoder for byte stream by @andreiltd in #1441

- _(p3-shim)_ export types namespace by @andreiltd in #1442

- _(p3-shim)_ address code review by @andreiltd in #1435

- _(p3-shim)_ adapt shim to newest bindings by @andreiltd

- _(p3-shim)_ destroy request on timeout by @andreiltd in #1267

- _(p3-shim)_ flaky http client test server creation by @vados-cosmonic

- _(p3-shim)_ avoid flakiness in http test (#761) by @vados-cosmonic in #761

- _(p3-shim)_ relax timestamp test asserts (#751) by @andreiltd in #751

- _(p3-shim)_ remove UUID from udp worker (#746) by @andreiltd in #746

- _(p3-shim)_ avoid side effects when loading filesystem API (#738) by @andreiltd in #738

### 🚜 Refactor

- _(p3-shim)_ break apart http tests by @vados-cosmonic in #1100

### ⚙️ Miscellaneous Tasks

- _(p3-shim)_ add CHANGELOG.md by @vados-cosmonic in #1553

- _(p3-shim)_ downgrade to 0.0.1 before first release by @vados-cosmonic in #1551

- _(p3-shim)_ update git cliff config by @vados-cosmonic

- _(p3-shim)_ oxfmt by @vados-cosmonic

- _(p3-shim)_ swap eslint for oxlint by @vados-cosmonic

- _(p3-shim)_ update package.json by @vados-cosmonic in #1108

- _(p3-shim)_ require vite ^7.1.5 by @vados-cosmonic in #1097

- _(p3-shim)_ eslint fix by @vados-cosmonic in #993

- _(p3-shim)_ update preview2-shim to v0.17.3 by @vados-cosmonic in #966

- _(p3-shim)_ add release automation, docs for p3-shim (#740) by @vados-cosmonic in #740

### 🔒️ Security

- _(p3-shim)_ move to pnpm by @vados-cosmonic
