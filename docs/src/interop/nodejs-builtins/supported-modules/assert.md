# `node:assert`

| Imports | Implementation |
| --- | --- |
| `node:assert`, `node:assert/strict` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/assert` |

Jco keeps its own assert implementation because the assertion namespace is a
coherent system: comparison semantics, callable/default/strict identities,
`AssertionError`, and error matching must work together (and can change across
versions).

The implementation covers Node 24's public module surface and comparison of
cycles, Maps, Sets, typed arrays, errors, symbols, and other built-in families.
The deprecated `CallTracker` API throws immediately. The deprecated multi-argument
form of `assert.fail()` also throws immediately, while its current zero- and
one-argument forms remain available.
