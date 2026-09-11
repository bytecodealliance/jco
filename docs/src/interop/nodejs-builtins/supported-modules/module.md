# `node:module`

| Imports | Implementation |
| --- | --- |
| `node:module` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/module` |

`node:module` splits cleanly in two, and the split is not about effort.

**There is no module loader in a component.** `jco componentize` bundles the whole graph ahead of
time, and StarlingMonkey cannot compile or link a module that was not present at build time -- no
`dlopen`, no filesystem, no loader to hook. No host capability would fix this: the missing piece is
the guest engine's ability to instantiate new code. So every entry point whose job is to load
something throws `ERR_JCO_UNSUPPORTED_NODE_API` and says why:

`register` · `registerHooks` · `runMain` · `findPackageJSON` · `stripTypeScriptTypes` ·
`setSourceMapsSupport` · `Module.prototype.require` / `load` / `_compile` · and the `_*` loader
internals (`_load`, `_resolveFilename`, `_findPath`, `_nodeModulePaths`, and the rest).

**Everything else is real**, because it is classification or arithmetic:

| Surface                                                                                                                  | Behavior                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `builtinModules`, `isBuiltin`                                                                                            | Node 24's list, verbatim. `isBuiltin` agrees with Node on every builtin in every spelling, including prefix-only ones -- `isBuiltin("node:test")` is true and `isBuiltin("test")` is false |
| `SourceMap`                                                                                                              | Implemented in full: VLQ decoding, `findEntry`, `findOrigin`, `payload`, `lineLengths`                                                                                                     |
| `wrap`, `wrapper`                                                                                                        | Deprecated upstream but pure string work, so they behave as Node's do, including `wrap` reading a mutated `wrapper` live                                                                   |
| `constants`, `findSourceMap`, `getSourceMapsSupport`, `getCompileCacheDir`, `flushCompileCache`, `syncBuiltinESMExports` | Exact, down to Node's null-prototype return objects                                                                                                                                        |
| `globalPaths`                                                                                                            | `[]` -- a true statement, not a refusal: there is no `$HOME/.node_modules` to search                                                                                                       |
| `enableCompileCache`                                                                                                     | Reports `{ status: FAILED, message }`. Node's own protocol for "could not", so callers that branch on `status` keep working instead of catching                                            |
| `new Module(id)`                                                                                                         | Constructs, with Node's own-property shape. Its _methods_ are what need a loader                                                                                                           |

## `createRequire`

`createRequire()` **succeeds**. Code routinely writes `const require = createRequire(import.meta.url)`
at module top level and only calls it on some paths; refusing at creation would break modules that
require nothing.

Calling the returned `require()` refuses and points at static `import`. But `require.resolve` is not
a refusal -- it answers truthfully:

```js
const require = createRequire(import.meta.url);
require.resolve('node:path'); // "node:path", exactly as Node answers
require.resolve('lodash'); // throws MODULE_NOT_FOUND -- which is the truth here
require.cache; // genuinely empty
require.main; // genuinely undefined
```

## A caveat on `builtinModules`

It reports Node's list, not the modules Jco resolves. `isBuiltin` asks "is this a Node builtin?",
which is a classification question, so answering for Node is the faithful thing. A guest that writes
`if (isBuiltin(x)) require(x)` therefore gets a true answer followed by a refusal. The
[supported modules index](./index.md) lists which builtins a component can actually import.
