/**
 * Give a store's subclass its own static state while sharing implementation methods.
 * Real subclasses preserve prototype overrides, new.target and ordinary instanceof.
 *
 * @param constructor - the store's subclass of a shared implementation
 * @param statics - static members owned by this store
 * @returns the constructor with the public runtime constructor type
 */
export function withConstructorStatics<Constructor>(
    constructor: abstract new (...args: never[]) => object,
    statics: PropertyDescriptorMap,
): Constructor {
    Object.defineProperties(constructor, statics);
    return constructor as unknown as Constructor;
}
