import component, { component as namedComponent } from "./adder.wasm";

export const defaultResult = component.add.add(20, 22);
export const namedResult = namedComponent.add.add(19, 23);
