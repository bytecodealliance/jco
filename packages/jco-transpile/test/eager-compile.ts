import { expect, test } from 'vitest';

import { parse } from '../src/wasm-tools.js';
import { transpileBytes } from './transpilation.js';

test.concurrent.each([false, true])('eager compilation preserves the generated files (minify=%s)', async (minify) => {
    const component = await parse(`(component
        (core module $m (func (export "answer") (result i32) i32.const 42))
        (core instance $i (instantiate $m))
        (func (export "answer") (result u32) (canon lift (core func $i "answer"))))`);
    const options = { name: 'example', minify, base64Cutoff: 0 };
    const ordinary = await transpileBytes(component, options);
    const hinted = await transpileBytes(component, { ...options, eagerCompile: true });
    const prefix = new TextEncoder().encode('//# allFunctionsCalledOnLoad\n');
    expect(ordinary.files['example.js']).toBeDefined();
    expect(Object.keys(hinted.files).sort()).toEqual(Object.keys(ordinary.files).sort());
    expect(Object.keys(ordinary.files).some((name) => name.endsWith('.wasm'))).toBe(true);
    for (const [name, bytes] of Object.entries(ordinary.files)) {
        if (name === 'example.js') {
            expect(bytes.subarray(0, prefix.length)).not.toEqual(prefix);
            expect(hinted.files[name].subarray(0, prefix.length)).toEqual(prefix);
            expect(hinted.files[name].subarray(prefix.length)).toEqual(bytes);
        } else {
            expect(hinted.files[name]).toEqual(bytes);
        }
    }
});
