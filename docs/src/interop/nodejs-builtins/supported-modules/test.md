# `node:test`

| Imports | Implementation |
| --- | --- |
| `node:test`, `node:test/reporters` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/test` and `/test/reporters` |

`node:test` and `node:test/reporters` target
[Node.js 24.20.0](https://nodejs.org/download/release/v24.20.0/docs/api/test.html).
Application code keeps its ordinary imports:

```js
import test from "node:test";
import assert from "node:assert/strict";

await test("addition", async (t) => {
  t.plan(2);
  t.assert.strictEqual(2 + 3, 5);
  await t.test("nested", () => {
    assert.deepStrictEqual([1, 2], [1, 2]);
  });
});

export function run() { return "tests completed"; }
```

Bundle against a world exporting `run: func() -> string` with
`jco componentize app.js --bundle --wit wit -o app.wasm`. Top-level tests run when
the engine evaluates the module, which may happen during component initialization
at build time. Tests return promises that resolve even on failure, as in Node.
Failures appear in TAP output; `t.passed` and `t.error` are available in cleanup
hooks for applications that need to expose a result through WIT. The runner does
not set the host process's exit code. A returned "tests completed" string alone
is not evidence that assertions passed.

Tests execute serially. Synchronous, promise and callback test bodies, nested
tests, synchronous suite declarations, `describe`/`it` aliases, hooks,
skip/TODO/expected-failure directives, assertion plans, tags, and `waitFor` are
supported. `only`/`runOnly` emit Node's diagnostic outside test-only mode; Jco has
no Node test-runner CLI mode. Global teardown runs when the registered queue drains,
so suites are the preferred scope for setup and teardown across related tests.

## Reuse and engine requirements

The test adapter reuses jco-std's assertion implementation, error codes, inspection,
path implementation, stream transforms, promise detection, Abort compatibility,
and signal validation. Assertion behavior and error identities therefore agree
with `node:assert` in the same bundle. Function, method, getter, setter and property
mocks retain the portable proxy and restoration algorithms from Node. There are
no new dependencies.
The port records provenance against Node commit
`71b8b174857e25106d39b61a9e6f30d927da8b01` and retains its MIT notice.

The runner requires engine `AbortController`; StarlingMonkey provides it.
The pinned QuickJS backend does not, so starting a test or suite throws
`ERR_JCO_UNSUPPORTED_NODE_API`. Importing the module, standalone mocking and
reporting still work there. Timeouts, delayed plans and `waitFor` additionally use
the engine's timer functions.

`getTestContext()` tracks synchronous callbacks. Component engines cannot propagate
implicit test context through `await`; use the explicit `t.test()` and `t` hook
methods after asynchronous boundaries. A global test/hook registration while an
async body is pending throws with that guidance. Async suite declarations and
`concurrency: true` or numbers greater than one are unsupported. File paths and
worker IDs are undefined; attempts are zero. The adapter does not intercept
unhandled rejections, uncaught exceptions, process signals, or test tracing events.

## Mocks, snapshots and reporters

Each test owns a mock tracker that resets after cleanup hooks. Standalone `mock`
has explicit `reset` and `restoreAll` methods. Mock calls retain arguments,
receivers, results, errors and constructor targets. Property mocks retain access
history and one-use replacements. Symbol methods restore correctly, fixing the
pinned upstream implementation's string-only restoration check.

`run()` (file discovery, watch mode, isolation and coverage), module loader mocks,
native timer mocking, and snapshot APIs throw `ERR_JCO_UNSUPPORTED_NODE_API`
without invoking supplied callbacks or reading their options. The deprecated
array form of `mock.timers.enable()` throws
`ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`. These APIs cannot be implemented by
passing guest closures through a host capability.

`dot`, `tap` and `junit` consume event iterables. `spec` and `lcov` are callable
and constructible jco-std stream transforms. Reports use no ANSI colors or host
terminal discovery; dot wraps at 20 columns and JUnit leaves hostname empty.
TAP error details and human-readable coverage tables use portable formatting and
omit engine stack frames. LCOV can format supplied coverage events even though
the component runner cannot collect V8 coverage. Importing reporters requires no
filesystem or process provider.
