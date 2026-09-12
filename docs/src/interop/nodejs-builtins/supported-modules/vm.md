# `node:vm`

Jco supports a portable subset of [Node v24.20.0's VM API](https://nodejs.org/download/release/v24.20.0/docs/api/vm.html):
script evaluation and function compilation inside the component. It requires no
additional WIT imports or host provider. Use the `node:vm` import specifier;
bare `vm` imports remain unresolved.

## Execution model and security

Evaluated code shares the component's global scope and capabilities. It can read
and modify `globalThis`, but cannot access the calling function's lexical variables.
Objects and functions returned by evaluated code retain their identity, and
functions can close over local variables created during evaluation.

> [!WARNING]
> `node:vm` is not a security sandbox. Only evaluate code you trust with the
> capabilities available to your application. With passthrough Node adapters,
> those capabilities can include host filesystem access, process execution, or
> even running JavaScript on the host (for example, through the
> [inspector adapter](./inspector.md)). Insecure VM code can use any such APIs you
> expose to it with the host process's authority; guest WASI restrictions do not
> constrain those host-side operations. Native Node VM contexts also do not
> provide a security boundary for untrusted code.

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
`runInThisContext()` combines creation and execution. Creating a Script does not
precompile native bytecode: its source is parsed again when it runs.

Scripts support expressions, control flow, block-local lexical declarations, and
explicit `globalThis` mutations. Use `globalThis` properties for state shared
between runs:

```js
const increment = new Script("globalThis.counter += 1");

globalThis.counter = 0;

increment.runInThisContext(); // 1
increment.runInThisContext(); // 2
```

`compileFunction()` supports ordinary function bodies, including local
declarations, `this`, `arguments`, and returned closures. Parameter names must be
individual identifiers; default parameters, rest parameters, and destructuring
patterns are unsupported.

## Restrictions

The following operations throw `ERR_JCO_UNSUPPORTED_NODE_API`:

- Separate contexts: `createContext()`, `runInContext()`, `runInNewContext()` and
  the corresponding Script methods, including `constants.DONT_CONTEXTIFY` usage.
- Global `var`, `let`, `const`, class, or function declarations in scripts. These
  are rejected before execution, including `var` declarations inside blocks and
  block functions that could introduce global bindings. Use `globalThis`
  properties for shared state, or `compileFunction()` for local declarations.
- Execution limits: `timeout` and `breakOnSigint: true`. There is no VM execution
  watchdog; these options fail before the code runs.
- Nonzero `lineOffset` or `columnOffset`, cached data, `parsingContext`, and
  nonempty `contextExtensions`.
- Dynamic `import()` syntax and `importModuleDynamically` options. Evaluated code
  has no built-in Node module loader, including through
  `constants.USE_MAIN_CONTEXT_DEFAULT_LOADER`.
- `Script.createCachedData()` and `measureMemory()`. Memory measurement throws
  synchronously, rather than returning a promise.
- All `Module`, `SourceTextModule`, and `SyntheticModule` operations. These
  experimental classes are exported, but their constructors, methods, and
  getters throw immediately without inspecting arguments or invoking callbacks.

`isContext()` validates its input and returns `false`; separate contexts cannot
be created. The `constants` namespace is frozen, and its symbols do not enable
otherwise unsupported operations.

Script's deprecated `produceCachedData` option throws
`ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API` whenever present, including explicit
`false` or `undefined`, before converting the source or reading option getters.
For `compileFunction()`, `produceCachedData` is not deprecated: `false` is accepted
and `true` throws `ERR_JCO_UNSUPPORTED_NODE_API`.

## Source metadata and diagnostics

`Script.sourceURL` and `Script.sourceMapURL` expose metadata from source line
comments. The `filename` option labels the source in diagnostics; line terminators
are removed from that label.

Syntax-error messages and stack traces may differ from Node's, and
engine-specific syntax extensions are unsupported. `displayErrors` is validated
but does not control V8-style source excerpts. Function stringification may also
differ from Node's output.
