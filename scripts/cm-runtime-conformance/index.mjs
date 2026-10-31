import { testLiftIntrinsics } from './lift.mjs';
import { testHostIntrinsics } from './host.mjs';
import { testAsyncTaskIntrinsics } from './async-task.mjs';
import { testErrorContextIntrinsics } from './error-context.mjs';
import { testWaitableIntrinsics } from './waitable.mjs';
import { testCoreIntrinsics } from './core.mjs';
import { testWebidlIntrinsics } from './webidl.mjs';
import { testStringIntrinsics } from './string.mjs';
import { testJsHelperIntrinsics } from './js-helper.mjs';
import { testConversionIntrinsics } from './conversion.mjs';
import { createRuntimeLoader } from './loader.mjs';
import { testResourceIntrinsics } from './resource.mjs';
import { testRuntimeApiVersion, testRuntimeExports } from './runtime.mjs';

export const DEFAULT_RUNTIME_BASE = '@bytecodealliance/jco-cm-runtime';

// Each family owns its operation tests. Future cross-family groups use the same interface.
const TEST_GROUPS = new Map([
    ['runtime', testRuntimeExports],
    ['resource', testResourceIntrinsics],
    ['lift', testLiftIntrinsics],
    ['host', testHostIntrinsics],
    ['async-task', testAsyncTaskIntrinsics],
    ['error-context', testErrorContextIntrinsics],
    ['waitable', testWaitableIntrinsics],
    ['core', testCoreIntrinsics],
    ['webidl', testWebidlIntrinsics],
    ['string', testStringIntrinsics],
    ['js-helper', testJsHelperIntrinsics],
    ['conversion', testConversionIntrinsics],
]);
export const DEFAULT_GROUPS = Object.freeze([...TEST_GROUPS.keys()]);

export async function runRuntimeConformance({ base = DEFAULT_RUNTIME_BASE, groups = DEFAULT_GROUPS } = {}) {
    const selected = [...new Set(groups)];
    if (selected.length === 0) {
        throw new TypeError('at least one conformance group must be selected');
    }
    for (const group of selected) {
        if (!TEST_GROUPS.has(group)) {
            throw new TypeError(`unknown runtime conformance group: ${group}`);
        }
    }
    const load = createRuntimeLoader(base);
    const runtime = await load('runtime');
    testRuntimeApiVersion(runtime, 1);
    for (const group of selected) {
        try {
            await TEST_GROUPS.get(group)({ load, runtime });
        } catch (cause) {
            throw new Error(`runtime conformance failed for ${base} (${group}): ${cause.message}`, { cause });
        }
    }
    return { base, groups: selected };
}
