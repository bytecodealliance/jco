import { readFileSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assert, expect, suite, test, vi } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from './common.js';
import { composeCallerCallee, getTmpDir, nodeExec, setupAsyncTest } from './helpers.js';
import { collectUnhandledRejections, disposablePending, withTimeout } from './p3/helpers/disposal.js';

const HOST_INTERFACE = 'jco:test-components/instance-stop-host';
const RESOURCES = join(LOCAL_TEST_COMPONENTS_DIR, 'instance-stop-resources.wasm');
const SPIN = join(LOCAL_TEST_COMPONENTS_DIR, 'instance-stop-spin.wasm');
const VALUES = join(LOCAL_TEST_COMPONENTS_DIR, 'instance-stop-values.wasm');

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

    test.concurrent.each([Symbol.dispose, Symbol.asyncDispose])(
        'disposes a pending host call with %s',
        async (symbol) => {
            const started = Promise.withResolvers<void>();
            const host = disposablePending<void>(symbol, ({ reject }) => reject(new Error('host cancelled')));
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
                        completed: { default: vi.fn() },
                    },
                },
            });
            try {
                const pending = expect(instance.run()).rejects.toThrow(/instance has been stopped/);
                await withTimeout(started.promise, 'host call');
                const unhandled = await collectUnhandledRejections(async () => {
                    instance._util.stop();
                    instance._util.stop();
                    await withTimeout(Promise.all([pending, host.disposed]), 'host cancellation');
                });
                expect(unhandled).toEqual([]);
                expect(host.disposeCount()).toBe(1);
            } finally {
                instance._util.stop();
                host.resolve();
                await cleanup();
            }
        },
    );

    for (const symbol of [Symbol.dispose, Symbol.asyncDispose]) {
        test.concurrent.each(['unread', 'reading', 'trapped'])(
            `disposes a %s host future with ${String(symbol)}`,
            async (state) => {
                const host = disposablePending<number>(symbol);
                const { instance, cleanup } = await setupAsyncTest({
                    asyncMode: 'jspi',
                    component: { path: VALUES, imports: new WASIShim().getImportObject() },
                });
                try {
                    let pending;
                    if (state === 'reading') {
                        pending = expect(instance.readFuture(host.promise)).rejects.toThrow(
                            /instance has been stopped/,
                        );
                        await new Promise((resolve) => setTimeout(resolve, 20));
                    } else {
                        instance.holdFuture(host.promise);
                    }
                    if (state === 'trapped') {
                        expect(() => instance.trap()).toThrow(WebAssembly.RuntimeError);
                    }
                    instance._util.stop();
                    instance._util.stop();
                    await withTimeout(Promise.all([pending, host.disposed]), 'future disposal');
                    expect(host.disposeCount()).toBe(1);
                    host.resolve(42); // A late completion must not resume the stopped guest.
                } finally {
                    instance._util.stop();
                    host.resolve(42);
                    await cleanup();
                }
            },
        );
    }

    for (const state of ['unread', 'reading', 'trapped']) {
        test.concurrent.each(['iterator', 'readable-stream'])(`closes a ${state} host %s`, async (kind) => {
            const started = Promise.withResolvers<void>();
            const disposed = Promise.withResolvers<void>();
            const next = Promise.withResolvers<IteratorResult<number>>();
            const close = vi.fn(() => {
                disposed.resolve();
                return { done: true as const, value: undefined };
            });
            const source =
                kind === 'iterator'
                    ? {
                          [Symbol.asyncIterator]() {
                              return this;
                          },
                          next() {
                              started.resolve();
                              return next.promise;
                          },
                          return: close,
                      }
                    : new ReadableStream({
                          pull() {
                              started.resolve();
                              return next.promise.then(() => {});
                          },
                          cancel: close,
                      });
            const { instance, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: { path: VALUES, imports: new WASIShim().getImportObject() },
            });
            try {
                let pending;
                if (state === 'reading') {
                    pending = expect(instance.readStream(source)).rejects.toThrow(/instance has been stopped/);
                    await withTimeout(started.promise, 'stream read');
                } else {
                    instance.holdStream(source);
                }
                if (state === 'trapped') {
                    expect(() => instance.trap()).toThrow(WebAssembly.RuntimeError);
                }
                instance._util.stop();
                instance._util.stop();
                await withTimeout(Promise.all([pending, disposed.promise]), 'stream disposal');
                expect(close).toHaveBeenCalledTimes(1);
                next.resolve({ done: false, value: 42 });
            } finally {
                instance._util.stop();
                next.resolve({ done: true, value: undefined });
                await cleanup();
            }
        });
    }

    test.concurrent('does not dispose a host future whose value was delivered', async () => {
        const host = disposablePending<number>(Symbol.dispose);
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { path: VALUES, imports: new WASIShim().getImportObject() },
        });
        try {
            host.resolve(42);
            expect(await instance.readFuture(host.promise)).toBe(42);
            instance._util.stop();
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(host.disposeCount()).toBe(0);
        } finally {
            instance._util.stop();
            await cleanup();
        }
    });

    test.concurrent.each(['future', 'stream'])(
        'rejects host reads of an exported %s and allows Node to exit',
        async (kind) => {
            const { esModuleOutputDir, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: { path: VALUES, skipInstantiation: true },
                jco: { transpile: { extraArgs: { minify: false } } },
            });
            try {
                const script = join(esModuleOutputDir, 'check.mjs');
                await writeFile(
                    script,
                    `
                import assert from 'node:assert/strict';
                import { WASIShim } from ${JSON.stringify(import.meta.resolve('@bytecodealliance/preview2-shim/instantiation'))};
                import { instantiate } from './instance-stop-values.js';
                setTimeout(() => process.exit(1), 5_000).unref();
                const instance = await instantiate(undefined, new WASIShim().getImportObject());
                const value = await instance.${kind === 'future' ? 'makeFuture' : 'makeStream'}();
                const pending = ${kind === 'future' ? 'assert.rejects(Promise.resolve(value), /instance has been stopped/)' : 'Promise.all(Array.from({ length: 3 }, () => assert.rejects(value.read(1), /instance has been stopped/)))'};
                setTimeout(() => instance._util.stop(), 30);
                await pending;
                await assert.rejects(${kind === 'future' ? 'Promise.resolve(value)' : 'value.read(1)'}, /instance has been stopped/);
            `,
                );
                await nodeExec(script);
            } finally {
                await cleanup();
            }
        },
    );

    test.concurrent.each(['completed', 'pending', 'exported'])(
        'releases core memory with a %s future while the stopped instance remains reachable',
        async (state) => {
            const { esModuleOutputDir, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: { path: VALUES, skipInstantiation: true },
                jco: { transpile: { extraArgs: { minify: false } } },
            });
            try {
                const script = join(esModuleOutputDir, 'memory.mjs');
                await writeFile(
                    script,
                    `
                import assert from 'node:assert/strict';
                import { setTimeout as delay } from 'node:timers/promises';
                import { WASIShim } from ${JSON.stringify(import.meta.resolve('@bytecodealliance/preview2-shim/instantiation'))};
                import { instantiate } from './instance-stop-values.js';
                const memories = [];
                const instance = await instantiate(undefined, new WASIShim().getImportObject(), async (module, imports) => {
                    const core = await WebAssembly.instantiate(module, imports);
                    for (const value of Object.values(core.exports)) {
                        if (value instanceof WebAssembly.Memory) memories.push(new WeakRef(value));
                    }
                    return core;
                });
                assert.ok(memories.length);
                // Exercise the handle/buffer machinery before stopping too.
                let future;
                let pending;
                if (${JSON.stringify(state)} === 'pending') {
                    pending = assert.rejects(instance.readFuture(new Promise(() => {})), /instance has been stopped/);
                    await delay(20);
                } else if (${JSON.stringify(state)} === 'exported') {
                    future = await instance.makeFuture();
                } else {
                    await instance.readFuture(Promise.resolve(42));
                }
                instance._util.stop();
                await pending;
                for (let i = 0; i < 100; i++) {
                    await delay(10);
                    globalThis.gc();
                    if (memories.every(ref => ref.deref() === undefined)) break;
                }
                assert.ok(memories.every(ref => ref.deref() === undefined), 'stopped instance retained core memory');
                assert.throws(() => instance.trap(), /instance has been stopped/);
                if (future) await assert.rejects(Promise.resolve(future), /instance has been stopped/);
            `,
                );
                // nodeExec inherits Vitest's --expose-gc in the primary test config.
                await nodeExec('--expose-gc', script);
            } finally {
                await cleanup();
            }
        },
    );

    test.concurrent('reports async cleanup failures and continues disposing other host values', async () => {
        const { esModuleOutputDir, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { path: VALUES, skipInstantiation: true },
            jco: { transpile: { extraArgs: { minify: false } } },
        });
        try {
            const script = join(esModuleOutputDir, 'cleanup-errors.mjs');
            await writeFile(
                script,
                `
                import assert from 'node:assert/strict';
                import { setTimeout as delay } from 'node:timers/promises';
                import { WASIShim } from ${JSON.stringify(import.meta.resolve('@bytecodealliance/preview2-shim/instantiation'))};
                import { instantiate } from './instance-stop-values.js';
                const instance = await instantiate(undefined, new WASIShim().getImportObject());
                const errors = [];
                console.error = (_, error) => errors.push(error.message);
                const rejected = Object.assign(new Promise(() => {}), {
                    async [Symbol.asyncDispose]() { throw new Error('async cleanup failed'); },
                });
                const getter = Object.defineProperty(new Promise(() => {}), Symbol.dispose, {
                    get() { throw new Error('cleanup getter failed'); },
                });
                let cleaned = 0;
                const healthy = Object.assign(new Promise(() => {}), {
                    [Symbol.dispose]() { cleaned++; instance._util.stop(); },
                });
                instance.holdFuture(rejected);
                instance.holdFuture(getter);
                instance.holdFuture(healthy);
                instance.holdStream({
                    [Symbol.asyncIterator]() { return this; },
                    next() { return new Promise(() => {}); },
                    return() { throw new Error('iterator cleanup failed'); },
                });
                instance._util.stop();
                await delay(30);
                assert.deepEqual(errors.sort(), ['async cleanup failed', 'cleanup getter failed', 'iterator cleanup failed']);
                assert.equal(cleaned, 1);
                assert.throws(() => instance.trap(), /instance has been stopped/);
            `,
            );
            await nodeExec(script);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('releases imported host functions after pending calls unwind', async () => {
        const { esModuleOutputDir, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'instance-stop-host-wait.wasm'),
                skipInstantiation: true,
            },
            jco: { transpile: { extraArgs: { minify: false } } },
        });
        try {
            const script = join(esModuleOutputDir, 'host-memory.mjs');
            await writeFile(
                script,
                `
                import assert from 'node:assert/strict';
                import { setTimeout as delay } from 'node:timers/promises';
                import { WASIShim } from ${JSON.stringify(import.meta.resolve('@bytecodealliance/preview2-shim/instantiation'))};
                import { instantiate } from './instance-stop-host-wait.js';
                let wait = () => new Promise(() => {});
                const reference = new WeakRef(wait);
                const instance = await instantiate(undefined, {
                    ...new WASIShim().getImportObject(),
                    wait: { default: wait },
                    completed: { default() {} },
                });
                wait = null;
                const pending = assert.rejects(instance.run(), /instance has been stopped/);
                await delay(20);
                instance._util.stop();
                await pending;
                for (let i = 0; i < 100; i++) {
                    await delay(10);
                    globalThis.gc();
                    if (reference.deref() === undefined) break;
                }
                assert.equal(reference.deref(), undefined, 'stopped instance retained a host import');
                await assert.rejects(instance.run(), /instance has been stopped/);
            `,
            );
            await nodeExec('--expose-gc', script);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('stops direct module initialization before pending core loads complete', async () => {
        const { esModule, esModuleOutputDir, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { path: SPIN, skipInstantiation: true },
            jco: {
                transpile: {
                    extraArgs: {
                        instantiation: undefined,
                        base64Cutoff: 1_000_000_000,
                        map: Object.fromEntries(
                            ['cli', 'clocks', 'filesystem', 'io', 'random', 'sockets'].map((name) => [
                                `wasi:${name}/*`,
                                `${import.meta.resolve(`@bytecodealliance/preview2-shim/${name}`)}#*`,
                            ]),
                        ),
                    },
                },
            },
        });
        try {
            await esModule.$init;
            esModule._util.stop();
            const script = join(esModuleOutputDir, 'initialization.mjs');
            await writeFile(
                script,
                `
                import assert from 'node:assert/strict';
                import { setTimeout as delay } from 'node:timers/promises';
                const compile = WebAssembly.compile;
                const loads = [];
                const gate = Promise.withResolvers();
                WebAssembly.compile = bytes => {
                    const module = compile(bytes);
                    loads.push(module);
                    return gate.promise.then(() => module);
                };
                let instantiations = 0;
                const instantiate = WebAssembly.instantiate;
                WebAssembly.instantiate = (...args) => {
                    instantiations++;
                    return instantiate(...args);
                };
                const instance = await import('./instance-stop-spin.js');
                assert.ok(loads.length);
                const rejected = assert.rejects(instance.$init, /instance has been stopped/);
                instance._util.stop();
                await rejected;
                gate.resolve();
                await Promise.all(loads);
                await delay(30);
                assert.equal(instantiations, 0, 'late loads resumed stopped initialization');
                instance._util.stop();
            `,
            );
            await nodeExec(script);
        } finally {
            esModule._util.stop();
            await cleanup();
        }
    });
});
