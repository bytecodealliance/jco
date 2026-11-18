import { readFileSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { forceSyncFastPath, transpileBytes, unlinkedRuntimeBase, writeFiles } from './transpilation.js';
import type { TranspilationOptions } from '../src/transpile.js';
import { parse } from '../src/wasm-tools.js';
import { COMPONENT_FIXTURES_DIR } from './common.js';
import { getTmpDir } from './helpers.js';

const FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'sync-fast-path');

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

/** Named sequences of calls against one fixture. */
type Scenarios = Record<string, (context: Context) => unknown>;

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
const SCENARIOS: Scenarios = {
    'values round-trip': ({ instance }) => [
        instance.add(1, 2),
        instance.add(4294967295, 1),
        instance.callDouble(21),
        instance.echo('héllo wörld ✓'),
        instance.echo(''),
        instance.echoName(),
        instance.callFallible(5),
        instance.sum([1, 2, 3, 4294967295]),
        instance.sum([]),
        instance.iota(5),
        instance.swap([7, 2n ** 63n]),
    ],
    'a result is returned or thrown, and post-return runs either way': ({ instance }) => [
        attempt(() => instance.checkedDivide(7, 2)),
        attempt(() => instance.checkedDivide(7, 0)),
        attempt(() => instance.postReturns()),
        attempt(() => instance.add(1, 2)),
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

/** A host function that logs its call and throws what `error` makes for any code but 0. */
function throwing(log: unknown[], error: (code: number) => unknown): (code: number) => void {
    return (code) => {
        log.push(['notify', code]);
        if (code !== 0) {
            throw error(code);
        }
    };
}

/**
 * Calls of a guest that catches what its imports throw. A host function that
 * throws fails the export that called it even then, with what it threw first.
 */
const CATCHING_SCENARIOS: Scenarios = {
    'nothing is thrown': ({ instance }) => [attempt(() => instance.catchOne(0)), attempt(() => instance.add(1, 2))],
    'the guest catches an error': ({ instance, host, log }) => {
        host.notify = throwing(log, (code) => new Error(`host ${code}`));
        return [
            attempt(() => instance.catchOne(1)),
            attempt(() => instance.add(1, 2)),
            attempt(() => instance.catchOne(0)),
        ];
    },
    'the guest catches two errors': ({ instance, host, log }) => {
        host.notify = throwing(log, (code) => new Error(`host ${code}`));
        return [attempt(() => instance.catchTwo(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'the guest catches the error of one call of two': ({ instance, host, log }) => {
        host.notify = throwing(log, (code) => new Error(`host ${code}`));
        return [
            attempt(() => instance.catchTwo(1, 0)),
            attempt(() => instance.catchTwo(0, 2)),
            attempt(() => instance.add(1, 2)),
        ];
    },
    'the guest catches a trap': ({ instance, host, log }) => {
        host.notify = throwing(log, (code) => new WebAssembly.RuntimeError(`trap ${code}`));
        return [attempt(() => instance.catchTwo(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'the guest catches a thrown string': ({ instance, host, log }) => {
        host.notify = throwing(log, (code) => `string ${code}`);
        return [attempt(() => instance.catchTwo(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'post-return does not run after a caught error': ({ instance, host, log }) => {
        host.notify = throwing(log, (code) => new Error(`host ${code}`));
        return [
            attempt(() => instance.catchWithPostReturn(1)),
            attempt(() => instance.postReturns()),
            attempt(() => instance.catchWithPostReturn(0)),
            attempt(() => instance.postReturns()),
        ];
    },
    'a nested call catches an error': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            if (code === 5) {
                log.push(['nested', attempt(() => instance.catchOne(7))]);
            }
            if (code === 7) {
                throw new Error('nested failure');
            }
        };
        return [attempt(() => instance.catchOne(5)), attempt(() => instance.add(1, 2))];
    },
    'a nested call catches an error and the host function throws another': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            if (code === 5) {
                log.push(['nested', attempt(() => instance.catchOne(7))]);
                throw new Error('outer failure');
            }
            if (code === 7) {
                throw new Error('nested failure');
            }
        };
        return [attempt(() => instance.catchOne(5)), attempt(() => instance.add(1, 2))];
    },
    'a nested call succeeds after a caught error': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            if (code === 1) {
                throw new Error('outer failure');
            }
            if (code === 2) {
                log.push(['nested', attempt(() => instance.catchOne(0)), attempt(() => instance.add(4, 4))]);
            }
        };
        return [attempt(() => instance.catchTwo(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'a nested call traps and the host function returns': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            if (code === 5) {
                log.push(['nested', attempt(() => instance.catchOne(7))]);
            }
            if (code === 7) {
                throw new WebAssembly.RuntimeError('nested trap');
            }
        };
        return [attempt(() => instance.catchOne(5)), attempt(() => instance.add(1, 2))];
    },
    'the guest catches what an import of a result type throws': ({ instance, host }) => {
        host.fallible = (value) => {
            if (value === 1) {
                throw new Error('nope');
            }
            if (value === 2) {
                throw new WebAssembly.RuntimeError('trap in fallible');
            }
            return value;
        };
        return [
            ...[0, 1, 0, 2, 0].map((value) => attempt(() => instance.catchFallible(value))),
            attempt(() => instance.add(1, 2)),
        ];
    },
    'the guest catches an import whose result cannot be lowered': ({ instance, host }) => {
        host.name = () => 42;
        return [attempt(() => instance.catchName()), attempt(() => instance.add(1, 2))];
    },
    'the guest catches the stop of the instance': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            if (code === 1) {
                instance._util.stop();
            }
        };
        return [attempt(() => instance.catchTwo(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'the guest catches an error thrown after a stop': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            instance._util.stop();
            throw new Error('after stop');
        };
        return [attempt(() => instance.catchTwo(1, 2)), attempt(() => instance.add(1, 2))];
    },
    'the guest catches an error and the instance is stopped later': ({ instance, host, log }) => {
        host.notify = (code) => {
            log.push(['notify', code]);
            if (code === 1) {
                throw new Error('before stop');
            }
            instance._util.stop();
        };
        return [attempt(() => instance.catchTwo(1, 2)), attempt(() => instance.add(1, 2))];
    },
};

/** Calls of a resource that the guest defines, whose destructor calls a host function. */
const GUEST_RESOURCE_SCENARIOS: Scenarios = {
    'a guest resource is constructed, borrowed and consumed': ({ instance, log }) => {
        const { Thing, ok } = instance.api;
        const thing = new Thing(5);
        const outcomes = [attempt(() => thing.get()), attempt(() => Thing.consume(thing))];
        log.push('consumed');
        return [...outcomes, attempt(() => thing.get()), attempt(() => Thing.consume(thing)), attempt(() => ok())];
    },
    'the host disposes of a guest resource': ({ instance, log }) => {
        const { Thing, ok } = instance.api;
        const thing = new Thing(6);
        const outcomes = [attempt(() => thing[Symbol.dispose]())];
        log.push('disposed');
        return [...outcomes, attempt(() => thing.get()), attempt(() => ok())];
    },
    'the destructor of a consumed resource fails': ({ instance, host, log }) => {
        const { Thing, ok } = instance.api;
        host.notify = throwing(log, (code) => new Error(`host ${code}`));
        return [attempt(() => Thing.consume(new Thing(7))), attempt(() => ok())];
    },
    'the destructor of a disposed resource fails': ({ instance, host, log }) => {
        const { Thing, ok } = instance.api;
        host.notify = throwing(log, (code) => new Error(`host ${code}`));
        const thing = new Thing(8);
        return [attempt(() => thing[Symbol.dispose]()), attempt(() => ok())];
    },
    'the destructor of a consumed resource traps': ({ instance, host, log }) => {
        const { Thing, ok } = instance.api;
        host.notify = throwing(log, (code) => new WebAssembly.RuntimeError(`trap ${code}`));
        return [attempt(() => Thing.consume(new Thing(9))), attempt(() => ok())];
    },
    'the destructor of a disposed resource traps': ({ instance, host, log }) => {
        const { Thing, ok } = instance.api;
        host.notify = throwing(log, (code) => new WebAssembly.RuntimeError(`trap ${code}`));
        const thing = new Thing(10);
        return [attempt(() => thing[Symbol.dispose]()), attempt(() => ok())];
    },
    'the destructor of a consumed resource catches an error': ({ instance, host, log }) => {
        const { Thing, ok } = instance.api;
        host.notify = throwing(log, (code) => new Error(`host ${code}`));
        return [attempt(() => Thing.consume(new Thing(100))), attempt(() => ok())];
    },
    'the destructor of a disposed resource catches an error': ({ instance, host, log }) => {
        const { Thing, ok } = instance.api;
        host.notify = throwing(log, (code) => new Error(`host ${code}`));
        const thing = new Thing(101);
        return [attempt(() => thing[Symbol.dispose]()), attempt(() => ok())];
    },
    'the destructor stops the instance': ({ instance, host, log }) => {
        const { Thing, ok } = instance.api;
        host.notify = (code) => {
            log.push(['notify', code]);
            instance._util.stop();
        };
        return [attempt(() => Thing.consume(new Thing(11))), attempt(() => ok())];
    },
    'the destructor re-enters the instance': ({ instance, host, log }) => {
        const { Thing, ok } = instance.api;
        host.notify = (code) => log.push(['notify', code, attempt(() => ok()), attempt(() => new Thing(1).get())]);
        return [attempt(() => Thing.consume(new Thing(12))), attempt(() => ok())];
    },
};

/** A fixture component and the scenarios that run against it. */
interface Fixture {
    name: string;
    scenarios: Scenarios;
}

const FIXTURES: Fixture[] = [
    { name: 'calls', scenarios: SCENARIOS },
    { name: 'catching', scenarios: CATCHING_SCENARIOS },
    { name: 'guest-resource', scenarios: GUEST_RESOURCE_SCENARIOS },
];

/** Ways of generating and loading bindings that the fast path must not depend on. */
const VARIANTS: { label: string; options: Partial<TranspilationOptions> }[] = [
    { label: 'async instantiation', options: { instantiation: 'async' } },
    { label: 'sync instantiation', options: { instantiation: 'sync' } },
    { label: 'imported runtime', options: { instantiation: 'async', cmRuntimeEsModule: unlinkedRuntimeBase } },
];

/** Bindings of a fixture, generated into a directory of their own. */
interface Bindings {
    dir: string;
    name: string;
    source: string;
    sync: boolean;
}

/** Read a fixture of this suite. */
function readFixture(name: string): Promise<string> {
    return readFile(join(FIXTURES_DIR, `${name}.wat`), 'utf8');
}

/** Generate the bindings of a component. */
async function generate(name: string, wat: string, options: Partial<TranspilationOptions>): Promise<Bindings> {
    const dir = await getTmpDir();
    const { files } = await transpileBytes(await parse(wat), { name, ...options });
    await writeFiles(files, { baseDir: dir });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    return {
        dir,
        name,
        source: await readFile(join(dir, `${name}.js`), 'utf8'),
        sync: options.instantiation === 'sync',
    };
}

/** Generate the bindings of a component without and with the fast path. */
function generatePair(
    name: string,
    wat: string,
    options: Partial<TranspilationOptions>,
): Promise<[off: Bindings, on: Bindings]> {
    // (the option is set either way, so that no default of the suite applies to the baseline)
    return Promise.all([
        generate(name, wat, { ...options, perfSyncFastPath: false }),
        generate(name, wat, { ...options, perfSyncFastPath: true }),
    ]);
}

/** Remove the directories of generated bindings. */
async function remove(...bindings: (Bindings | undefined)[]) {
    await Promise.all(bindings.map((generated) => generated && rm(generated.dir, { recursive: true, force: true })));
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
    const imports = {
        host: {
            Thing,
            double: (value: number) => host.double(value),
            notify: (code: number) => host.notify(code),
            fallible: (value: number) => host.fallible(value),
            name: () => host.name(),
            inspect: (thing: unknown) => host.inspect(thing),
        },
    };
    const options = { onTrap: (trap: unknown) => traps.push(describeError(trap)) };
    const { instantiate } = await import(pathToFileURL(join(bindings.dir, `${bindings.name}.js`)).href);
    const instance: Instance = bindings.sync
        ? instantiate(
              (path: string) => new WebAssembly.Module(readFileSync(join(bindings.dir, path))),
              imports,
              undefined,
              options,
          )
        : await instantiate(
              async (path: string) => WebAssembly.compile(await readFile(join(bindings.dir, path))),
              imports,
              undefined,
              options,
          );
    const outcome = await scenario({ instance, host, log });
    return { outcome, log, traps };
}

describe('--perf-sync-fast-path', () => {
    describe.each(VARIANTS)('with $label', ({ options }) => {
        describe.each(FIXTURES)('$name', ({ name, scenarios }) => {
            let off: Bindings;
            let on: Bindings;

            beforeAll(async () => {
                [off, on] = await generatePair(name, await readFixture(name), options);
            });

            afterAll(() => remove(off, on));

            test('removes the task of a synchronous call', () => {
                assert.include(off.source, 'createNewCurrentImplicitThread');
                assert.notStrictEqual(on.source, off.source);
                assert.isBelow(on.source.length, off.source.length);
            });

            test.each(Object.keys(scenarios))('behaves as without the option: %s', async (scenario) => {
                const expected = await observe(off, scenarios[scenario]);
                const actual = await observe(on, scenarios[scenario]);
                expect(actual).toStrictEqual(expected);
            });
        });
    });

    describe('what a call still does', () => {
        const bindings: Record<string, Bindings> = {};

        beforeAll(async () => {
            for (const name of ['calls', 'catching']) {
                bindings[name] = await generate(name, await readFixture(name), {
                    instantiation: 'async',
                    perfSyncFastPath: true,
                });
            }
        });

        afterAll(() => remove(...Object.values(bindings)));

        /** The message of the error that the call at `index` of a scenario threw. */
        function message(observation: Observation, index: number): string {
            return (observation.outcome as { message: string }[])[index].message;
        }

        test('a trap poisons the instance', async () => {
            const trapped = await observe(bindings.calls, SCENARIOS['a guest trap poisons the instance']);
            assert.strictEqual(trapped.traps.length, 1);
            assert.match(message(trapped, 1), /cannot enter component instance/);
        });

        test('a stop ends the call that is running', async () => {
            const stopped = await observe(bindings.calls, SCENARIOS['a host import stops the instance']);
            assert.deepStrictEqual(stopped.log, [['notify', 1]]);
            assert.match(message(stopped, 0), /instance has been stopped/);
        });

        test('a guest may not leave from realloc', async () => {
            const leaving = await observe(
                bindings.calls,
                SCENARIOS['realloc may not leave while an import lowers its results'],
            );
            assert.deepStrictEqual(leaving.log, []);
            assert.match(message(leaving, 0), /cannot leave component instance/);
        });

        test('an error that the guest catches fails the export', async () => {
            const caught = await observe(bindings.catching, CATCHING_SCENARIOS['the guest catches two errors']);
            assert.deepStrictEqual(caught.log, [
                ['notify', 1],
                ['notify', 2],
            ]);
            assert.strictEqual(message(caught, 0), 'host 1');
            assert.deepStrictEqual((caught.outcome as Outcome[])[1], { value: 3 });
        });
    });

    test('is off by default', async () => {
        const wat = await readFixture('calls');
        // (unless the suite itself runs with the option forced on)
        const expected = await generate('calls', wat, { instantiation: 'async', perfSyncFastPath: forceSyncFastPath });
        const actual = await generate('calls', wat, { instantiation: 'async' });
        try {
            assert.strictEqual(actual.source, expected.source);
        } finally {
            await remove(expected, actual);
        }
    });

    test.each([
        ['an async function', 'post-return-traps/stack-async.wat', {}],
        ['several component instances', 'post-return-traps/composed-sync.wat', {}],
        ['call tracking', 'sync-fast-path/calls.wat', { callTracking: true }],
        ['asm.js output', 'sync-fast-path/calls.wat', { js: true }],
        ['a JSPI export', 'sync-fast-path/calls.wat', { asyncMode: 'jspi', asyncExports: ['add'] }],
    ] as const)('leaves bindings unchanged with %s', async (_name, fixture, options) => {
        const wat = await readFile(join(COMPONENT_FIXTURES_DIR, fixture), 'utf8');
        const [without, withOption] = await generatePair('component', wat, { instantiation: 'async', ...options });
        try {
            assert.strictEqual(withOption.source, without.source);
        } finally {
            await remove(without, withOption);
        }
    });
});
