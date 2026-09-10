# Readline runtime behavior

Node primordials become ordinary ECMAScript intrinsics. `node:events` resolves
through Jco's existing audited adapter, preserving EventEmitter identity.
String decoding uses the existing Jco StringDecoder and Buffer implementation.
Internal errors use Jco's shared error helpers. No native bindings, REPL filesystem
imports, `node:process`, or unrelated WASI capabilities are required.

Runtime differences:

- Escape-key timeouts require engine timers. Without them, timed Escape
  disambiguation throws `ERR_JCO_UNSUPPORTED_NODE_API`. QuickJS callers supply
  their own signals when AbortController is absent.
- Streams are supplied by the caller. Importing readline grants no host I/O access,
  and `node:process` cannot supply them: inside a component its `stdin`, `stdout`
  and `stderr` throw `ERR_JCO_UNSUPPORTED_NODE_API`.
- Deferred callbacks and auto-commit use the engine's microtask queue, not Node's
  separate `process.nextTick` queue. Their ordering relative to unrelated promises
  can differ. `node:process` does provide `nextTick`, but importing it would add
  the `jco:node/process` capability to every readline user.
- Terminal mode uses ANSI sequences. Readline does not read `TERM`; applications can
  consult `process.env.TERM` via `node:process` and pass `terminal` explicitly.
  `setRawMode`, resize events, and columns are supplied by the caller's streams.
- Ctrl+Z emits `SIGTSTP` when handled; otherwise it throws
  `ERR_JCO_UNSUPPORTED_NODE_API`. Node's `process.kill(process.pid, 'SIGTSTP')` and
  `SIGCONT` listener are not ported: the `node:process` facade refuses signal
  listeners, and a component cannot suspend its host.
- Display width uses Node's non-ICU fallback. Engines without `String.normalize`
  use the original string. Some Unicode widths differ from ICU-enabled Node.
- Completion-error diagnostics use portable string formatting rather than V8's
  `util.inspect` formatting. Error codes and input validation remain independent.

No public APIs in the pinned readline documentation are deprecated. Historical
underscore hooks are retained for callback-interface compatibility.
