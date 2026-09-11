# `node:domain`

| Imports | Implementation |
| --- | --- |
| `node:domain` | _(refused)_ |

`node:domain` is Stability 0 -- deprecated in its entirety -- and Jco implements none of it. Its
purpose is routing errors across asynchronous boundaries, which a component cannot do in any case
(see [`node:async_hooks`](./async-hooks.md)).

It still resolves rather than failing as an unknown import, so the error names the reason and a way
forward instead of reading `Could not resolve 'node:domain'`. Importing is fine; every use --
`create()`, `createDomain()`, `new Domain()`, and reading `active` or `_stack` -- throws
`ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`, pointing at `AsyncLocalStorage` for carrying context.

`active` and `_stack` are reachable on the default import only. An ES module binding cannot throw
on read, so `import { active } from "node:domain"` fails at build time instead.
