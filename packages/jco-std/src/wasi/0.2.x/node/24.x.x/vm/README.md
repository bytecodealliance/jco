# VM implementation and provenance

Compatibility target: Node **v24.20.0**, commit
[`71b8b174857e25106d39b61a9e6f30d927da8b01`](https://github.com/nodejs/node/tree/71b8b174857e25106d39b61a9e6f30d927da8b01).
This matches the neighboring REPL and utility implementations. The rolling Node
documentation describes Node 26; the source and documentation at this pin decide
the supported shape. Experimental module classes are always exported here;
Node exposes them only with `--experimental-vm-modules`.

| Local source                                                                                | Upstream source / dependency                                | Adaptation                                                                                          |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `script.ts`, `options.ts`, `compile-function.ts`, `contexts.ts`, `constants.ts`, `index.ts` | Node `lib/vm.js`                                            | Typed ESM orchestration and shared error/validation helpers; native-only behavior fails explicitly. |
| `modules.ts`                                                                                | Node `lib/internal/vm/module.js`                            | Public class hierarchy and entry points; module operations fail before touching inputs.             |
| `types.ts`                                                                                  | DefinitelyTyped `@types/node@24.13.3/vm.d.ts` (MIT)         | Self-contained public signatures; arbitrary JS results and arguments use `unknown`.                 |
| `source.ts`                                                                                 | Existing `acorn@8.17.0` and `acorn-walk@8.3.5` dependencies | Jco-owned Script parsing, metadata collection and checks for unsupported semantics.                 |

Node's MIT notice is retained in the adapted files and the package LICENSE.
The compile-function tests include cases adapted from Node's
`test/parallel/test-vm-basic.js`; the remaining tests are locally authored.

## Source selection

The pinned `unenv@2.0.0-rc.24` module imports its internal Script, constants and
failure helpers. Its Script ignores the source, cannot execute it, and cannot
produce caches. `createContext` ignores its argument and returns a tagged object;
`measureMemory` fabricates a measurement. That implementation is not reused.

Node's real implementation depends on `internalBinding('contextify')`, V8 script
and function compilation, native context branding, VM symbols, ESM module records,
dynamic loader registration, heap accounting and SIGINT interception. The existing
Jco REPL already establishes that neither component engine exposes a second-realm
primitive. A host VM reached through serialized values would not preserve guest
object identity, functions, closures or global state, so this API adds no host
provider or WIT capability.

The portable portion uses the same evaluation approach as the REPL: the captured
indirect `eval` intrinsic for scripts, and the guest Function constructor for
functions. Only callers importing `node:vm` bundle its parser. Existing validators
and coded errors are reused directly, without pulling in another Node builtin.

## Supported execution

`Script` and `createScript` parse source immediately without evaluating it, retain
it for later runs, and expose `sourceURL` and `sourceMapURL` from line comments.
`runInThisContext` evaluates expressions, control flow, block-local declarations,
and explicit `globalThis` mutations. Completion values can be objects or functions:
no JSON serialization or host boundary changes their identity. `compileFunction`
supports ordinary function bodies and individual identifier parameter names,
including local declarations, `this`, arguments and returned closures.

This is not native precompilation: the engine parses retained Script source again
when evaluating it. Acorn supplies early syntax checks; engine-specific extensions
are not part of the accepted syntax. Stack frames and syntax-error messages use
the parser/engine's presentation. The filename is a sourceURL annotation, with
line terminators removed. `displayErrors` is validated but cannot control V8-style
source excerpts. Function stringification reflects the guest Function constructor.
Script does not inherit the private V8 `ContextifyScript` prototype.

## Explicit restrictions

- Separate contexts and their execution functions fail immediately. `isContext`
  validates its argument and returns false; it never brands plain objects as realms.
- Indirect eval cannot preserve native VM global declaration bindings. Scripts
  with global `var`, `let`, `const`, class or function declarations are refused
  before execution. This includes hoisted `var` and Annex B block functions.
  Use `globalThis` properties for shared state, or `compileFunction` for local scope.
- `timeout`, `breakOnSigint: true`, nonzero line/column offsets, native caches,
  parsing contexts and nonempty context extensions fail explicitly. No watchdog
  option is accepted and then silently ignored.
- Dynamic import syntax and `importModuleDynamically` callbacks are unsupported.
  No Node module loader is exposed to evaluated code.
- `Module`, `SourceTextModule` and `SyntheticModule`, including their documented
  methods and getters, throw without reading arguments or invoking callbacks.
- `measureMemory` throws synchronously without returning fabricated statistics.
- `Script`'s deprecated `produceCachedData` option throws
  `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API` before code coercion or option getters,
  including explicit `false` and `undefined`. Use `createCachedData()` in Node;
  this guest implementation cannot produce native caches either.
- `compileFunction`'s `produceCachedData` is **not deprecated** at the pin. `false`
  works; `true` throws `ERR_JCO_UNSUPPORTED_NODE_API`.

All other accepted unsupported operations throw `ERR_JCO_UNSUPPORTED_NODE_API`.
Evaluated code runs with the guest's globals and authority; this is not a sandbox.
