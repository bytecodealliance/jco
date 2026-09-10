import * as predicates from "./util/types.js";
export * from "./util/types.js";

const types = { ...predicates };
Object.defineProperties(types, {
  isCryptoKey: {
    value: predicates.isCryptoKey,
    enumerable: true,
    writable: false,
    configurable: false,
  },
  isKeyObject: {
    value: predicates.isKeyObject,
    enumerable: true,
    writable: false,
    configurable: false,
  },
});
export default types;
