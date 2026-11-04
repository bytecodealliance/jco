import { readFileSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assert, expect, suite, test, vi } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from './common.js';
import { composeCallerCallee, getTmpDir, nodeExec, setupAsyncTest } from './helpers.js';
import { withTimeout } from './p3/helpers/disposal.js';

const HOST_INTERFACE = 'jco:test-components/instance-stop-host';
const RESOURCES = join(LOCAL_TEST_COMPONENTS_DIR, 'instance-stop-resources.wasm');
const SPIN = join(LOCAL_TEST_COMPONENTS_DIR, 'instance-stop-spin.wasm');

class Thing {
    dispose = vi.fn();
    [Symbol.dispose]() {
        this.dispose();
    }
}

suite.skipIf(typeof WebAssembly.Suspending !== 'function')('instance stopping', () => {
    test.concurrent.each([false, true])(
        'disposes only guest-owned resources and isolates instances (minify=%s)',
        async (minify) => {
            const {
                instance: first,
                esModule,
                esModuleOutputDir,
                cleanup,
            } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: {
                    path: RESOURCES,
                    imports: {
                        ...new WASIShim().getImportObject(),
                        [HOST_INTERFACE]: { Thing, stop: vi.fn(), destroyed: vi.fn() },
                    },
                },
                jco: { transpile: { extraArgs: { minify } } },
            });
            const second = await esModule.instantiate(undefined, {
                ...new WASIShim().getImportObject(),
                [HOST_INTERFACE]: { Thing, stop: vi.fn(), destroyed: vi.fn() },
            });
            try {
                const owned = new Thing();
                const borrowed = new Thing();
                const returned = new Thing();
                const dropped = new Thing();
                const other = new Thing();
                first.hold(owned);
                first.borrow(borrowed);
                assert.strictEqual(first.giveBack(returned), returned);
                first.drop(dropped);
                second.hold(other);
                first._util.stop();
                first._util.stop();
                expect(owned.dispose).toHaveBeenCalledTimes(1);
                expect(dropped.dispose).toHaveBeenCalledTimes(1);
                expect(borrowed.dispose).not.toHaveBeenCalled();
                expect(returned.dispose).not.toHaveBeenCalled();
                expect(other.dispose).not.toHaveBeenCalled();
                assert.throws(() => first.ok(), /instance has been stopped/);
                assert.strictEqual(second.ok(), 42);
                second._util.stop();
                expect(other.dispose).toHaveBeenCalledTimes(1);
                assert.include(
                    await readFile(join(esModuleOutputDir, 'instance-stop-resources.d.ts'), 'utf8'),
                    'stop(): void',
                );
            } finally {
                first._util.stop();
                second._util.stop();
                await cleanup();
            }
        },
    );

    test.concurrent.each([false, true])('rejects guest work and allows Node to exit (minify=%s)', async (minify) => {
        const { esModuleOutputDir, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { path: SPIN, skipInstantiation: true },
            jco: { transpile: { extraArgs: { minify } } },
        });
        try {
            const script = join(esModuleOutputDir, 'check.mjs');
            await writeFile(
                script,
                `
                import assert from 'node:assert/strict';
                import { WASIShim } from ${JSON.stringify(import.meta.resolve('@bytecodealliance/preview2-shim/instantiation'))};
                import { instantiate } from './instance-stop-spin.js';
                // Fail if stopping leaves scheduler timers alive. This watchdog
                // must not itself keep the process running after a successful stop.
                setTimeout(() => process.exit(1), 5_000).unref();
                const instance = await instantiate(undefined, new WASIShim().getImportObject());
                const pending = assert.rejects(instance.instanceStopRunner.run(), /instance has been stopped/);
                setTimeout(() => instance._util.stop(), 30);
                await pending;
                assert.throws(() => instance.instanceStopRunner.ok(), /instance has been stopped/);
            `,
            );
            await nodeExec(script);
        } finally {
            await cleanup();
        }
    });

    test.concurrent.each([false, true])(
        'rejects a pending host call and ignores late completion (minify=%s)',
        async (minify) => {
            const started = Promise.withResolvers<void>();
            const host = Promise.withResolvers<void>();
            const completed = vi.fn();
            const { instance, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: {
                    path: join(LOCAL_TEST_COMPONENTS_DIR, 'instance-stop-host-wait.wasm'),
                    imports: {
                        ...new WASIShim().getImportObject(),
                        wait: {
                            default: () => {
                                started.resolve();
                                return host.promise;
                            },
                        },
                        completed: { default: completed },
                    },
                },
                jco: { transpile: { extraArgs: { minify } } },
            });
            try {
                const pending = expect(instance.run()).rejects.toThrow(/instance has been stopped/);
                await withTimeout(started.promise, 'host call');
                instance._util.stop();
                await withTimeout(pending, 'stopped guest task');
                host.resolve();
                await new Promise((resolve) => setTimeout(resolve, 30));
                expect(completed).not.toHaveBeenCalled();
            } finally {
                instance._util.stop();
                host.resolve();
                await cleanup();
            }
        },
    );

    test.concurrent('continues cleanup after disposal errors and remains stopped', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: RESOURCES,
                imports: {
                    ...new WASIShim().getImportObject(),
                    [HOST_INTERFACE]: { Thing, stop: vi.fn(), destroyed: vi.fn() },
                },
            },
        });
        try {
            const failing = new Thing();
            const other = new Thing();
            failing.dispose.mockImplementation(() => {
                instance._util.stop(); // Reentrant stop is harmless too.
                assert.throws(() => instance.ok(), /instance has been stopped/);
                throw new Error('cleanup failed');
            });
            instance.hold(failing);
            instance.hold(other);
            assert.throws(() => instance._util.stop(), AggregateError);
            instance._util.stop();
            expect(failing.dispose).toHaveBeenCalledTimes(1);
            expect(other.dispose).toHaveBeenCalledTimes(1);
        } finally {
            instance._util.stop();
            await cleanup();
        }
    });

    test.concurrent('releases resources after a guest trap', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: RESOURCES,
                imports: {
                    ...new WASIShim().getImportObject(),
                    [HOST_INTERFACE]: { Thing, stop: vi.fn(), destroyed: vi.fn() },
                },
            },
        });
        try {
            const owned = new Thing();
            instance.hold(owned);
            assert.throws(() => instance.trap(), WebAssembly.RuntimeError);
            instance._util.stop();
            expect(owned.dispose).toHaveBeenCalledTimes(1);
        } finally {
            instance._util.stop();
            await cleanup();
        }
    });

    test.concurrent.each(['sync', undefined] as const)('works with instantiation=%s', async (instantiation) => {
        const { esModule, esModuleOutputDir, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { path: SPIN, skipInstantiation: true },
            jco: {
                transpile: {
                    extraArgs: {
                        instantiation,
                        map:
                            instantiation === undefined
                                ? Object.fromEntries(
                                      ['cli', 'clocks', 'filesystem', 'io', 'random', 'sockets'].map((name) => [
                                          `wasi:${name}/*`,
                                          `${import.meta.resolve(`@bytecodealliance/preview2-shim/${name}`)}#*`,
                                      ]),
                                  )
                                : undefined,
                    },
                },
            },
        });
        try {
            await esModule.$init;
            const instance =
                instantiation === 'sync'
                    ? esModule.instantiate(
                          (path) => new WebAssembly.Module(readFileSync(join(esModuleOutputDir, path))),
                          new WASIShim().getImportObject(),
                      )
                    : esModule;
            assert.strictEqual(instance.instanceStopRunner.ok(), 42);
            instance._util.stop();
            assert.throws(() => instance.instanceStopRunner.ok(), /instance has been stopped/);
            assert.include(await readFile(join(esModuleOutputDir, 'instance-stop-spin.d.ts'), 'utf8'), 'stop(): void');
        } finally {
            await cleanup();
        }
    });

    test.concurrent('rejects pending work across composed components', async () => {
        const outputDir = await getTmpDir();
        try {
            const path = await composeCallerCallee({
                callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'instance-stop-caller.wasm'),
                calleePath: SPIN,
                outputPath: join(outputDir, 'composed.wasm'),
            });
            const { instance, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: { path, imports: new WASIShim().getImportObject() },
            });
            try {
                assert.strictEqual(await instance.instanceStopRunner.ok(), 42);
                const pending = expect(instance.instanceStopRunner.run()).rejects.toThrow(/instance has been stopped/);
                // Let the caller enter the callee and start yielding before stopping.
                await new Promise((resolve) => setTimeout(resolve, 30));
                instance._util.stop();
                await withTimeout(pending, 'stopped composed task');
                await expect(Promise.resolve().then(() => instance.instanceStopRunner.ok())).rejects.toThrow(
                    /instance has been stopped/,
                );
            } finally {
                instance._util.stop();
                await cleanup();
            }
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    });

    test.concurrent('abandons live borrows when stopped inside a host call without disposing the lender', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: RESOURCES,
                imports: {
                    ...new WASIShim().getImportObject(),
                    [HOST_INTERFACE]: { Thing, stop: () => instance._util.stop(), destroyed: vi.fn() },
                },
            },
        });
        try {
            const borrowed = new Thing();
            assert.throws(() => instance.stopWithBorrow(borrowed), /instance has been stopped/);
            expect(borrowed.dispose).not.toHaveBeenCalled();
            instance._util.stop();
        } finally {
            instance._util.stop();
            await cleanup();
        }
    });

    test.concurrent('stops an instance without exports', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'instance-stop-empty.wasm'),
                imports: new WASIShim().getImportObject(),
            },
        });
        try {
            instance._util.stop();
            instance._util.stop();
        } finally {
            await cleanup();
        }
    });

    test.concurrent.each([false, true])('skips guest destructors after stop (minify=%s)', async (minify) => {
        const destroyed = vi.fn();
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: RESOURCES,
                imports: {
                    ...new WASIShim().getImportObject(),
                    [HOST_INTERFACE]: { Thing, stop: vi.fn(), destroyed },
                },
            },
            jco: { transpile: { extraArgs: { minify } } },
        });
        try {
            const first = new instance.instanceStopGuest.Thing(7);
            first[Symbol.dispose]();
            expect(destroyed).toHaveBeenCalledExactlyOnceWith(7);
            const second = new instance.instanceStopGuest.Thing(42);
            instance._util.stop();
            second[Symbol.dispose]();
            second[Symbol.dispose]();
            expect(destroyed).toHaveBeenCalledTimes(1);
        } finally {
            instance._util.stop();
            await cleanup();
        }
    });
});
