# HTTP callback failure: imported and exported listener resources are distinct

Recorded 2026-09-08 while investigating Jco PR #2080.

## Status and correction to the earlier diagnosis

The integration test `serves a request through guest -> WIT callback resource -> host node:http` in `packages/jco/test/node/http.js` is temporarily skipped at the user's request. Its `TODO(fix)` identifies the resource identity mismatch; its original body and assertions remain intact.

**The initial conclusion that this necessarily requires an upstream ComponentizeJS registration fix was too strong.** Further inspection shows that the test passes a guest-defined exported resource to an import expecting the separately imported resource type. A control using an actual host-created imported resource succeeds. A separate callback-ID dispatcher proof of concept also succeeds without engine changes.

The immediate HTTP fix should therefore address the WIT/adapter callback design in this repository. ComponentizeJS could additionally provide a clearer error when lowering an object without a valid imported-resource handle, but automatically registering that object as an exported resource would not repair the type mismatch.

## User-visible failure

The direct HTTP shim constructs its listener in the guest:

```ts
createServer(options, handler) {
    const server = new host.Server(options, new RequestListener(handler));
    // ...wrap listen, close, address, etc.
}
```

Its WIT imports a host server whose constructor takes ownership of a listener:

```wit
interface http-callbacks {
    resource request-listener {
        handle: func(request: incoming-request)
            -> result<outgoing-response, error>;
    }
}

interface http {
    use http-callbacks.{request-listener};

    resource server {
        constructor(options: server-options, listener: own<request-listener>);
        // ...listen, close, etc.
    }
}
```

The guest exports `http-callbacks` and imports `http`. Importing `http` also requires an imported projection of `http-callbacks`. Exporting an interface with the same name does not make a locally constructed resource interchangeable with that imported type.

Originally instantiation also lacked `imports["jco:node/http-callbacks"].RequestListener`. Supplying the real class resolves that missing-import error, but does not give the guest object a valid imported resource handle. The next failure is:

```text
RuntimeError: unknown handle index 1
    at rscTableRemove (.../repro.js:173:13)
    at _trampoline22 (.../repro.js:6402:5)
```

The index in this message is an internal table-slot index derived from handle 0. It is not evidence that the guest passed resource handle 1.

## Minimal failing source and WIT

```wit
package repro:callbacks;

interface callbacks {
    resource listener {
        call: func() -> u32;
    }
}

interface host {
    use callbacks.{listener};
    invoke: func(value: own<listener>) -> u32;
}

world test {
    import host;
    export callbacks;
    export run: func() -> u32;
}
```

```js
import { invoke } from 'repro:callbacks/host';

class Listener {
    call() {
        return 42;
    }
}

export const callbacks = { Listener };
export function run() {
    return invoke(new Listener());
}
```

Host imports:

```js
class HostListener {
    call() {
        return 99;
    }
}
imports['repro:callbacks/callbacks'] = { Listener: HostListener };
imports['repro:callbacks/host'] = {
    invoke: (listener) => listener.call(),
};
```

The intended guest callback returns 42; the deliberately different host implementation returns 99. This prevents substituting a host callback from appearing to preserve guest behavior. In the failing case neither callback executes: lowering/lifting the argument fails first.

## Generated bindings explain the zero handle

Direct output from ComponentizeJS 0.22.0's splicer contains the following import lowering, with task bookkeeping omitted:

```js
function import_repro_callbacks_host$invoke(arg0) {
    var handle0 = arg0[symbolRscHandle];
    finalizationRegistry_import$callbacks$listener.unregister(arg0);
    // ...
    return $import_repro_callbacks_host$invoke(handle0);
}
```

`new Listener()` is a normal instance of the guest's class. It has no generated private imported-resource handle. Consequently `handle0` is `undefined`; passing it through an i32 Wasm argument yields 0. No `resource.new` call occurs on this path.

The generated guest also contains a separate exported-resource representation map and exported-resource new/rep/drop intrinsics. Their existence does not authorize using those handles in the imported-resource table.

Printing the compiled component's WIT exposes the implicit import:

```wit
world root {
    import repro:callbacks/callbacks;
    import repro:callbacks/host;
    // ...WASI imports...

    export run: func() -> u32;
    export repro:callbacks/callbacks;
}
```

The Component Model gives resource definitions distinct identities; a shared interface name does not establish equality between the imported and newly defined resources. Its acyclic type rules also prevent imports from referring back to exported type names. See the primary [Component Model type-system explanation](https://github.com/WebAssembly/component-model/blob/main/design/mvp/Explainer.md) and [WIT interface/import rules](https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md).

## Control: a valid imported resource works

Add a host factory to the imported interface:

```wit
interface host {
    use callbacks.{listener};
    make: func() -> own<listener>;
    invoke: func(value: own<listener>) -> u32;
}
```

Use its result in the guest:

```js
import { make, invoke } from 'repro:callbacks/host';

export function run() {
    return invoke(make());
}
```

Supply `make: () => new HostListener()` on the host. This returns a real imported resource to the guest, whose generated wrapper carries the required handle. Passing it back to `invoke` succeeds and returns **99**. This rules out a general inability to transfer this imported resource through ComponentizeJS.

## Proven local direction: explicit callback registration and dispatch

The smallest tested alternative keeps the JavaScript closure in the guest and passes a registration ID as ordinary WIT data. The host invokes a guest export after the original guest call returns.

Proof-of-concept WIT:

```wit
package repro:dispatch;

interface host {
    register: func(id: u32);
}

world test {
    import host;
    export start: func();
    export dispatch: func(id: u32) -> option<u32>;
    export release: func(id: u32);
}
```

Guest implementation, condensed:

```js
import { register } from 'repro:dispatch/host';

const callbacks = new Map();
let nextId = 1;

export function start() {
    let count = 41;
    const id = nextId++;
    callbacks.set(id, () => ++count);
    register(id);
}

export function dispatch(id) {
    return callbacks.get(id)?.();
}

export function release(id) {
    callbacks.delete(id);
}
```

Host orchestration:

```js
const ids = [];
imports['repro:dispatch/host'] = { register: (id) => ids.push(id) };
const instance = await instantiate(undefined, imports);

instance.start();
// Do not call dispatch synchronously from the register import.
console.assert(instance.dispatch(ids[0]) === 42);
console.assert(instance.dispatch(ids[0]) === 43);
instance.release(ids[0]);
console.assert(instance.dispatch(ids[0]) === undefined);
```

The executable proof tests two independent registrations, persistent closure state, explicit release, and continued operation of the other registration after releasing the first. All pass with the current ComponentizeJS/transpiler.

This is a protocol proof, not a completed HTTP fix. It does not yet exercise HTTP payload records, async request handlers, simultaneous requests, or server shutdown during an in-flight callback.

## Proposed HTTP implementation work

1. **Change the callback boundary.** Keep the host-owned server resource, but give its constructor a callback registration ID instead of a guest-created `own<request-listener>`. Export an ordinary callback dispatch function accepting that ID and the existing request record. Keep the existing response/error record types. Use an explicit release mechanism with a defined owner.
2. **Add the guest registry in the direct implementation.** Register the handler before constructing the host server, remove it if construction fails, and retain it while requests can still use it. Define behavior for unknown/released IDs and ID exhaustion; do not reuse a live registration.
3. **Bind the host adapter to one component instance.** The adapter must receive that instance's dispatch export after instantiation, before the first `start`/server creation call. The current module-level adapter exports need an instance-specific callback binding to route IDs from multiple components. Do not share an unscoped callback map between instances.
4. **Respect execution ordering.** Registration stores routing data; it must not synchronously call back into the currently executing guest. Node's later request event can invoke the dispatcher. Verify the existing JSPI configuration for async handlers and concurrent calls explicitly.
5. **Specify cleanup.** Close should stop new requests, settle or cancel in-flight work according to the existing API behavior, then release the registration exactly once. Cover failed listen/construction and disposal as well as normal close.
6. **Update wiring and tests.** Change the WIT requirements, generated entry export, direct facade, host adapter and integration runner together. Restore the original HTTP integration test after the request/response roundtrip and lifecycle checks pass.

Relevant implementation locations are `packages/jco-std/wit/node-0.1.0/http.wit`, `packages/jco-std/src/wasi/0.2.x/node/24.x.x/http/impl/direct.ts`, `http/types.ts`, `http-host-node.ts`, `packages/jco/src/node-wit.ts`, the HTTP builtin adapter/entry wrapper, and `packages/jco/test/fixtures/componentize/node-http-server/run.js`.

An alternative that preserves a listener resource is a **host-owned** listener constructed from a registration ID, with its methods forwarding to a separate guest dispatcher. That still needs explicit instance binding and lifecycle management, and adds an extra resource. A pull-based server request stream is another larger redesign. The ID-based server registration is the smallest direction established by the current proof.

## Fixes that would not address the cause

- Registering a guessed handle or copying an exported handle into the imported table: identities and ownership remain wrong.
- Replacing the guest callback with a host class returning a fixed response: loses the guest handler and closure state.
- Switching own to borrow: changes lifetime rules, not resource identity.
- Upgrading only jco-transpile: the same compiled HTTP component failed on 0.12.1, 0.13.0 and the current native transpiler.

## Repeatable commands and evidence

From the repository root with dependencies installed and Node 26 available:

```sh
source .llm/env.sh
node .llms/notes/reproduce-componentize-issues.mjs broken
node .llms/notes/reproduce-componentize-issues.mjs imported
node .llms/notes/reproduce-componentize-issues.mjs dispatch
```

The helper creates and prints a fresh artifact directory for each run. `broken` asserts the expected trap and exits successfully when it reproduces; it is not a passing callback implementation. `imported` asserts 99. `dispatch` asserts closure results 42/43 and 70, plus isolation and release.

Fresh logs: `.llm/notes/callback-{broken,imported,dispatch}-control.log`. Original generated guest bindings: `.llm/tmp/callback-engine-repro/bindings.js`; its metadata and decoded component WIT are beside it. Original trap logs are listed in `.llm/notes/jco-std-0.3.0-ci-followup-101966235297.md`.

The generated-binding excerpt above comes directly from the packaged splicer, before the installed JavaScript wrapper's methodless-resource compatibility helper; that helper is not involved in this listener's generated class.
