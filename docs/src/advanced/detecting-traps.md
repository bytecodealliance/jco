# Detecting Traps

While some errors are represented at the WIT type level and expected, some internal errors
may cause a component instance to [trap][wiki-trap]. Jco-generated bindings report the
component-model traps they detect with the exported `_util.TrapError` class.

After an instance has trapped, Jco marks the component instance as unusable. Any subsequent
call throws the original trap without re-entering the component.

To detect these traps, use the `_util.TrapError` class:

```js
import { instantiate, _util } from "./dist/transpiled/component.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const shim = new WASIShim().getImportObject();
const instance = await instantiate(undefined, shim);

try {
    instance['ns:pkg/iface'].someFunction();
} catch (err) {
    if (err instanceof _util.TrapError) {
        console.error(`TRAP: ${err}`);
        // The instance is now disabled and cannot be called again.
    } else {
        // Other exceptions are unexpected and should be handled separately.
        throw err;
    }
}
```

WIT `result<T, E>` values remain part of the component's normal return contract and are not
thrown as `TrapError` instances.

[wiki-trap]: https://en.wikipedia.org/wiki/Interrupt#Terminology
