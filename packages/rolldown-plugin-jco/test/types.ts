import "../wasm.d.ts";

import instantiate from "../../../examples/transpile/adder/adder.wasm";
import instantiateMarked from "../../../examples/transpile/adder/adder.wasm?component";

instantiate().add.add(1, 2);
instantiateMarked().add.add(3, 4);

declare const load: (url: URL) => WebAssembly.Module;
instantiate(load, {}, undefined, { shim: { globals: { WebAssembly } } });
instantiateMarked(load, {}, undefined, { shim: { globals: { WebAssembly } } });
