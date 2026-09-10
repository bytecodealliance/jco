# Express

Express 5.2.1 runs as an ordinary npm dependency. Jco does not replace Express,
its router, or its middleware. The component fixture imports `express`, registers
routes, installs `express.json()`, and calls `app.listen()` unchanged.

Use `jco componentize --bundle` with `--with-nodejs-http-via direct`. Keep the
fixture's WIT world limited to application exports; Jco discovers and adds the
required Node interfaces and `wasi:cli/environment` while bundling. On the host,
use the per-component `createHttpHost(() => instance.httpCallbacks)` registration
described in [HTTP implementation selection](./nodejs-builtins/supported-modules/http.md).
An imported capability does not grant access: map the HTTP provider explicitly,
and leave filesystem access denied unless the application needs it.
Create the Express app inside an exported function, as the fixture does:
`express()` reads the working directory through WASI, which is unavailable
during module pre-initialization.

The end-to-end test compares the same Express app running in Node and in a
StarlingMonkey component over real HTTP sockets. It covers concurrent requests,
route parameters, query strings, JSON request bodies, malformed JSON, application
error middleware, generated ETags, conditional 304 responses, and default 404s.
The direct transport buffers request and response bodies; this is not a claim
that every Express extension or streaming workload is supported.

## Dependency compatibility

CommonJS packages may use audited bare builtin names such as `http`, `stream`,
and `crypto`. Jco first checks normal package resolution, so installed packages
with those names still win. Explicit `node:` imports always select the builtin.
The stream CommonJS adapter exports jco-std's existing `Stream` constructor;
it supplies no alternative stream implementation. HTTP, HTTPS, net, classic
streams, `string_decoder`, and OS APIs all use their current jco-std adapters.

The remaining support needed by this dependency graph includes:

- Synchronous SHA-1/SHA-256 hash and HMAC helpers for ETags and cookie signatures.
  Other crypto operations have explicit limits; this is not full `node:crypto`.
- `setImmediate`/`clearImmediate` globals backed by component timers. Their
  scheduling approximates a later turn, not Node's I/O check phase.
- A structured `Error.prepareStackTrace` adapter for middleware using `depd`.
- Limited unenv implementations of `process`, `tty`, `url`, `util`, `util/types`,
  and `zlib`. These retain unsupported entries and are not full Node APIs.
  In particular, compressed request bodies and zlib transforms are unsupported;
  `sendFile` and static files additionally need filesystem authority.

Process globals here come from unenv; they do not expose the host process.
Applications needing additional runtime behavior should test it explicitly.

## Regex syntax in dependencies

StarlingMonkey's pinned runtime cannot parse the Unicode property escapes used
by Express 5's `path-to-regexp`. During bundling, Jco uses Rolldown's parser to
find regex literals and [regexpu-core](https://github.com/mathiasbynens/regexpu-core)
to lower their property escapes and Unicode set syntax. Strings, comments, and
template text stay untouched. Dynamic `RegExp` constructor strings are not
rewritten. Unicode tables come from the pinned compiler dependency.
