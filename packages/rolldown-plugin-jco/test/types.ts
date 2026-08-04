import "../wasm.d.ts";

import instantiate from "../../../examples/transpile/adder/adder.wasm";
import instantiateMarked from "../../../examples/transpile/adder/adder.wasm?component";

instantiate().add.add(1, 2);
instantiateMarked().add.add(3, 4);
