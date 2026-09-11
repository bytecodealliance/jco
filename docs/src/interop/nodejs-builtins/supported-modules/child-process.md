# `node:child_process`

| Imports | Implementation |
| --- | --- |
| `node:child_process` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process` |

A WebAssembly guest cannot spawn a process itself. When bundled source imports
`node:child_process`, Jco ensures that the selected world declares the dedicated
interface:

```wit
world app {
  import jco:node/child-process@0.1.0;
  // component imports and exports...
}
```

If the selected world does not already contain the import, Jco edits its `.wit`
file in place, adds a comment identifying the generated line, installs the
interface definition under `deps/jco-node-0.1.0`, and prints a CLI warning naming
the changed files. This makes the capability change visible in the application's
source control. `--world` is honored when a package defines multiple worlds, and
repeated componentization does not add duplicate imports or dependencies.

The interface definition also ships in `jco-std` under `wit/node-0.1.0`.
Declaring or generating the import does not grant host access: Jco's default
transpilation map uses a provider that throws
`ERR_JCO_CHILD_PROCESS_ADAPTER_REQUIRED`. An application must make the security
decision explicitly, for example by mapping the Node host provider:

```console
jco transpile component.wasm \
  --map 'jco:node/child-process@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process/host/node'
```

That produces the call path guest `node:child_process` → WIT capability → host
adapter → Node `node:child_process`.

The current interface supports `spawnSync`, `execFileSync`, and `execSync`,
including buffered input/output, encoding, cwd, environment, shell, stdio,
timeout, signal, identity, and Windows options. `spawn`, callback-based `exec`
and `execFile`, `ChildProcess`, and `fork`/IPC are present but throw
`ERR_JCO_UNSUPPORTED_NODE_API`. A synchronous WIT function cannot faithfully
carry Node callbacks, lifecycle events, or interactive streams; those APIs stay
explicitly unavailable until the capability grows an asynchronous resource and
stream model.
