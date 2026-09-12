# REPL source provenance

The TypeScript port targets **Node v24.20.0**, commit
[`71b8b174857e25106d39b61a9e6f30d927da8b01`](https://github.com/nodejs/node/tree/71b8b174857e25106d39b61a9e6f30d927da8b01),
the same pin as the readline port it extends. The upstream MIT notice is retained
in each ported source file.

| Local file       | Upstream source                                             | Local adaptations                                                                       |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `index.ts`       | `lib/repl.js` (module shape)                                | ESM namespace; deprecated `builtinModules`/`_builtinLibs` accessors on the default only |
| `server.ts`      | `lib/repl.js`                                               | Class over Jco's readline `Interface`; indirect `eval` for `vm`; refusals listed below  |
| `recoverable.ts` | `lib/repl.js`, `lib/internal/repl.js`                       | Own module so the evaluator and the await rewriter share one identity                   |
| `utils.ts`       | `lib/internal/repl/utils.js`, `lib/internal/util/colors.js` | acorn from npm; `process` as an optional global; no inspector preview                   |
| `await.ts`       | `lib/internal/repl/await.js`                                | Types only                                                                              |
| `completion.ts`  | `lib/internal/repl/completion.js`                           | No filesystem listings, inspector scope names, or proxy detection                       |
| `types.ts`       | `@types/node` 24 repl declarations                          | Structural stream types shared with the readline port                                   |

`unenv@2.0.0-rc.24` was inspected at `node/repl`: `start`, `REPLServer`,
`Recoverable` and `writer` are all `notImplemented` stubs. None of it is reused.

## Why acorn

Node's REPL vendors [acorn](https://github.com/acornjs/acorn) and this port depends
on the same versions from npm (`acorn@8.17.0`, `acorn-walk@8.3.5`). Three things need
a parser rather than the engine: deciding whether input is _incomplete_ (show the
`...` prompt) or _wrong_ (print the error), which Node does by subclassing acorn's
tokenizer -- engine `SyntaxError` messages differ between SpiderMonkey and QuickJS
and cannot drive it; rewriting top-level `await` into an async wrapper while
hoisting declarations; and finding the expression to tab-complete. acorn also serves
as the compile step: Node compiles a `vm.Script` to surface syntax errors before
running, and acorn's parse plays that role identically on every engine.

The REPL and VM adapters share the acorn dependencies. A component that imports
neither `node:repl` nor `node:vm` does not include their parsers.

## Runtime differences

- `useGlobal: false` -- Node's default -- is refused with `ERR_JCO_UNSUPPORTED_NODE_API`
  at construction. No component engine can create a second realm for a separate
  context. `useGlobal: true` is exact: evaluation is an indirect `eval`, which is what
  `vm.runInThisContext` is, so `context === globalThis`, `.clear` is an alias for
  `.break`, and `repl.start(...).context.name = value` works as documented.
- `input`/`output` default to `globalThis.process`'s streams when a `process` global
  exists and are required otherwise. `node:process` is never imported.
- `breakEvalOnSigint: true` is refused: there is no signal watchdog. Ctrl+C in a
  terminal still arrives as a keypress and emits `'SIGINT'`.
- `preview` is accepted and has no effect, as in a Node built without an inspector.
- `.save`, `.load`, and a `setupHistory()` file path take Node's own "could not open"
  path and print its message; a component has no filesystem unless the application
  supplies one, and the REPL will not request that capability on every user's behalf.
- Core modules are not auto-loaded into the context: there is no module loader, so
  `fs` is a `ReferenceError` unless the application put it there. `require` on the
  context throws `ERR_JCO_UNSUPPORTED_NODE_API` pointing at static imports;
  `require.resolve` answers as Node does.
- `node:domain` is replaced by a local error sink. Synchronous errors from evaluation
  are reported as `Uncaught ...` exactly as in Node; errors thrown later by
  asynchronous work started from evaluated code are not routed back to the REPL.
- `writer` uses Jco's portable inspector shared with `node:console`. It prints the
  same values as `util.inspect` but never breaks long objects across lines and
  ignores `showProxy`, `showHidden`, `getters` and `sorted`. `writer.options` keeps
  Node's key set.
- Stack traces in `Uncaught` output are the engine's; SyntaxError output is rebuilt
  from name and message rather than stripped with V8's frame pattern.
- The legacy `RegExp.$1`..`$9` statics are saved and restored around evaluation on
  engines that have them (SpiderMonkey) and ignored where they do not exist (QuickJS).
- Deferred work (`close()`, paused-input replay) uses the microtask queue rather than
  Node's `process.nextTick` queue.

Deprecated at the pin: calling `REPLServer()` without `new` (DEP0185, runtime)
throws `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`. `inputStream`/`outputStream`
(DEP0141), `builtinModules` (DEP0191) and `_builtinLibs` (DEP0142) are
documentation-only deprecations and stay functional.
