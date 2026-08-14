# Detecting Traps

While some errors are represented at the WIT type level and expected, some internal errors
may cause a component instance to [trap][wiki-trap]. Jco-generated bindings report the
component-model traps they detect with the built-in `WebAssembly.RuntimeError` class.

After an instance has trapped, Jco marks the component instance as unusable. Any subsequent
call throws the original trap without re-entering the component.

To detect these traps, use the built-in `WebAssembly.RuntimeError` class:

```js
import { instantiate } from "./dist/transpiled/component.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const shim = new WASIShim().getImportObject();
const instance = await instantiate(undefined, shim);

try {
    instance['ns:pkg/iface'].someFunction();
} catch (err) {
    if (err instanceof WebAssembly.RuntimeError) {
        console.error(`TRAP: ${err}`);
        // The instance is now disabled and cannot be called again.
    } else {
        // Other exceptions are unexpected and should be handled separately.
        throw err;
    }
}
```

WIT `result<T, E>` values remain part of the component's normal return contract and are not
thrown as `WebAssembly.RuntimeError` instances.

[wiki-trap]: https://en.wikipedia.org/wiki/Interrupt#Terminology
