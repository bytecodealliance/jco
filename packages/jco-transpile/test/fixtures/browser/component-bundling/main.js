/** Load the bundled transpiler and expose an empty-component transpilation result to the browser test. */
import { callBindgen, generate } from '../../../../dist/component.js';

// Compile a minimal component to exercise the emitted core Wasm assets.
const component = new Uint8Array([0, 97, 115, 109, 13, 0, 1, 0]);
globalThis.componentBundling = callBindgen(() => generate(component, { name: 'empty', map: [] }))
    .then((result) => ({ files: result.files.map(([name]) => name) }))
    .catch((error) => ({ error: String(error) }));
