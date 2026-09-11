# `node:events`

| Imports | Implementation |
| --- | --- |
| `node:events` | unenv's EventEmitter with a Jco layer from `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/events` |

`node:events` is two pieces. The `EventEmitter` itself comes from unenv, audited against Node 24:
`on`/`emit`, one-shot `once`, listener ordering under `prependListener`, `eventNames`,
`removeAllListeners`, the per-emitter max-listener methods, and an unhandled `error` throwing all
match Node, as do `once()`, `on()`'s async iterator, `getEventListeners`, `addAbortListener` and
`EventEmitterAsyncResource`.

Three module-level functions do not, and Jco implements them in jco-std rather than exporting
something that fails when called:

| Entry point                                | unenv                                                                | Jco                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `events.listenerCount(emitter, eventName)` | throws `[unenv] node:events.listenerCount is not implemented yet!`   | delegates to the emitter's own `listenerCount`, as Node does, so a subclass that overrides it is honored |
| `events.setMaxListeners(n[, ...targets])`  | throws `[unenv] node:events.setMaxListeners is not implemented yet!` | sets the limit on `EventEmitter`s and `EventTarget`s, or the process-wide default when given no targets  |
| `events.getMaxListeners(target)`           | throws for an `EventTarget`; only handles emitters                   | reads either, falling back to the current default                                                        |

Argument validation matches Node's, `ERR_INVALID_ARG_TYPE` and `ERR_OUT_OF_RANGE` messages
included.

Node's module object _is_ the `EventEmitter` class, so `events === events.EventEmitter` holds here
too: the adapter keeps the class as the default export, and installs the three functions above as
statics on it so both access paths reach the working versions.

Note for anyone reading jco-std: it carries a separate, deliberately minimal `EventEmitter` of its
own for shims such as `node:cluster`. jco-std does not depend on unenv, and shim code importing a
`node:*` builtin would rely on a bundler rewriting it, which is not true of every way jco-std is
consumed. The two are independent by design.
