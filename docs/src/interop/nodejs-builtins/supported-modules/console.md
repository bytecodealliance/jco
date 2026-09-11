# `node:console`

| Imports | Implementation |
| --- | --- |
| `node:console` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console` |

Writing to a console is a host capability, not a portable one: a component has no
stdout of its own. `node:console` therefore resolves against
`jco:node/console@0.1.0`, which an application must provide.

It is **denied by default**. Transpiling maps the capability to jco-std's deny
host unless told otherwise, and every call -- `write`, `isTerminal`, `colorDepth`
-- throws `ERR_JCO_CONSOLE_ADAPTER_REQUIRED`. That is deliberate: a component that
silently discarded its output would be harder to diagnose than one that says the
capability is missing.

To grant it, map the interface to a provider. jco-std ships one for Node, which
writes through to the real `process.stdout`/`process.stderr` and reports their TTY
status and color depth:

```console
jco transpile component.wasm \
  --map 'jco:node/console@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console/host/node'
```

Formatting is done in the guest -- `Console`, the `log`/`warn`/`error` family,
`group` indentation, `count`, `time`, `table` and `dir` all run guest-side, and only
the finished string crosses the boundary.
