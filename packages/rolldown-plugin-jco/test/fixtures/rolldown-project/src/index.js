import component, { add } from "./adder.wasm";

export const defaultResult = component.add.add(20, 22);
export const namedResult = add.add(19, 23);
