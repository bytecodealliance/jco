# Runtime API and provider contracts

## API version 1: named modules and specific contexts

`cmRuntimeEsModule` identifies a **package or directory base**. Generated bindings
statically import `CM_RUNTIME_API_VERSION` from the `runtime` subpath and
resource operations and storage initializers from `intrinsics/resource`, selected conversions from
`intrinsics/conversion`, JavaScript helpers from `intrinsics/js-helper` and
string operations/codecs from `intrinsics/string` and the global WebIDL adapter
from `intrinsics/webidl`, with core operations, constructors and state owners
from `intrinsics/core`, component state/scheduling from `intrinsics/component`,
and waitable constructors/operations from `intrinsics/waitable`.
Error-context storage and operations use `intrinsics/error-context`;
tasks, subtasks and their state use `intrinsics/async-task`;
guest-to-guest host calls and event writing use `intrinsics/host`;
flat lifting helpers use `intrinsics/lift`, lowering helpers use `intrinsics/lower`,
and future classes, tables and operations use `intrinsics/future`.
Only implemented subpaths are published.
Root exports the same metadata and types as `runtime`; there is no root factory.

| Base                               | Resource import                                        | Version import                             |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| `@bytecodealliance/jco-cm-runtime` | `@bytecodealliance/jco-cm-runtime/intrinsics/resource` | `@bytecodealliance/jco-cm-runtime/runtime` |
| `custom-runtime`                   | `custom-runtime/intrinsics/resource`                   | `custom-runtime/runtime`                   |
| `./runtime/`                       | `./runtime/intrinsics/resource.js`                     | `./runtime/runtime.js`                     |
| `file:///path/dist/`               | `file:///path/dist/intrinsics/resource.js`             | `file:///path/dist/runtime.js`             |
| `https://example.test/runtime/`    | `https://example.test/runtime/intrinsics/resource.js`  | `https://example.test/runtime/runtime.js`  |

One optional trailing slash is normalized. Relative bases resolve from the
**generated bindings**, not the transpilation process's working directory.
Directory/URL bases use real `.js` files. Use file URLs for Windows paths.
Control characters, empty bases, unsupported URL schemes and query/fragment
suffixes on directory bases are rejected. Bare packages named `something.js`
are packages; relative/URL file bases such as `./provider.js` must migrate to a
directory. Browser package imports need normal import-map or bundler setup;
map each public subpath to its `.js` file. HTTP servers must serve the whole
runtime directory tree with JavaScript MIME types.

Bindings check version 1 before use. Missing subpaths or named exports fail
through the native ES module loader.

## Implementing an alternative runtime

`dist/runtime.d.ts`, published at `@bytecodealliance/jco-cm-runtime/runtime`, is
the explicit, self-contained structural contract. It has no imports from default
implementation modules. A TypeScript provider can check its module namespace:

```ts
import type { ResourceModule } from '@bytecodealliance/jco-cm-runtime/runtime';
import * as resource from './intrinsics/resource.js';

const conformance: ResourceModule = resource;
```

Export `CM_RUNTIME_API_VERSION = 1` from your `runtime.js`. Expose `./runtime`
and the implemented `./intrinsics/resource`, `./intrinsics/conversion` and
`./intrinsics/js-helper`, `./intrinsics/string`, `./intrinsics/webidl` and
`./intrinsics/core`, `./intrinsics/component`, `./intrinsics/waitable`,
`./intrinsics/error-context`, `./intrinsics/async-task`, `./intrinsics/host`,
`./intrinsics/lift`, `./intrinsics/lower` and `./intrinsics/future` subpaths
in your package's `exports` map, with their matching
JavaScript and declaration targets. `RuntimeModuleContracts` is a type-only map
of public suffixes to their interfaces; no assembled runtime object is required.
Function-property signatures support strict parameter checking. Type-only
consumption produces no runtime imports.

Structural conformance does not prove package resolution, exact JavaScript arity,
or Canonical ABI behavior. TypeScript permits implementations to ignore arguments.
Test the installed package and its behavior, especially traps and shared state.
Providers may re-export selected default functions. Those functions retain their
own statically imported dependencies: overriding a sibling export does not
intercept its calls. There is no mutable namespace receiver or implicit override
registry. Context-free operations take no dummy context argument.

See the [intrinsic contracts](intrinsics/README.md) for individual operations and capabilities.

## Runtime profiles

Runtime diagnostic statements carry a `DEBUG` JavaScript label,
and assertions about internal implementation invariants carry a `SAFETY` label.
A profile is the choice of which labeled statements to keep:

| Profile     | Diagnostics (`DEBUG`) | Internal assertions (`SAFETY`) | Package entry                                |
| ----------- | --------------------- | ------------------------------ | -------------------------------------------- |
| `checked`   | removed               | kept                           | `@bytecodealliance/jco-cm-runtime` (default) |
| `debug`     | kept                  | kept                           | `@bytecodealliance/jco-cm-runtime/debug`     |
| `unchecked` | removed               | removed                        | `@bytecodealliance/jco-cm-runtime/unchecked` |

Removing a labeled statement removes the whole statement,
including object literals, string formatting, and diagnostic getters passed as log arguments.
Diagnostic arguments must not perform required work.

Canonical ABI traps, resource-handle validation, Unicode validation, ownership, cancellation,
and lifecycle checks are never labeled, and remain in every profile.
The initial `SAFETY` assertion verifies the representation table's internal freelist head.
Adding a `SAFETY` label requires auditing both the checked condition
and any work performed while evaluating it.

Only the `debug` profile logs: when `JCO_DEBUG` is set,
or for bundled runtimes when an instance is created with the `debug` option.
The other profiles omit runtime log calls even when `JCO_DEBUG` is set.
The explicitly exported `debugLog` utility remains callable in every profile.

### Bindings that bundle the runtime

The transpiler applies a profile when it bundles the runtime into generated bindings.
Select it with `runtimeProfile` (`--runtime-profile` on the command line); the default is `checked`.

### Bindings that import the runtime

Every profile has the same exports, type declarations, and runtime API version,
so the profile is chosen by the base that bindings import:

```sh
jco transpile component.wasm --cm-runtime-es-module @bytecodealliance/jco-cm-runtime           # checked
jco transpile component.wasm --cm-runtime-es-module @bytecodealliance/jco-cm-runtime/debug     # debug
jco transpile component.wasm --cm-runtime-es-module @bytecodealliance/jco-cm-runtime/unchecked # unchecked
```

Modules of different profiles do not share state or private brands,
so one program should import a single profile.

### Building profiles

`pnpm --filter @bytecodealliance/jco-cm-runtime build` builds the package:
the `checked` profile at the top of `dist`, with `dist/debug` and `dist/unchecked` beside it.
The `checked` and `unchecked` profiles are bundled and minified, one module per entry point with shared chunks;
the `debug` profile keeps one module per source file.

To build one profile into a directory of its own,
run `node scripts/build.mjs --profile <profile> --out-dir /path/to/runtime` from this package,
and use that directory as `cmRuntimeEsModule`.

A bundler can also remove labels from the `debug` profile itself, for example with Rolldown:

```js
const bundle = await rolldown({
    input: 'component.js',
    transform: { dropLabels: ['DEBUG'] },
});
```

The runtime must be included in the bundle, rather than marked external.
Apply label removal before optimization passes that discard unused labels.

See the [label experiments](../bench/labels/README.md) for correctness checks and reproducible Node benchmarks.

### Allocation and scheduling behavior

Long or explicitly reused runtime-owned flat-argument contexts expose remaining
arguments through `params`, copying only when a caller observes or retains that
array. Short one-shot contexts, caller-created contexts and custom property
accessors keep ordinary array consumption. Cursor setup defaults to vectors of
at least 64 arguments because setup outweighs slicing for short calls. Scalar memory views refresh after buffer replacement, including
memory growth. Custom lift functions keep the pair-returning API and may replace
their context; built-in scalar composition can avoid constructing those pairs.

The default Node UTF-8 codec uses native byte primitives for ASCII strings of at least
256 UTF-16 code units. Browser codecs and custom `encodeInto` implementations keep
the portable path. Reallocations remain exact and occur once per string.

Buffers may optionally implement bulk `copyTo` and owned `readBytes` capabilities;
providers without them continue using resource-aware array reads and writes.
Ready stream sources may expose `readSourceOrPromise`; `readSource` retains its
promise API. Synchronous sources yield after 64 reads, and host completions share
scheduler wakeups within a microtask checkpoint. The scheduler still resumes one
thread per tick to preserve thread-register restoration.
