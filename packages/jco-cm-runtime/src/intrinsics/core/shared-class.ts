/**
 * Present a function that constructs a class for one context as that class.
 *
 * A component instance initializes each runtime class with a context of its own.
 * Defining the class anew for each context is costly once two instances share this
 * runtime: engines share inline caches between the copies of a class body, while
 * every copy has private names of its own, so accesses to `#private` fields stop
 * being cacheable for all of them. Such classes are therefore defined once, take
 * their context as a constructor argument, and each context gets a small function
 * that supplies it.
 *
 * The function keeps what callers rely on from a class of their own: it is a
 * distinct constructor, and it carries its own copies of the static members given
 * in `statics`; other static members are inherited from the shared class. Given
 * `isInstance`, `instanceof` holds only for the instances it constructed; without
 * it, `instanceof` holds for every instance of the shared class, and no ambient
 * `Symbol` is needed.
 *
 * @param bound - function that returns `new shared(context, ...)` for one context
 * @param shared - the class defined once
 * @param isInstance - whether a value was constructed by `bound`, if `instanceof` is to tell
 * @param statics - static members that belong to `bound` alone
 * @returns `bound`, typed as the constructor it stands in for
 */
export function asConstructorOf<Constructor>(
    bound: (...args: never[]) => object,
    shared: abstract new (...args: never[]) => object,
    isInstance?: (value: unknown) => boolean,
    statics: PropertyDescriptorMap = {},
): Constructor {
    bound.prototype = shared.prototype;
    Object.setPrototypeOf(bound, shared);
    Object.defineProperties(bound, statics);
    if (isInstance !== undefined) {
        Object.defineProperty(bound, Symbol.hasInstance, { value: isInstance });
    }
    return bound as unknown as Constructor;
}
