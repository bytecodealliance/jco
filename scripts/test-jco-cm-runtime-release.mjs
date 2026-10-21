import assert from 'node:assert/strict';

import * as root from '@bytecodealliance/jco-cm-runtime';
import { CM_RUNTIME_API_VERSION } from '@bytecodealliance/jco-cm-runtime/runtime';
import { tableGet } from '@bytecodealliance/jco-cm-runtime/intrinsics/resource';

assert.equal(CM_RUNTIME_API_VERSION, 2);
assert.deepEqual(Object.keys(root), ['CM_RUNTIME_API_VERSION']);
assert.equal(root.CM_RUNTIME_API_VERSION, CM_RUNTIME_API_VERSION);
const context = { RuntimeError: WebAssembly.RuntimeError };
assert.deepEqual(tableGet(context, [1 << 30, 0, 7, 42 + 2 ** 32], 1), { rep: 42, scope: 7, own: true });
assert.throws(() => tableGet(context, [1 << 30, 0], 0), WebAssembly.RuntimeError);
