import { join } from 'node:path';

import { suite, test, assert, beforeAll, afterAll } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

// Regression tests for lifting variant payloads from direct params
// (e.g. small results returned by async exports via `task.return`).
//
// In the flat representation, a variant's payload slots are the *join* of
// all case representations: a slot whose joined core type differs from the
// selected case's core type must be reinterpreted, not merely converted
// (see CanonicalABI `lift_flat_variant`). Previously any leading BigInt
// param was coerced to a Number unless the payload was exactly f64,
// breaking i64 payloads ('expected bigint' for result<u64, string>,
// option<u64>, and records with a leading u64 field), throwing for
// all-f64 joins ('Cannot convert 1.5 to a BigInt'), and silently
// corrupting all-f32 joins (1.5 -> 1.4e-45).
//
suite('async export scalar results (direct-param task.return)', () => {
    let instance, cleanup;

    beforeAll(async () => {
        const setupRes = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'async-result-scalars',
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-result-scalars.wasm'),
                imports: { ...new WASIShim().getImportObject() },
            },
        });
        instance = setupRes.instance;
        cleanup = setupRes.cleanup;
    });

    afterAll(async () => {
        await cleanup();
    });

    const api = () => instance['jco:test-components/result-scalars-api'];

    test('result<u64, string> ok', async () => {
        assert.instanceOf(api().getU64Ok, AsyncFunction);
        assert.strictEqual(await api().getU64Ok(42n), 42n);
        assert.strictEqual(await api().getU64Ok(2n ** 64n - 1n), 2n ** 64n - 1n);
    });

    test('result<u64, string> err', async () => {
        try {
            await api().getU64Err('boom');
            assert.fail('expected err result to throw');
        } catch (err) {
            assert.strictEqual(err.payload ?? err, 'boom');
        }
    });

    test('result<s64, string> ok', async () => {
        assert.strictEqual(await api().getS64Ok(-42n), -42n);
        assert.strictEqual(await api().getS64Ok(-(2n ** 63n)), -(2n ** 63n));
    });

    test('result<f64, string> ok (payload joined through i64)', async () => {
        assert.strictEqual(await api().getF64Ok(1.5), 1.5);
        assert.strictEqual(await api().getF64Ok(-0.25), -0.25);
    });

    test('result<f64, f64> ok (join stays f64)', async () => {
        assert.strictEqual(await api().getF64Only(1.5), 1.5);
    });

    test('result<f32, f32> ok (join stays f32)', async () => {
        assert.strictEqual(await api().getF32Only(1.5), 1.5);
    });

    // NOTE: non-nullable option<T> lifts are currently represented as
    // tagged objects rather than smoothed to the payload value
    test('option<u64>', async () => {
        assert.deepEqual(await api().getOptionU64(42n), { tag: 'some', val: 42n });
    });

    test('option<f64>', async () => {
        assert.deepEqual(await api().getOptionF64(2.5), { tag: 'some', val: 2.5 });
    });

    test('option<f32>', async () => {
        assert.deepEqual(await api().getOptionF32(2.5), { tag: 'some', val: 2.5 });
    });

    test('result<record{u64, u32}, string> ok (joined slots inside a record payload)', async () => {
        assert.deepEqual(await api().getRecordU64(43n), { val: 43n, tag: 7 });
    });
});
