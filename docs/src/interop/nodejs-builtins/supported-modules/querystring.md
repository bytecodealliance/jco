# `node:querystring`

| Imports | Implementation |
| --- | --- |
| `node:querystring` | unenv's Node-derived querystring implementation |

`unenv`'s querystring implementation is adapted from Node's MIT-licensed
implementation and is a strong fit for a component: it is deterministic, mostly
algorithmic, and needs no operating-system capability. Jco exposes its default
namespace and the named `decode`, `encode`, `escape`, `parse`, `stringify`,
`unescape`, and `unescapeBuffer` exports with Node-compatible alias identities.

The adapter initializes the same Buffer core as `node:buffer`. That matters for
malformed-percent fallback and `unescapeBuffer`, which use Buffer internally.
