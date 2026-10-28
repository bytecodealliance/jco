import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { componentWitMetadataForWorld } from '../src/wasm-tools.js';

const witPath = fileURLToPath(new URL('./fixtures/wit/world-metadata/world-metadata.wit', import.meta.url));

const PACKAGED = {
    namespace: 'local',
    package: 'metadata',
    interface: 'packaged',
    version: { major: 1n, minor: 2n, patch: 3n, pre: undefined, build: undefined },
};

suite('WIT world metadata', () => {
    test.concurrent('reports packaged interfaces by package and inline interfaces by world key name', async () => {
        const metadata = await componentWitMetadataForWorld({ tag: 'path', val: witPath }, 'test');

        assert.deepStrictEqual(metadata.imports, [
            {
                namespace: 'wasi',
                package: 'cli',
                interface: 'environment',
                version: { major: 0n, minor: 2n, patch: 3n, pre: undefined, build: undefined },
            },
            // Inline interfaces have no package; they are known by their world key name.
            { namespace: undefined, package: undefined, interface: 'log', version: undefined },
            PACKAGED,
        ]);
        // World-level functions such as `now` are not interfaces and are not reported.
        assert.deepStrictEqual(metadata.exports, [
            { namespace: undefined, package: undefined, interface: 'api', version: undefined },
            PACKAGED,
        ]);
    });
});
