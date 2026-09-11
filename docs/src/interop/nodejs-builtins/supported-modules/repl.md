# `node:repl`

| Imports | Implementation |
| --- | --- |
| `node:repl` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/repl` |

`node:repl` ports [Node v24.20.0's REPL](https://github.com/nodejs/node/blob/v24.20.0/lib/repl.js)
on top of the readline port: `repl.start()`, `REPLServer`, the `.break`, `.clear`,
`.exit`, `.help`, `.editor` keywords and `defineCommand()`, tab completion,
in-memory history and reverse search, top-level `await`, recoverable multi-line
input, `_` and `_error`, and the `'exit'` and `'reset'` events. The pinned unenv
repl module is stubs and is not used.

Applications keep the ordinary import and supply the streams:

```js
import repl from "node:repl";

export function attach(input, output) {
  const server = repl.start({ prompt: "app> ", input, output, useGlobal: true });
  server.context.app = { version: "1.0.0" };
  server.on("exit", () => output.write("bye\n"));
  return server;
}
```

Bundle with `jco componentize app.js --bundle --wit wit -o app.wasm`. The REPL
requires no WIT imports; `input` and `output` decide where the session goes.
Without a `process` global they are required, since there is no stdin or stdout
to fall back to.

## Global scope only

Node's default `useGlobal: false` runs each line in a separate `vm` context, a
second realm with its own globals. No component engine can create one, so that
option -- given explicitly or omitted -- is refused at construction with
`ERR_JCO_UNSUPPORTED_NODE_API`. With `useGlobal: true` evaluation is an indirect
`eval`, which is exactly `vm.runInThisContext`: `replServer.context` is
`globalThis`, `.clear` is an alias for `.break`, and assigning to the context
exposes values as documented. Node's script scope keeps top-level `let`, `const`
and `class` bindings across lines; an `eval` does not, so the REPL rewrites those
declarations to persist them. The trade is that `const` is not enforced between
lines and a later redeclaration is accepted -- the same trade Node documents for
lines containing `await`. `REPL_MODE_STRICT` is refused for the same reason: a
strict-mode eval cannot bind declarations in the global scope at all.

## Why acorn

Node's REPL vendors [acorn](https://github.com/acornjs/acorn); this port depends
on the same versions from npm (`acorn@8.17.0`, `acorn-walk@8.3.5`). A parser is
needed for what the engine cannot answer: whether a line is *incomplete* (show the
`...` prompt) or *wrong* (print the error) -- engine `SyntaxError` messages differ
between SpiderMonkey and QuickJS and cannot drive that decision -- rewriting
top-level `await` into an async wrapper, and locating the expression to
tab-complete. acorn also serves as the compile step Node performs with
`vm.Script`, so syntax errors read the same on every engine. It is bundled only
when `node:repl` is imported; a component without the REPL does not carry it.
Bundle size grows by roughly 1.2 MB (QuickJS) to 1.4 MB (StarlingMonkey).

## Boundaries

| Surface                                       | Behavior                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useGlobal: false` or omitted, `REPL_MODE_STRICT`, `breakEvalOnSigint` | Refused at construction with `ERR_JCO_UNSUPPORTED_NODE_API`. Ctrl+C still arrives as a keypress and emits `'SIGINT'`.                                        |
| `REPLServer()` without `new` (DEP0185)        | Throws `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API` before reading any argument.                                                                                            |
| `preview`                                     | Accepted and ignored, as in a Node built without an inspector.                                                                                                            |
| `.save`, `.load`, `setupHistory(filePath)`    | Print Node's own failure text (`Failed to save: …`, `Could not open history file`) and continue; a component has no filesystem unless the application supplies one.       |
| Core modules in the context                   | Not auto-loaded: `fs` is a `ReferenceError` unless the application put it on the context. `require` throws `ERR_JCO_UNSUPPORTED_NODE_API`; `require.resolve` answers as Node does. |
| Errors                                        | Synchronous errors print as `Uncaught …` with the evaluated frames only; errors thrown later by asynchronous work are not routed back, since there is no `node:domain`.   |
| `writer`                                      | Jco's portable inspector shared with `node:console`: the same values as `util.inspect`, without line breaking, `showProxy`, `showHidden`, `getters` or `sorted`.          |
