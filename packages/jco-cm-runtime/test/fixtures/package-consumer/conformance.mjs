import assert from 'node:assert/strict';

import { runRuntimeConformance } from './smoke.mjs';
import { DEFAULT_GROUPS } from './cm-runtime-conformance/index.mjs';

for (const base of [
    'test-runtime-alias',
    './node_modules/test-runtime-alias/dist',
    new URL('./node_modules/test-runtime-alias/dist/', import.meta.url),
]) {
    const result = await runRuntimeConformance({ base });
    assert.deepEqual(result.groups, DEFAULT_GROUPS);
}

const resource = await runRuntimeConformance({ base: 'test-runtime-alias', groups: ['resource', 'resource'] });
assert.deepEqual(resource.groups, ['resource']);
await assert.rejects(
    runRuntimeConformance({ base: 'not-installed', groups: ['unknown'] }),
    /unknown runtime conformance group: unknown/,
);
await assert.rejects(runRuntimeConformance({ groups: [] }), /at least one conformance group/);
await assert.rejects(
    runRuntimeConformance({ base: new URL('./invalid-version/', import.meta.url) }),
    /runtime API version/,
);
await assert.rejects(
    runRuntimeConformance({ base: new URL('./invalid-resource/', import.meta.url), groups: ['resource'] }),
    /conformance failed.*\(resource\).*tableGet owned entry/,
);
