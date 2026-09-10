# `node:url`

| Imports | Implementation |
| --- | --- |
| `node:url` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/url` |

`node:url` supports URL construction and mutation, live `URLSearchParams`,
`URLPattern`, internationalized domains, file URL conversions, formatting, and
HTTP request options. The module and global `URL`/`URLSearchParams` constructors
share identity. Ordinary application imports work with `jco componentize --bundle`
on QuickJS and StarlingMonkey:

```js
import { URL, URLPattern, pathToFileURL, fileURLToPathBuffer } from 'node:url';

const endpoint = new URL('../items', 'https://example.com/api/');
endpoint.searchParams.append('tag', 'two words');
const route = new URLPattern({ pathname: '/items/:id' });
const file = pathToFileURL('/data/a b.txt');
const bytes = fileURLToPathBuffer('file:///data/%FF');
```

## File paths and capabilities

URL parsing, domain conversion, formatting, HTTP options and absolute file paths
need no WIT imports. Relative `pathToFileURL()` paths use the selected world's
`wasi:cli/environment@0.2.x` interface lazily. Missing or ambiguous environment
imports produce an explicit error when cwd resolution is needed; importing the
module and using its pure operations still works.

The default path convention is POSIX. `{ windows: true }` enables drive and UNC
paths on either backend. `fileURLToPathBuffer()` returns the same Buffer type as
`node:buffer`, preserving raw bytes and malformed percent escapes. Unlike the
string conversion, Node 24's Buffer conversion permits encoded slash bytes.

## Compatibility target and implementation

The target is Node **v24.20.0**, commit
`71b8b174857e25106d39b61a9e6f30d927da8b01`. The portable helpers are adapted from
Node's MIT-licensed `lib/url.js` and `lib/internal/url.js`. The WHATWG core is
`whatwg-url@14.2.0`, with `tr46@5.1.1`, `webidl-conversions@7.0.0`, and
`punycode@2.3.1`; pattern matching uses `urlpattern-polyfill@10.1.0`.

Jco adds Node's constructor coercion, error codes, legacy object formatting, and
lazy path providers. Its UTF-8 adapter handles malformed sequences consistently
across engines; the decoder is adapted from Apache-2.0-licensed
`text-decoder@1.2.7`. StarlingMonkey's native URL host parser supplies IDNA
normalization because that engine lacks `String.normalize()`. At bundle time,
`regexpu-core@6.4.0` expands URLPattern's two Unicode identifier expressions for
StarlingMonkey. Only the exact audited dependency files receive these adapters.

The installed `unenv@2.0.0-rc.24` URL implementation was not admitted: it lacks
`URLPattern` and `fileURLToPathBuffer`, uses Punycode without domain validation,
and differs in Windows paths, Unicode formatting, and absent HTTP option fields.
The new implementation continues to share Jco's audited Buffer and querystring
cores. Applications can mix ordinary `node:` imports with direct jco-std adapters;
the latter expose explicit factories for callers supplying their own providers.

## Intentional differences

Deprecated string parsing is refused immediately with
`ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`: `parse()`, `resolve()`,
`resolveObject()`, `format(string)`, and the corresponding legacy parsing methods.
These errors occur before argument coercion or callbacks. Use `new URL(input, base)`
or `URL.parse(input, base)`. Legacy `Url` construction, object formatting,
`parseHost()`, and `Url.prototype.resolveObject(object)` remain functional.

`URL.createObjectURL()` and `URL.revokeObjectURL()` throw
`ERR_JCO_UNSUPPORTED_NODE_API`; Jco does not provide Node's thread-local Blob URL
registry. Invalid Punycode labels can be rejected more strictly by the WHATWG
fallback than by Node's Ada parser. Engine-specific inspection and stack formatting
are not reproduced. Errors mentioning the file host platform use `posix`.
