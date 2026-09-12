# `node:vm`

| Imports | Implementation |
| --- | --- |
| `node:vm` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/vm` |

Jco supports a portable subset of [Node v24.20.0's VM API](https://nodejs.org/download/release/v24.20.0/docs/api/vm.html):
same-context script evaluation and function compilation inside the component.
It requires no additional WIT imports or host provider. Bare `vm` imports remain
unresolved; use the ordinary `node:vm` specifier.

## Scripts and functions

```js
import { Script, compileFunction } from "node:vm";

export function run() {
  const expression = new Script("6 * 7", "answer.js");
  const add = compileFunction("return left + right", ["left", "right"]);

  return expression.runInThisContext() + add(2, 3);
}
```

For an application world exporting `run: func() -> u32`, build this source with:

```console
jco componentize app.js --bundle --wit wit -o app.wasm
```

`new Script()` and `createScript()` check syntax without executing the source.
Scripts can run repeatedly through `script.runInThisContext()`; the top-level
`runInThisContext()` combines creation and execution. Expressions, control flow,
block-local declarations, functions and objects work in the guest's global scope.
Use `globalThis` properties for state shared between runs. Returned objects and
functions retain their guest identity.

`compileFunction()` supports function bodies with local declarations and individual
identifier parameter names. Its functions use guest globals, not the calling
function's lexical variables. `Script.sourceURL` and `Script.sourceMapURL` expose
metadata from source comments.

## Engine limits

The component engines do not expose separate realms, V8 bytecode caches, VM module
records or a synchronous execution watchdog. The following operations throw
`ERR_JCO_UNSUPPORTED_NODE_API`:

- `createContext()`, `runInContext()`, `runInNewContext()` and the corresponding
  Script methods, including `DONT_CONTEXTIFY` usage.
- Global variable, function, class and lexical declarations in scripts. Indirect
  eval cannot reproduce their native VM persistence and property semantics.
  Block-local lexical declarations and function-local declarations are supported.
- `timeout`, `breakOnSigint: true`, nonzero `lineOffset`/`columnOffset`, cached data,
  `parsingContext`, nonempty `contextExtensions`, and dynamic import syntax/options.
- `Script.createCachedData()`, `measureMemory()` and all experimental `Module`,
  `SourceTextModule` and `SyntheticModule` operations. These classes remain exported
  for module-shape compatibility and throw immediately when constructed or used.

`isContext()` validates its input and returns false; the implementation cannot
create native contexts. The frozen `constants` namespace preserves both Node
symbols without granting a realm or loader.

Script syntax checks use the existing acorn dependency; the guest engine still
parses the source when it runs. Error text and stack traces reflect that engine.
Filenames are sourceURL annotations, and `displayErrors` cannot control V8-style
source excerpts. This API shares the guest global scope and is not a sandbox.

The deprecated Script `produceCachedData` option throws
`ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API` before touching the source or option
getters. `compileFunction`'s same-named option is not deprecated: `false` works and
`true` throws the ordinary unsupported error.

## Implementation source

Public orchestration and types are adapted from the pinned Node implementation
and matching Node 24 declarations, with shared jco-std validators and errors.
The audited unenv VM provides inert scripts, placeholder contexts and fabricated
memory measurements, so it is not used. The parser dependencies are shared with
the existing REPL implementation.

Applications should retain `node:vm` imports and let Jco choose the adapter.
Direct jco-std imports can coexist with native Node modules in host applications;
they retain these guest restrictions and do not turn into Node's native VM.
