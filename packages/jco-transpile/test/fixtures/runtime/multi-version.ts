// Flags:

// @ts-expect-error
const wasm = await import('../js-test-components/multi-version/multi-version.js');

wasm.test();
