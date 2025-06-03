const registry = new FinalizationRegistry((dispose) => dispose());

// While strictly speaking all components should handle their disposal,
// this acts as a last-resort to catch all missed drops through the JS GC.
// Mainly for two cases - (1) components which are long lived, that get shut
// down and (2) users that interface with low-level WASI APIs directly in JS
// for various reasons may end up leaning on JS GC inadvertantly.

export function registerDispose(resource, parent = null, id, disposeFn) {
    const dummySymbol = Symbol();

    const finalizer = () => {
        if (parent?.[dummySymbol]) return;
        disposeFn(id);
    };

    registry.register(resource, finalizer, finalizer);
    return finalizer;
}

export function earlyDispose(finalizer) {
    registry.unregister(finalizer);
    finalizer();
}
