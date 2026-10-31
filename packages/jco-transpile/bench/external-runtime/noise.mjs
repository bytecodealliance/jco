// Code-only noise control: identical in both modes; no component or core Wasm.
export function instantiate() {
    return { scalar: (value) => value + 1 };
}
