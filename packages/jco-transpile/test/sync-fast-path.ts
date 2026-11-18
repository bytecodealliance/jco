import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { transpileBytes, writeFiles } from './transpilation.js';
import type { TranspilationOptions } from '../src/transpile.js';
import { parse } from '../src/wasm-tools.js';
import { COMPONENT_FIXTURES_DIR } from './common.js';
import { getTmpDir } from './helpers.js';

const FIXTURE = join(COMPONENT_FIXTURES_DIR, 'sync-fast-path', 'calls.wat');

/** What a call did: the value it returned, or the error it threw. */
type Outcome = { value: unknown } | { throws: string; message: string; trap: boolean };

/** Everything a scenario lets a host observe. */
interface Observation {
    /** What the scenario returned. */
    outcome: unknown;
    /** What the host functions and resource destructors saw, in order. */
    log: unknown[];
    /** The traps reported to `onTrap`. */
    traps: Outcome[];
}

/** The functions of the `host` import, replaceable by a scenario. */
interface Host {
    double: (value: number) => unknown;
    notify: (code: number) => unknown;
    fallible: (value: number) => unknown;
    name: () => unknown;
    inspect: (thing: unknown) => unknown;
}

// oxlint-disable-next-line typescript/no-explicit-any -- generated bindings are untyped here
type Instance = any;

interface Context {
    instance: Instance;
    host: Host;
    log: unknown[];
}

/** Describe a thrown value without its identity or stack, which differ between instances. */
function describeError(error: unknown): Outcome {
    return {
        throws: (error as Error)?.constructor?.name ?? typeof error,
        message: String((error as Error)?.message ?? error),
        trap: error instanceof WebAssembly.RuntimeError,
    };
}

/** Call `fn`, capturing what it returns or throws. */
function attempt(fn: () => unknown): Outcome {
    try {
        return { value: fn() };
    } catch (error) {
        return describeError(error);
    }
}

/** A host resource that logs its disposal, and may act during it. */
class Thing {
    #log: unknown[];
    #onDispose?: () => void;

    constructor(log: unknown[], onDispose?: () => void) {
        this.#log = log;
        this.#onDispose = onDispose;
    }

    [Symbol.dispose]() {
        this.#log.push('dispose');
        this.#onDispose?.();
    }
}

/**
 * Sequences of calls whose every observable effect must not depend on the fast path.
 * Most end with `add`, which shows whether the instance can still be entered.
 */
const SCENARIOS: Record<string, (context: Context) => unknown> = {
    'values round-trip': ({ instance }) => [
        instance.add(1, 2),
        instance.add(4294967295, 1),
        instance.callDouble(21),
        instance.echo('héllo wörld ✓'),
        instance.echo(''),
        instance.echoName(),
        instance.callFallible(5),
    ],
    'an invalid argument is rejected before the call': ({ instance }) => [
        attempt(() => instance.echo(Symbol('x'))),
        attempt(() => instance.add(1, 2)),
    ],
    'a guest trap poisons the instance': ({ instance }) => [
        attempt(() => instance.trap()),
        attempt(() => instance.add(1, 2)),
        attempt(() => instance.callDouble(1)),
    ],
    'a guest division by zero poisons the instance': ({ instance }) => [
        attempt(() => instance.divide(1, 0)),
        attempt(() => instance.add(1, 2)),
    ],
    'a host import re-enters the instance': ({ instance, host, log }) => {
        host.notify = (code) => log.push(['notify', code, attempt(() => instance.add(code, 1))]);
        return [attempt(() => instance.notifyTwice(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'a host import swallows the trap of a nested call': ({ instance, host, log }) => {
        host.double = (value) => {
            log.push(attempt(() => instance.trap()));
            return value;
        };
        return [attempt(() => instance.callDouble(1)), attempt(() => instance.add(1, 2))];
    },
    'a host import throws an error': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            throw new Error('host failure');
        };
        return [attempt(() => instance.notifyTwice(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'a host import throws a range error': ({ instance, host }) => {
        host.double = () => {
            throw new RangeError('out of range');
        };
        return [attempt(() => instance.callDouble(1)), attempt(() => instance.add(1, 2))];
    },
    'a host import throws a trap': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            throw new WebAssembly.RuntimeError('host trap');
        };
        return [attempt(() => instance.notifyTwice(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'a host import returns values of the wrong type': ({ instance, host }) => {
        host.double = () => 'not a number';
        host.name = () => 42;
        return [
            attempt(() => instance.callDouble(1)),
            attempt(() => instance.echoName()),
            attempt(() => instance.add(1, 2)),
        ];
    },
    'a host import returns a promise': async ({ instance, host, log }) => {
        host.double = (value) => Promise.resolve(value * 2);
        host.notify = (code) => {
            log.push(['notify', code]);
            return sleep(1);
        };
        host.name = () => Promise.resolve('later');
        const outcomes = [
            attempt(() => instance.callDouble(1)),
            attempt(() => instance.notifyTwice(1, 2)),
            attempt(() => instance.echoName()),
            attempt(() => instance.add(1, 2)),
        ];
        await sleep(20);
        return [...outcomes, attempt(() => instance.add(2, 2))];
    },
    'a host import returns a thenable': ({ instance, host }) => {
        host.double = () => ({ then: () => {}, valueOf: () => 5 });
        return [attempt(() => instance.callDouble(1))];
    },
    'a host import of a result type throws': ({ instance, host }) => {
        host.fallible = (value) => {
            switch (value) {
                case 1:
                    throw new Error('nope');
                case 2:
                    throw 'plain string';
                case 3:
                    throw new WebAssembly.RuntimeError('trap in fallible');
                default:
                    return value;
            }
        };
        return [0, 1, 2, 3, 4].map((value) => attempt(() => instance.callFallible(value)));
    },
    'post-return runs once per call': ({ instance }) => {
        const before = instance.postReturns();
        instance.echo('a');
        instance.echo('b');
        return [before, instance.postReturns()];
    },
    'a trap in post-return poisons the instance': ({ instance }) => {
        instance.setTrapInPostReturn(1);
        return [attempt(() => instance.echo('a')), attempt(() => instance.add(1, 2))];
    },
    'an invalid result is rejected': ({ instance }) => [
        attempt(() => instance.badString()),
        attempt(() => instance.add(1, 2)),
    ],
    'realloc may not leave while an export lowers its arguments': ({ instance, host, log }) => {
        host.notify = (code) => log.push(['notify', code]);
        instance.setNotifyOnRealloc(1);
        return [attempt(() => instance.echo('a')), attempt(() => instance.add(1, 2))];
    },
    'realloc may not leave while an import lowers its results': ({ instance, host, log }) => {
        host.notify = (code) => log.push(['notify', code]);
        instance.setNotifyOnRealloc(1);
        return [attempt(() => instance.echoName()), attempt(() => instance.add(1, 2))];
    },
    'a stopped instance cannot be entered': ({ instance }) => {
        instance._util.stop();
        return [attempt(() => instance.add(1, 2)), attempt(() => instance.callDouble(1))];
    },
    'a host import stops the instance': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            instance._util.stop();
        };
        return [attempt(() => instance.notifyTwice(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'a host import stops the instance and throws': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            instance._util.stop();
            throw new Error('after stop');
        };
        return [attempt(() => instance.notifyTwice(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'a resource destructor stops the instance': ({ instance, log }) => {
        const thing = new Thing(log, () => instance._util.stop());
        return [attempt(() => instance.consumeThing(thing)), attempt(() => instance.add(1, 2))];
    },
    'whenIdle settles after the call that is running': async ({ instance, host, log }) => {
        let idle: Promise<unknown> | undefined;
        host.notify = (code) => {
            if (code === 1) {
                idle = instance._util.whenIdle().then(() => log.push('idle'));
            }
            log.push(['notify', code]);
        };
        const outcome = attempt(() => instance.notifyTwice(1, 2));
        log.push('returned');
        await idle;
        await instance._util.whenIdle();
        log.push('idle again');
        return outcome;
    },
    'handles are borrowed, owned and dropped': ({ instance, log }) => {
        const thing = new Thing(log);
        return [
            attempt(() => instance.inspectThing(thing)),
            attempt(() => instance.inspectThing(thing)),
            attempt(() => instance.consumeThing(thing)),
            attempt(() => instance.add(1, 2)),
        ];
    },
    'a borrow is not dropped by the guest': ({ instance, log }) => {
        const thing = new Thing(log);
        return [
            attempt(() => instance.leakThing(thing)),
            attempt(() => instance.add(1, 2)),
            attempt(() => instance.inspectThing(thing)),
        ];
    },
    'a value that is not the resource is rejected': ({ instance }) => [
        attempt(() => instance.inspectThing({})),
        attempt(() => instance.consumeThing(null)),
        attempt(() => instance.add(1, 2)),
    ],
    'dropping an unknown handle traps': ({ instance }) => [
        attempt(() => instance.dropMissing()),
        attempt(() => instance.add(1, 2)),
    ],
    'a resource destructor throws': ({ instance, log }) => {
        const thing = new Thing(log, () => {
            throw new Error('dispose failed');
        });
        return [attempt(() => instance.consumeThing(thing)), attempt(() => instance.add(1, 2))];
    },
    'a resource destructor re-enters the instance': ({ instance, log }) => {
        const thing = new Thing(log, () => log.push(attempt(() => instance.add(3, 4))));
        return [attempt(() => instance.consumeThing(thing)), attempt(() => instance.add(1, 2))];
    },
};

/** Bindings of the fixture, generated into a directory of their own. */
interface Bindings {
    dir: string;
    source: string;
}

/** Generate the bindings of a component. */
async function generate(wat: string, options: Partial<TranspilationOptions>): Promise<Bindings> {
    const dir = await getTmpDir();
    const { files } = await transpileBytes(await parse(wat), {
        name: 'calls',
        instantiation: 'async',
        ...options,
    });
    await writeFiles(files, { baseDir: dir });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    return { dir, source: await readFile(join(dir, 'calls.js'), 'utf8') };
}

/** Run a scenario against a new instance of the bindings. */
async function observe(bindings: Bindings, scenario: (context: Context) => unknown): Promise<Observation> {
    const log: unknown[] = [];
    const traps: Outcome[] = [];
    const host: Host = {
        double: (value) => value * 2,
        notify: (code) => log.push(['notify', code]),
        fallible: (value) => value,
        name: () => 'ünï',
        inspect: (thing) => (thing instanceof Thing ? 1 : 0),
    };
    const { instantiate } = await import(pathToFileURL(join(bindings.dir, 'calls.js')).href);
    const instance: Instance = await instantiate(
        async (path: string) => WebAssembly.compile(await readFile(join(bindings.dir, path))),
        {
            host: {
                Thing,
                double: (value: number) => host.double(value),
                notify: (code: number) => host.notify(code),
                fallible: (value: number) => host.fallible(value),
                name: () => host.name(),
                inspect: (thing: unknown) => host.inspect(thing),
            },
        },
        undefined,
        { onTrap: (trap: unknown) => traps.push(describeError(trap)) },
    );
    const outcome = await scenario({ instance, host, log });
    return { outcome, log, traps };
}

describe('--perf-sync-fast-path', () => {
    let wat: string;
    let off: Bindings;
    let on: Bindings;

    beforeAll(async () => {
        wat = await readFile(FIXTURE, 'utf8');
        [off, on] = await Promise.all([generate(wat, {}), generate(wat, { perfSyncFastPath: true })]);
    });

    afterAll(async () => {
        await Promise.all([off, on].map((bindings) => bindings && rm(bindings.dir, { recursive: true, force: true })));
    });

    test('is off by default', async () => {
        const explicit = await generate(wat, { perfSyncFastPath: false });
        try {
            assert.strictEqual(explicit.source, off.source);
        } finally {
            await rm(explicit.dir, { recursive: true, force: true });
        }
    });

    test('removes the task of a synchronous call', () => {
        assert.include(off.source, 'createNewCurrentImplicitThread(');
        assert.notStrictEqual(on.source, off.source);
        assert.isBelow(on.source.length, off.source.length);
    });

    test.each(Object.keys(SCENARIOS))('behaves as without the option: %s', async (name) => {
        const expected = await observe(off, SCENARIOS[name]);
        const actual = await observe(on, SCENARIOS[name]);
        expect(actual).toStrictEqual(expected);
    });

    test('keeps trap poisoning, stopping and may_leave', async () => {
        const trapped = await observe(on, SCENARIOS['a guest trap poisons the instance']);
        assert.strictEqual(trapped.traps.length, 1);
        assert.match((trapped.outcome as Outcome[])[1]['message'], /cannot enter component instance/);

        const stopped = await observe(on, SCENARIOS['a host import stops the instance']);
        assert.deepStrictEqual(stopped.log, [['notify', 1]]);
        assert.match((stopped.outcome as Outcome[])[0]['message'], /instance has been stopped/);

        const leaving = await observe(on, SCENARIOS['realloc may not leave while an import lowers its results']);
        assert.deepStrictEqual(leaving.log, []);
        assert.match((leaving.outcome as Outcome[])[0]['message'], /cannot leave component instance/);
    });

    test.each([
        ['an async function', 'post-return-traps/stack-async.wat', {}],
        ['several component instances', 'post-return-traps/composed-sync.wat', {}],
        ['call tracking', 'sync-fast-path/calls.wat', { callTracking: true }],
        ['asm.js output', 'sync-fast-path/calls.wat', { js: true }],
        ['a JSPI export', 'sync-fast-path/calls.wat', { asyncMode: 'jspi', asyncExports: ['add'] }],
    ] as const)('leaves bindings unchanged with %s', async (_name, fixture, options) => {
        const source = await readFile(join(COMPONENT_FIXTURES_DIR, fixture), 'utf8');
        const [without, withOption] = await Promise.all([
            generate(source, options),
            generate(source, { ...options, perfSyncFastPath: true }),
        ]);
        try {
            assert.strictEqual(withOption.source, without.source);
        } finally {
            await Promise.all([without, withOption].map(({ dir }) => rm(dir, { recursive: true, force: true })));
        }
    });
});
