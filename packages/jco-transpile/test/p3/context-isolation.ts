import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { fileURLToPath, pathToFileURL } from 'node:url';

import { suite, test, expect, onTestFinished } from 'vitest';

import { getTmpDir } from '../helpers.js';
import { transpile, writeFiles } from '../transpilation.js';

const P3_COMPONENT_FIXTURES_DIR = fileURLToPath(new URL('../fixtures/components/p3', import.meta.url));

/** The exports of an instantiated fixture; the fixtures only pass numbers. */
type Instance = Record<string, (...args: number[]) => number | Promise<number>>;

interface FixtureOptions {
    /** Imports which suspend the calling guest stack. */
    asyncImports?: string[];
    /** Exports which run on a stack that may suspend. */
    asyncExports?: string[];
    minify?: boolean;
    /** Rewrites the generated bindings before they are loaded. */
    mutate?: (source: string) => string;
}

/**
 * Transpile a fixture for instantiation by the test, which may then create
 * several independent instances of it.
 *
 * @param fixture Name of a WAT file among the P3 component fixtures.
 * @param options How to transpile the fixture.
 * @returns A function which instantiates the component with the given imports.
 */
async function loadFixture(fixture: string, options: FixtureOptions = {}) {
    const dir = await getTmpDir();
    onTestFinished(() => rm(dir, { recursive: true, force: true }));

    const { files } = await transpile(join(P3_COMPONENT_FIXTURES_DIR, fixture), {
        name: 'component',
        instantiation: 'async',
        asyncMode: 'jspi',
        asyncImports: options.asyncImports ?? [],
        asyncExports: options.asyncExports ?? [],
        minify: options.minify ?? false,
    });
    await writeFiles(files, { baseDir: dir });

    const bindingsPath = join(dir, 'component.js');
    if (options.mutate) {
        await writeFile(bindingsPath, options.mutate(await readFile(bindingsPath, 'utf8')));
    }
    const bindings = await import(pathToFileURL(bindingsPath).href);

    return (imports: Record<string, { default: (...args: number[]) => unknown }> = {}): Promise<Instance> =>
        bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), imports);
}

/** Wait for a suspension point the test expects, failing rather than hanging. */
async function until(reached: () => boolean) {
    const deadline = Date.now() + 5000;
    while (!reached()) {
        if (Date.now() > deadline) {
            throw new Error('the expected calls did not suspend');
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

/** A host import which suspends its caller until the test releases it. */
function pausing() {
    const paused: { id: number; resume: () => void }[] = [];
    return {
        paused,
        pause: { default: (id: number) => new Promise<void>((resume) => void paused.push({ id, resume })) },

        /** Wait until `count` calls are suspended, failing rather than hanging. */
        async reached(count: number) {
            await until(() => paused.length >= count);
        },

        /** Resume the call which passed `id`, once it is suspended. */
        async release(id: number) {
            await until(() => paused.some((call) => call.id === id));
            const index = paused.findIndex((call) => call.id === id);
            paused.splice(index, 1)[0]!.resume();
        },
    };
}

/** Values for a context slot, including both ends of the signed range. */
const SLOT_VALUES: [number, number][] = [
    [11, 22],
    [-2147483648, 2147483647],
    [-1, 0],
];

suite('Context isolation (WASI P3)', () => {
    test.concurrent.each([{ minify: false }, { minify: true }])(
        'suspended calls keep their own context (minify=$minify)',
        async ({ minify }) => {
            const host = pausing();
            const resumed: number[] = [];
            const instantiate = await loadFixture('context-interleaved.wat', {
                minify,
                asyncImports: ['pause'],
                asyncExports: ['run', 'spin'],
            });
            const instance = await instantiate({
                pause: host.pause,
                mark: { default: (id: number) => void resumed.push(id) },
            });

            for (let round = 0; round < 2; round++) {
                const calls = [1, 2, 3].map((id) => instance.run(id));

                // Resume the calls one at a time, in an order which differs from
                // the order they suspended in, for both of their suspensions.
                // The guest traps if a call resumes with another's context.
                for (const id of [2, 3, 1, 3, 1, 2]) {
                    await host.release(id);
                }
                expect(await Promise.all(calls)).toEqual([1001, 1002, 1003]);
            }

            // Calls which yield to each other also resume with their own
            // context, and here they do take turns.
            const spins = [1, 2, 3].map((id) => instance.spin(id, 4));
            expect(await Promise.all(spins)).toEqual([1, 2, 3]);
            expect(resumed).toHaveLength(12);
            expect(new Set(resumed.slice(0, 3)).size).toBe(3);
        },
    );

    test.concurrent('calls released in one turn continue as their own tasks', async () => {
        const instantiate = await loadFixture('context-interleaved.wat', {
            asyncImports: ['pause'],
            asyncExports: ['run', 'spin'],
        });
        const hosts = [pausing(), pausing()];
        const [first, second] = await Promise.all(
            hosts.map((host) => instantiate({ pause: host.pause, mark: { default: () => {} } })),
        );

        // Both instances suspend a call with the same id, so they hold the
        // same values in their slots until the second pause, where each call
        // has written a value of its own. The guest traps if either instance
        // observes the other's slots, or if a call continues as the task
        // which was released last.
        const calls = [first!.run(7), second!.run(7), second!.run(8)];
        for (let pause = 0; pause < 2; pause++) {
            await hosts[0]!.reached(1);
            await hosts[1]!.reached(2);
            for (const { resume } of [...hosts[1]!.paused.splice(0).reverse(), ...hosts[0]!.paused.splice(0)]) {
                resume();
            }
        }
        expect(await Promise.all(calls)).toEqual([1007, 1007, 1008]);
    });

    test.concurrent.each([{ independent: false }, { independent: true }])(
        'tasks released in one turn keep both slots (independent instances=$independent)',
        async ({ independent }) => {
            const host = pausing();
            const instantiate = await loadFixture(independent ? 'context-interleave.wat' : 'context-callbacks.wat', {
                asyncImports: ['pause'],
            });
            const first = await instantiate({ pause: host.pause });
            const second = independent ? await instantiate({ pause: host.pause }) : first;

            for (const [left, right] of SLOT_VALUES) {
                const results = Promise.all([first.run(left), second.run(right)]);

                // Release both calls in the same turn, in reverse order. The
                // stackful fixture pauses twice.
                for (let pause = 0; pause < (independent ? 2 : 1); pause++) {
                    await host.reached(2);
                    for (const { resume } of host.paused.splice(0).reverse()) {
                        resume();
                    }
                }
                expect(await results).toEqual([left, right]);
            }
        },
    );

    test.concurrent('cooperative threads of one task have separate slots', async () => {
        const instance = await (await loadFixture('context-threads.wat'))();
        for (let round = 0; round < 10; round++) {
            expect(await instance.run()).toBe(42);
        }
    });

    test.concurrent('threads which share their slots are detected', async () => {
        // A negative control: the guest's own checks must notice a runtime
        // which gives every thread the same context slots.
        const instantiate = await loadFixture('context-threads.wat', {
            mutate(source) {
                expect(source).toContain('storage = [0, 0];');
                return `const sharedSlots = [0, 0];\n${source.replace('storage = [0, 0];', 'storage = sharedSlots;')}`;
            },
        });
        const instance = await instantiate();
        await expect(Promise.resolve().then(() => instance.run())).rejects.toThrow(WebAssembly.RuntimeError);
    });

    test.concurrent('a rejected or trapped instance does not affect another', async () => {
        const instantiate = await loadFixture('context-interleave.wat', { asyncImports: ['pause'] });

        const failing = await instantiate({ pause: { default: () => Promise.reject(new Error('host rejection')) } });
        await expect(failing.run(77)).rejects.toThrow();

        const trapped = await instantiate({ pause: { default: () => Promise.resolve() } });
        expect(() => trapped.trap()).toThrow(WebAssembly.RuntimeError);

        const healthy = await instantiate({ pause: { default: () => Promise.resolve() } });
        expect(await healthy.run(99)).toBe(99);
        expect(await healthy.run(0)).toBe(0);
    });

    test.concurrent('cancellation before a callee starts preserves the caller context', async () => {
        const instance = await (await loadFixture('context-cancel.wat'))();
        for (let round = 0; round < 8; round++) {
            expect(await instance.runRelease()).toBe(42);
        }
        expect(await instance.runPersistent()).toBe(42);
    });

    test.concurrent('cancellation resumes a started callee with its own context', async () => {
        const instance = await (await loadFixture('context-cancel-started.wat'))();
        for (let round = 0; round < 8; round++) {
            expect(await instance.runRelease()).toBe(42);
        }
    });

    test.concurrent.each([{ suspend: false }, { suspend: true }])(
        'context survives repeated host calls (suspend=$suspend)',
        async ({ suspend }) => {
            const instantiate = await loadFixture('context-boundary.wat', {
                asyncImports: suspend ? ['pause'] : [],
                asyncExports: suspend ? ['run'] : [],
            });
            const instance = await instantiate({
                pause: { default: () => (suspend ? Promise.resolve() : undefined) },
            });
            expect(await instance.run(30)).toBe(30);
            expect(await instance.run(10)).toBe(10);
        },
    );
});
