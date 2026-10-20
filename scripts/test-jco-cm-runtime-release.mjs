import assert from 'node:assert/strict';

import { CM_RUNTIME_API_VERSION, runtime } from '@bytecodealliance/jco-cm-runtime';

const instance = runtime.create({
    requestedApiVersion: CM_RUNTIME_API_VERSION,
    strict: false,
    flagsAsBigInt: false,
    nodejsCompat: true,
    asyncDeterminism: 'random',
});

const TABLE_FLAG = 1 << 30;
const entry = instance.intrinsics.resource.tableGet([TABLE_FLAG, 0, 7, 42 | TABLE_FLAG], 1);

assert.equal(entry.rep, 42);
assert.equal(entry.own, true);
