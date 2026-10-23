import { expect, test, vi } from 'vitest';

import { transpileBytes } from '../src/transpile.js';

// Exercise the real minifier with malformed generator output. Parser diagnostics
// must reach the caller instead of publishing an empty module without exports.
vi.mock('../vendor/js-component-bindgen-component.js', () => ({
    $init: Promise.resolve(),
    generate: () => ({
        files: [['component.js', new TextEncoder().encode('export function instantiate( {')]],
        imports: [],
        exports: [],
    }),
}));

test.concurrent('minification reports invalid generated JavaScript', async () => {
    await expect(transpileBytes(new Uint8Array(), { name: 'component', minify: true })).rejects.toThrow(
        /Failed to minify generated JavaScript:/,
    );
});
