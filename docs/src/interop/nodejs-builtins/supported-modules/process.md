# `node:process`

| Imports | Implementation |
| --- | --- |
| `node:process` | Jco typed facade and explicit Node passthrough |

As WASI has no concept of processes, `node:process` uses a Jco facade
over `jco:node/process@0.1.0`, targeting Node.js v24.20.0. This opt-in Node provider
therefore describes and controls **the embedding Node process** (via an adapter): its environment,
working directory, PID, resource measurements, diagnostics and credentials.

If using the passthrough NodeJS adapter, `process.exit()` terminates that
host; `kill()` sends a real OS signal, and `execve()` replaces the host
program where Node supports it.

When writing components against this API, you can Use normal Node imports
inside a component entry function:

```js
import process, { cwd, cpuUsage, hrtime } from 'node:process';

export function inspect() {
    return JSON.stringify({
        pid: process.pid,
        platform: process.platform,
        cwd: cwd(),
        cpu: cpuUsage(),
        nanoseconds: String(hrtime.bigint()),
    });
}
```

Componentize that component with:

```console
jco componentize app.js --bundle -w wit -o app.wasm
```

Jco adds the typed `jco:node/process` WIT import, and `jco transpile` will map that
to a provider that denies all functionality by default; host-dependent calls
throw `ERR_JCO_PROCESS_ADAPTER_REQUIRED`.

If you want to use the pass-through provider, you must map it in explicitly:

```console
jco transpile app.wasm \
  -o out \
  --map 'jco:node/process@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host/node'
```

The public facade contains no native Node process objects in its WIT boundary.
A different runtime can implement the same typed functions.

Direct jco-std adapters and native Node imports can coexist in a host application.

## Supplying your own process provider

Embedders can construct an object satisfying the public `ProcessHost` type and
pass it directly to the generated `instantiate` function. Start from the denial
provider and override the operations your application supports. You do not need
to implement every operation or forward anything to Node's native process.

For example, this TypeScript provider records exit requests and fails the current
guest call without exiting the embedding process:

```ts
import base from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host';
// To forward unoverridden operations to Node, swap the import above for:
// import base from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host/node';
import type { ProcessHost } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process';

export function createProcessHost() {
    const exitRequests: number[] = [];
    const host = {
        ...base,
        exit(code) {
            const status = Number(code?.val ?? 0);
            exitRequests.push(status);
            throw {
                name: 'Error',
                code: 'COMPONENT_EXIT',
                message: `Component requested exit ${status}`,
            };
        },
    } satisfies ProcessHost;
    return { host, exitRequests };
}
```

The active import denies unoverridden operations. Comment it out and uncomment
the Node provider import to change the base to host passthrough. The custom `exit`
above still overrides that base, but other operations, including `abort`, `kill`,
environment writes and `chdir`, then affect the embedding Node process.

Generate bindings for explicit instantiation; no custom mapping is needed:

```sh
jco transpile app.wasm -o out --instantiation async
```

Then pass your implementation object directly in the imports. Jco's default
mapping names the process import after the denial-provider package; that key does
not force you to use its implementation. The generated binding types list the
expected import keys:

```js
import { instantiate } from './out/app.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { createProcessHost } from './my-process-provider.js';

const { host, exitRequests } = createProcessHost();
const component = await instantiate(undefined, {
    ...new WASIShim().getImportObject(),
    '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host': host,
});
```

The provider implements the WIT operations underneath the Node facade:

- Functions are synchronous, even with `--instantiation async`. Arguments are
  WIT values: `exit(23)` receives `{ tag: 'number', val: 23 }`, a string code uses
  the `text` tag, and an omitted code is `undefined`.
- With JavaScript component bindings, return the successful value directly, or
  throw a `ProcessError` record with `name`, `message`, and optional `code`,
  `errno`, `syscall`, and `path`. The guest receives an Error. Do not return
  `{ tag: 'ok', val: ... }` or `{ tag: 'err', val: ... }` wrappers. Numeric WIT
  lists may require typed arrays: for example, `getgroups` returns `Uint32Array`.
- Implement related operations consistently: environment access uses
  `envEntries`, `envGet`, and `envSet`; `process.exitCode` uses `getState` and
  `setExitCode`. This minimal example supports explicit exit requests only.
  Reading metadata such as `pid` or `argv` requires `metadata`.
- Keep mutable state per component when isolation is desired. Construct a new
  provider for each instance, as in the example. The facade does not isolate
  state that your provider shares with other instances or the host.
- `exit`, `abort`, and `execve` must not return successfully. This example throws
  an ordinary guest-visible error, which guest code can catch. Enforcing component
  termination requires the embedder's own lifecycle policy. Native streams and
  engine hooks listed under Process restrictions remain unsupported regardless
  of the provider.

The `node-process-custom` fixture in `packages/jco/test/fixtures/componentize`
contains the runnable JavaScript equivalent, checked against `ProcessHost`.
Its component calls `process.exit(23)`. End-to-end tests bind separate provider
objects in QuickJS and StarlingMonkey, verify the exit requests reach the correct
object, and confirm the host stays alive and other operations remain denied.

## Process state and snapshots

Host imports are unavailable while the component engine initializes its snapshot.
Read runtime state inside exported guest functions. Metadata, argument arrays,
versions, configuration and features are obtained lazily at first access. Argument
arrays are guest-local snapshots; environment variables and mutable state such as
`title`, `debugPort`, `exitCode` and report settings remain live on the host.
`process.env` supports property access, assignment, deletion, enumeration and
ordinary writable data descriptors. Assign strings, numbers or booleans; deprecated
implicit conversions of other values throw before coercion.

Named imports support functions and lazy objects such as `env`, `argv`, `versions`,
`report` and `allowedNodeEnvironmentFlags`. Runtime primitive exports (`pid`,
`platform`, `arch`, `version`, `exitCode`, and similar properties) are deliberately
absent from the ESM facade: use `process.pid`, for example. ESM bindings cannot be
lazy getters, and supplying a build-machine PID or a placeholder would be incorrect.
Likewise, obtain the optional permission object through `process.permission`.
This implementation handles explicit `node:process` imports; it does not install a
new ambient `globalThis.process` object or intercept the bare `process` specifier.

## Process operations

The Node provider implements cwd/chdir, environment access and `loadEnvFile`, CPU,
thread CPU, memory and resource usage, monotonic `hrtime`, uptime and memory limits,
active resource names, identity and credential operations, `kill`, the setting
overload of `umask`, termination and `execve`, diagnostic reports, allowed Node
flags, permission queries and host source-map settings. Errors cross WIT with their
name, code, errno, syscall and path fields and become guest Error instances.
Diagnostic reports and resource measurements describe the host runtime, including
its JavaScript heap. They are not measurements of just one component.

Ordinary EventEmitter listeners and custom events stay in the guest and use Jco's
already-audited `node:events` implementation. `nextTick` uses the guest microtask
queue; it does not reproduce Node's separate next-tick phase or its ordering ahead
of promise reactions. `ref`/`unref` invoke the guest object's
`Symbol.for('nodejs.ref')`/`Symbol.for('nodejs.unref')` protocols, falling back to
ordinary `ref`/`unref` methods. Warnings are
forwarded to Node and scheduled for guest warning listeners. QuickJS currently
rejects Promise-returning exports for synchronous WIT functions; the async
`nextTick` component test runs on StarlingMonkey, while synchronous passthrough
and denial tests run on both engines.

## Process restrictions

Native stream objects (`stdin`, `stdout`, `stderr`), IPC channels and handle transfer,
module loading (`dlopen`, `getBuiltinModule`), exception-capture hooks and
finalization callbacks cannot cross this boundary. Their entry points throw
`ERR_JCO_UNSUPPORTED_NODE_API`. Registering automatic host events (signals,
`beforeExit`, `exit`, IPC, rejection/exception and worker events) throws the same
error; the adapter does not silently register listeners that will never run.
These restrictions also apply with the Node provider mapped.

Deprecated `binding`, `assert`, `mainModule`, `domain`, the no-argument `umask()`
overload, the `multipleResolves` event and deprecated feature flags throw
`ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API` before inspecting arguments or calling
providers. Legacy `hrtime()` and `nextTick()` remain functional; legacy status is
not deprecation. Platform-specific credential operations are available only when
the Node host supports them. Node 26 additions are outside the Node 24 contract.

## Process implementation sources

`unenv@2.0.0-rc.24`'s process module was inspected, including its environment,
hrtime, next-tick and TTY dependencies. Its placeholder PIDs, zero memory metrics,
local cwd and unimplemented host operations do not meet this contract. Jco uses
native Node operations behind WIT instead, with a small TypeScript facade.
Tuple clock subtraction and warning normalization follow Node's MIT-licensed
`internal/process/per_thread.js` and `internal/process/warning.js` at commit
`71b8b174857e25106d39b61a9e6f30d927da8b01`; the source retains attribution.
