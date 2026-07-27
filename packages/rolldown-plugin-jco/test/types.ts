import "../wasm.d.ts";

import component from "../../../examples/transpile/adder/adder.wasm";
import markedComponent from "../../../examples/transpile/adder/adder.wasm?component";

component.add.add(1, 2);
markedComponent.add.add(3, 4);
