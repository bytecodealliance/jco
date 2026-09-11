# Errors

The Node [Errors API](https://nodejs.org/docs/latest-v24.x/api/errors.html) is
cross-cutting behavior rather than a `node:errors` module. Standard error
constructors are globals, while individual Node APIs create coded and system
errors. Jco therefore does not resolve `node:errors`; Node 24 rejects that
specifier as well.

Bundled code can use `Error`, `AggregateError`, `DOMException`, `EvalError`,
`RangeError`, `ReferenceError`, `SuppressedError`, `SyntaxError`, `TypeError`, and
`URIError` without an import. Rolldown injects
`@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/errors` only for constructors
actually referenced by the source graph. A graph that uses none of them contains
none of the adapter after bundling.

The adapter preserves the guest engine's constructor identities, supplies
portable fallbacks for missing newer constructors and V8 Error extensions, and
provides the common coded/system-error core used by other jco-std Node shims. No
WIT capability is required. Error classes, codes, and documented system fields
are compatibility targets; exact stack frames and source positions remain
engine-specific.
