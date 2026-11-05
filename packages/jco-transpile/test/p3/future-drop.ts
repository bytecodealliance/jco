/** Exercise host and guest future disposal, resource ownership, and process exit. */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { afterAll, assert, beforeAll, suite, test } from 'vitest';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

const WRITE_PENDING = -2;
const WRITE_COMPLETED = 0;
const WRITE_DROPPED = 1;

const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

suite('dropping the readable end the host holds', () => {
    let esModule;
    let esModuleOutputPath;
    let cleanup;

    beforeAll(async () => {
        ({ esModule, esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: {
                name: 'future-drop',
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'future-drop.wasm'),
                skipInstantiation: true,
            },
        }));
    });

    afterAll(async () => {
        await cleanup?.();
    });

    /** A new instance, and the things it made with how often they were disposed. */
    async function setup() {
        const things = { made: 0, disposed: 0 };
        class Thing {
            constructor() {
                things.made += 1;
            }
            [Symbol.dispose]() {
                things.disposed += 1;
            }
        }
        const instance = await esModule.instantiate(undefined, {
            ...new WASIShim().getImportObject(),
            'jco:test-components/future-drop-host': { Thing },
        });
        return { instance, things };
    }

    // A future from an async call and from a sync one are held the same way. An
    // async function can't return a future without reading it, so it comes in a box.
    suite.each([
        ['async', async (instance, writeNow) => ({ future: await instance.openFuture(writeNow) })],
        [
            'sync',
            async (instance, writeNow) => {
                await instance.prepare(writeNow);
                return { future: instance.takeFuture() };
            },
        ],
    ])('a future returned from a %s call', (_, open) => {
        test.concurrent('holding it reads nothing', async () => {
            const { instance, things } = await setup();
            await open(instance, true);
            await pause();
            assert.strictEqual(instance.writeResult(), WRITE_PENDING);
            assert.strictEqual(things.disposed, 0);
        });

        test.concurrent('dropping it ends the write, leaving the handle with the writer', async ({ expect }) => {
            const { instance, things } = await setup();
            const { future } = await open(instance, true);
            await pause();

            future[Symbol.dispose]();
            future[Symbol.dispose]();
            await pause();
            await expect.poll(() => instance.writeResult()).toBe(WRITE_DROPPED);
            assert.strictEqual(things.disposed, 0);

            instance.dropWritten();
            assert.strictEqual(things.disposed, 1);
        });

        test.concurrent('a guest reader dropping it ends the write', async ({ expect }) => {
            const { instance, things } = await setup();
            const { future } = await open(instance, true);
            await pause();

            await instance.discard(future);
            await pause();
            await expect.poll(() => instance.writeResult()).toBe(WRITE_DROPPED);

            instance.dropWritten();
            assert.strictEqual(things.disposed, 1);
        });

        test.concurrent('dropping it rejects a read still waiting, and a later write is dropped', async ({
            expect,
        }) => {
            const { instance, things } = await setup();
            const { future } = await open(instance, false);
            const read = new Promise((resolve, reject) => future.then(resolve, reject));
            await pause();

            future[Symbol.dispose]();
            let error;
            await read.catch((err) => (error = err));
            assert.instanceOf(error, Error);

            await instance.writeFuture();
            await expect.poll(() => instance.writeResult()).toBe(WRITE_DROPPED);

            instance.dropWritten();
            assert.strictEqual(things.disposed, 1);
        });

        test.concurrent('dropping it after a read disposes the value, and reads no more', async ({ expect }) => {
            const { instance, things } = await setup();
            const { future } = await open(instance, true);
            await future;
            await pause();
            await expect.poll(() => instance.writeResult()).toBe(WRITE_COMPLETED);
            assert.strictEqual(things.disposed, 0);

            future[Symbol.dispose]();
            future[Symbol.dispose]();
            await pause();
            assert.strictEqual(things.disposed, 1);

            let error;
            await new Promise((resolve) => future.then(resolve, (err) => resolve((error = err))));
            assert.instanceOf(error, Error);
        });

        test.concurrent('a guest reader dropping it after a read disposes the value', async () => {
            const { instance, things } = await setup();
            const { future } = await open(instance, true);
            await future;
            assert.strictEqual(things.disposed, 0);

            await instance.discard(future);
            await pause();
            assert.strictEqual(things.disposed, 1);
        });
    });

    suite('a stream', () => {
        test.concurrent('return() ends the write, leaving the handle with the writer', async ({ expect }) => {
            const { instance, things } = await setup();
            const reader = (await instance.openStream())[Symbol.asyncIterator]();
            await pause();
            assert.strictEqual(instance.writeResult(), WRITE_PENDING);

            await reader.return();
            await pause();
            await expect.poll(() => instance.writeResult()).toBe(WRITE_DROPPED);
            assert.strictEqual(things.disposed, 0);

            instance.dropWritten();
            assert.strictEqual(things.disposed, 1);
            assert.isTrue((await reader.next()).done);
        });

        test.concurrent('return() ends a read still waiting, and a later write is dropped', async ({ expect }) => {
            const { instance, things } = await setup();
            const reader = (await instance.openStreamIdle())[Symbol.asyncIterator]();
            const read = reader.next();
            await pause();

            await reader.return();
            assert.isTrue((await read).done);

            await instance.writeStream();
            await expect.poll(() => instance.writeResult()).toBe(WRITE_DROPPED);

            instance.dropWritten();
            assert.strictEqual(things.disposed, 1);
        });
    });

    // Nothing here calls process.exit: the process ends when no timer is left.
    test.concurrent.each([
        ['a dropped future', 'await r.prepare(true); r.takeFuture()[Symbol.dispose]();'],
        ['a future dropped by a guest', 'await r.prepare(true); await r.discard(r.takeFuture());'],
        [
            'a future dropped during a read',
            `await r.prepare(false);
             const future = r.takeFuture();
             future.then(() => {}, () => {});
             await new Promise((resolve) => setTimeout(resolve, 20));
             future[Symbol.dispose]();`,
        ],
        ['a stream returned', 'await (await r.openStream())[Symbol.asyncIterator]().return();'],
    ])('nothing is left keeping the process alive after %s', async (_, body) => {
        const script = `
            import { WASIShim } from ${JSON.stringify(import.meta.resolve('@bytecodealliance/preview2-shim/instantiation'))};
            const { instantiate } = await import(process.argv[1]);
            class Thing {}
            const r = await instantiate(undefined, { ...new WASIShim().getImportObject(), 'jco:test-components/future-drop-host': { Thing } });
            ${body}
        `;
        await promisify(execFile)(
            process.execPath,
            ['--no-warnings', '--input-type=module', '-e', script, esModuleOutputPath],
            { timeout: 20_000 },
        );
    });
});
