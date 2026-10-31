# Runtime API and provider contracts

## API version 1: named modules and specific contexts

`cmRuntimeEsModule` identifies a **package or directory base**. Generated bindings
statically import `CM_RUNTIME_API_VERSION` from the `runtime` subpath and
`tableGet` from `intrinsics/resource` and selected conversions from
`intrinsics/conversion`, JavaScript helpers from `intrinsics/js-helper` and
string operations/codecs from `intrinsics/string` and the global WebIDL adapter
from `intrinsics/webidl`.
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
through the native ES module loader. The current externalized set is resource `tableGet` and all 19 conversion
operations, both JavaScript helpers, all ten string variants and the WebIDL proxy
(33/274 logical intrinsic variants);
other families remain inline during migration.

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
`./intrinsics/js-helper`, `./intrinsics/string` and `./intrinsics/webidl` subpaths
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
