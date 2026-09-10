# Readline source provenance

The TypeScript port targets **Node v24.20.0**, commit
[`71b8b174857e25106d39b61a9e6f30d927da8b01`](https://github.com/nodejs/node/tree/71b8b174857e25106d39b61a9e6f30d927da8b01).
The upstream MIT notice is retained in each ported source file.

| Local file     | Upstream source                                               | Local adaptations                                                              |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `index.ts`     | `lib/readline.js`                                             | Typed callable constructor, shared symbol hooks; ESM namespace                 |
| `promises.ts`  | `lib/readline/promises.js`                                    | ESM, types, shared abort errors                                                |
| `interface.ts` | `lib/internal/readline/interface.js`                          | Typed class initialization; supplied streams; job-control error                |
| `history.ts`   | `lib/internal/repl/history.js`                                | In-memory history only; REPL file persistence is not a public readline feature |
| `utils.ts`     | `lib/internal/readline/utils.js`                              | Key generator, CSI, character lengths, prefix and history algorithms           |
| `keypress.ts`  | `lib/internal/readline/emitKeypressEvents.js`                 | Private stream state lives in a WeakMap                                        |
| `callbacks.ts` | `lib/internal/readline/callbacks.js`                          | Portable callback scheduling                                                   |
| `actions.ts`   | `lib/internal/readline/promises.js`                           | Portable scheduling; structural writable-stream validation                     |
| `display.ts`   | `lib/internal/util/inspect.js`                                | Node's non-ICU width tables; optional normalization                            |
| `compat.ts`    | `lib/internal/validators.js`, `lib/internal/streams/utils.js` | Narrow validators and writable-state predicates; shared Jco errors             |
| `iterator.ts`  | Public async-iteration contract                               | Local event queue, 1024-line backpressure, cleanup and close on return         |
| `types.ts`     | `@types/node` 24 readline declarations                        | Self-contained structural stream and callback types                            |

`unenv@2.0.0-rc.24` was inspected at `node/readline`, `node/readline/promises`,
and their `internal/readline` modules. Its interfaces ignore streams, questions
return empty strings, cursor functions return false, and action methods are no-ops.
None of that readline implementation is reused or admitted to Jco's alias list.

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
