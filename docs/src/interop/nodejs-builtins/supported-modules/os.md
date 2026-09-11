# `node:os`

| Imports | Implementation |
| --- | --- |
| `node:os` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os` |

A WebAssembly guest has no view of the machine it runs on. When bundled source
imports `node:os`, Jco ensures that the selected world declares the dedicated
interface, following the same in-place WIT editing described for
`node:child_process`:

```wit
world app {
  import jco:node/os@0.1.0;
  // component imports and exports...
}
```

Declaring or generating the import does not grant host access: Jco's default
transpilation map uses a provider that fails every inspecting or mutating call
with `ERR_JCO_OS_ADAPTER_REQUIRED`. Static POSIX values that reveal no machine
state -- `EOL`, `devNull`, and `constants` -- resolve without a provider, so the
module can be imported and used for its constants even when access is denied. An
application must make the security decision explicitly, for example by mapping
the Node host provider:

```console
jco transpile component.wasm \
  --map 'jco:node/os@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os/host/node'
```

That produces the call path guest `node:os` → WIT capability → host adapter →
Node `node:os`.

The interface supports `arch`, `availableParallelism`, `cpus`, `endianness`,
`freemem`, `getPriority`, `homedir`, `hostname`, `loadavg`, `machine`,
`networkInterfaces`, `platform`, `release`, `setPriority`, `tmpdir`, `totalmem`,
`type`, `uptime`, `userInfo`, and `version`, with Node's argument validation and
`ERR_SYSTEM_ERROR` reconstruction for failing calls.
