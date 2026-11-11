/** Check that Jco's own tools read host paths without granting them to other components. */
import { fileURLToPath } from 'node:url';

import { preopens } from '@bytecodealliance/preview2-shim/filesystem';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { assert, suite, test } from 'vitest';

import { generateHostTypes } from '../src/typegen.js';
import { transpileBytes } from '../src/transpile.js';
import { componentEmbed, componentNew, componentWitMetadataForWorld } from '../src/wasm-tools.js';

const witPath = fileURLToPath(new URL('./fixtures/wit/world-metadata/world-metadata.wit', import.meta.url));

function assertNoGlobalPreopens() {
    assert.lengthOf(preopens.getDirectories(), 0, 'the global shim has no preopens');
    assert.lengthOf(
        new WASIShim().getImportObject()['wasi:filesystem/preopens'].getDirectories(),
        0,
        'a default WASIShim has no preopens',
    );
}

suite('tool filesystem access', () => {
    test('reading WIT from a host path leaves the global shim without preopens', async () => {
        assertNoGlobalPreopens();

        // wasm-tools component
        const metadata = await componentWitMetadataForWorld({ tag: 'path', val: witPath }, 'test');
        assert.isNotEmpty(metadata.imports);
        const component = await componentNew(await componentEmbed({ witPath, world: 'test', dummy: true }));
        assertNoGlobalPreopens();

        // bindgen component
        const types = await generateHostTypes(witPath, { worldName: 'test' });
        assert.isNotEmpty(Object.keys(types));
        await transpileBytes(component, { name: 'tool-filesystem' });
        assertNoGlobalPreopens();
    });
});
