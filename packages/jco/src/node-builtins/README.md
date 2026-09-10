# Node builtin adapters

`index.ts` composes the per-API factories into one Rolldown plugin. Each factory
receives the selected WIT world and builtin options, and returns synchronous
`resolveId` and `load` hooks. Returning `null` lets the next adapter handle a request.

To add an API, create its module and add its factory to the list in `index.ts`.
Keep its specifiers, WIT requirements, and generated module source together.
Use `builtin` for ordinary `node:` imports and `virtualBuiltin` for shared modules
such as guest callbacks. A factory can combine these with `composeBuiltins`.

Resolve implementation paths inside the load callback, using `stdModule`, so an
unused API never requires its package entry point. Report WIT requirements in the
resolve callback. Shared HTTP/HTTPS source lives in `http-common.ts`; socket
provider construction and version validation live in `wasi-sockets.ts`.
