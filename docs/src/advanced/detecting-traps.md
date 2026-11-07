# Detecting Traps

While some errors are represented at the WIT type level and expected, some internal errors
may cause a component instance to [trap][wiki-trap]. Jco-generated bindings report the
component-model traps they detect with the built-in `WebAssembly.RuntimeError` class.

A trap that disables a component instance makes subsequent calls throw the original trap
without re-entering the component. A trap in a background task can end only that task;
it does not always disable the entire instance.

## Catch traps from exported calls

To detect these traps, use the built-in `WebAssembly.RuntimeError` class:

```js
import { instantiate } from './dist/transpiled/component.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

const shim = new WASIShim().getImportObject();
const instance = await instantiate(undefined, shim);

try {
    await instance['ns:pkg/iface'].someFunction();
} catch (err) {
    if (err instanceof WebAssembly.RuntimeError) {
        console.error(`TRAP: ${err}`);
        // Release runtime-managed resources and end any remaining guest work.
        instance._util.stop();
    } else {
        // Other exceptions are unexpected and should be handled separately.
        throw err;
    }
}
```

WIT `result<T, E>` values remain part of the component's normal return contract and are not
thrown as `WebAssembly.RuntimeError` instances.

Using `await` inside the `try` block catches both synchronous exceptions and rejected
asynchronous calls. It cannot catch a trap in guest work that continues after the call
has returned.

## Receive background traps with `onTrap`

When generating bindings with `--instantiation async` or `--instantiation sync`, pass an
`onTrap` callback in the fourth argument to `instantiate`. The callback receives each trap
once, including traps in background tasks and deadlocks. It also receives traps that throw
or reject an exported call, so catching that call is still necessary.

For example, a Node.js host using asynchronous instantiation can log traps even after
`someFunction()` has returned:

```js
import { readFile } from 'node:fs/promises';
import { instantiate } from './dist/transpiled/component.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

const getCoreModule = async (path) =>
    WebAssembly.compile(await readFile(new URL(`./dist/transpiled/${path}`, import.meta.url)));

const instance = await instantiate(
    getCoreModule,
    new WASIShim().getImportObject(),
    undefined, // Use the default core Wasm instantiator.
    {
        onTrap(error) {
            console.error('Component trapped:', error);
        },
    },
);

try {
    await instance['ns:pkg/iface'].someFunction();
} catch (error) {
    // End remaining guest work before propagating the failed call.
    instance._util.stop();
    throw error;
}
// Background guest work can still report traps through onTrap after this point.
```

The callback belongs to this instantiation, including its nested components. Other
instantiations have their own callbacks. Without `onTrap`, traps retain their existing
behavior, but a background trap may have no outstanding host call to reject.

`onTrap` runs synchronously while the runtime unwinds the trap. It may call
`instance._util.stop()` to end the remaining guest work, but it should not call other guest
exports. Stopping an instance does not notify `onTrap`, and no further notifications are
sent after it is stopped. See [Stopping running instances](./stopping-running-instances.md)
for cleanup and host-owned I/O responsibilities.

If `onTrap` throws, its exception is rethrown in a microtask as an uncaught exception so
the runtime can finish unwinding the original trap. Keep the callback from throwing when
using it for logging or cleanup. Host imports throwing an error other than
`WebAssembly.RuntimeError` do not trigger `onTrap`.

[wiki-trap]: https://en.wikipedia.org/wiki/Interrupt#Terminology
