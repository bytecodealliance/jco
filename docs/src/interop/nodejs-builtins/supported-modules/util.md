# `node:util`

| Imports | Implementation |
| --- | --- |
| `node:util`, `node:util/types` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/util` and `/util/types` |

`node:util` provides MIME parsing, argument and environment-file parsing, text
styling, string/array diffs, callback/promise conversion, inspection and formatting,
inheritance, deep equality, and type predicates. Default and named imports are
available; `node:util/types` shares the same predicate object as `util.types`.

```js
import { MIMEType, parseArgs, promisify, styleText } from 'node:util';
import { isUint8Array } from 'node:util/types';

const mime = new MIMEType('text/plain; charset=utf-8');
const { values } = parseArgs({
  args: ['--verbose'],
  options: { verbose: { type: 'boolean' } },
});
const increment = promisify((value, callback) => callback(null, value + 1));
const answer = await increment(41);
const heading = styleText('bold', mime.essence, { validateStream: false });
const bytes = isUint8Array(new Uint8Array([answer]));
```

The contract targets Node 24.20.0. Portable algorithms run in both QuickJS and
StarlingMonkey. The implementation shares deep equality with `node:assert`, the
formatting core with `node:console`, and scheduling and validation with the
existing stream and error helpers.

- `parseArgs` requires an explicit `args` array. It never reads host `process.argv`.
  `parseEnv` returns parsed values without modifying an environment.
- `styleText` requires `{ validateStream: false }` for unconditional ANSI output,
  or an explicit stream. Stream validation uses its `isTTY` flag; host color
  environment variables and terminal capabilities are not consulted.
- `TextEncoder` and `TextDecoder` use the engine constructors. StarlingMonkey
  provides them; QuickJS currently throws `ERR_JCO_UNSUPPORTED_NODE_API` on
  construction.
- `promisify` preserves custom hooks, receivers and callback results. Passing a
  declared async function without a custom hook throws a deprecated-API error.
  The shim cannot identify an ordinary function that returns a promise without
  calling it; use promise-returning functions directly. `callbackify` schedules
  callbacks through the shared guest microtask queue, without a separate Node
  `nextTick` phase.
- `inspect`, `format` and `formatWithOptions` support ordinary values, collections,
  descriptors, custom hooks, circular references and inspection options. Native
  engine details and Node's full pretty-print layout are not reproduced. Promises
  display `<state unavailable>` and weak collections display `<items unknown>`.
  `showProxy` and hidden promise/weak-collection state throw; `%o` inspects hidden
  properties without unwrapping proxies. Inspection can trigger proxy traps.
- Buffer, typed-array, boxed-value and collection predicates use intrinsic brand
  checks. Promise checks require the same realm. Arguments, generator, iterator,
  module-namespace and function checks use observable tags and can be spoofed;
  error checks have the same limitation when the engine lacks `Error.isError`.
  `isCryptoKey` requires the engine's `CryptoKey` implementation.
- `aborted` requires the engine's `WeakRef` and `FinalizationRegistry` for an active
  signal. It uses public abort listeners; an earlier listener calling
  `stopImmediatePropagation()` can prevent notification.

Host process and native engine operations throw `ERR_JCO_UNSUPPORTED_NODE_API`:
`debug`/`debuglog`, `deprecate`, `getCallSites`, `getSystemErrorName`,
`getSystemErrorMessage`, `getSystemErrorMap`, `setTraceSigInt`,
`convertProcessSignalToExitCode`, `transferableAbortController`,
`transferableAbortSignal`, and the `isProxy`, `isExternal`, and `isKeyObject`
predicates. Deprecated `isArray`, `_extend`, `_errnoException`, and
`_exceptionWithHostPort` throw `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`.
