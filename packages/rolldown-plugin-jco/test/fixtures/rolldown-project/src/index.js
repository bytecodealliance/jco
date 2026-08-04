import instantiate, { add } from "./adder.wasm";

export const defaultResult = instantiate().add.add(20, 22);
export const namedResult = add.add(19, 23);
