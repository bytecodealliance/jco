/** Check that the component build names its assets in a form bundlers can resolve. */
import { readdir, readFile } from 'node:fs/promises';

import { assert, suite, test } from 'vitest';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

suite('the component build, for bundlers', () => {
    test.concurrent('has no URL built from a template, which a bundler globs for', async () => {
        for (const path of ['../dist/component.js', '../vendor/js-component-bindgen-component-instantiation.js']) {
            assert.notMatch(await read(path), /new URL\(\s*`/, path);
        }
    });

    test.concurrent('names every core module it can be asked for', async () => {
        const source = await read('../dist/component.js');
        const vendor = await readdir(new URL('../vendor/', import.meta.url));
        const modules = vendor.filter((name) => /^js-component-bindgen-component\.core\d*\.wasm$/.test(name));
        assert.isNotEmpty(modules);
        for (const name of modules) {
            assert.include(source, `new URL('../vendor/${name}', import.meta.url)`);
        }
    });
});
