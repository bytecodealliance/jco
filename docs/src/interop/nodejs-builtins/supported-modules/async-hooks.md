# `node:async_hooks`

| Imports | Implementation |
| --- | --- |
| `node:async_hooks` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/async-hooks` |

`AsyncLocalStorage` works within a synchronous scope: `run`, `getStore`, `exit`, `enterWith`,
nesting, `snapshot` and `bind` all behave as Node does, and `AsyncResource` binds to the context it
was constructed in.

What it cannot do is carry a store across an asynchronous boundary. `await` resolves through the
engine's internal `PerformPromiseThen`, which JavaScript cannot intercept -- patching
`Promise.prototype.then` does not see it -- and StarlingMonkey exposes no TC39 `AsyncContext` to
carry the value instead.

Rather than return an empty store after an `await`, Jco refuses at the call site: any callback
given to `run`, `exit`, `withScope` or a snapshot that returns a promise throws
`ERR_JCO_UNSUPPORTED_NODE_API`, naming the reason. A failure at the call site is easier to act on
than a store that silently disappears somewhere else.

`createHook`, `executionAsyncId`, `triggerAsyncId` and `executionAsyncResource` describe the async
resource graph and always throw: nothing tracks that graph in a component.
