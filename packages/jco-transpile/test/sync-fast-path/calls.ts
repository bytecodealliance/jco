import { setTimeout as sleep } from 'node:timers/promises';

import { assert, describe, test } from 'vitest';

import { attempt, compareWithoutFastPath, message, observe, Thing, withFastPathBindings } from './helpers.js';
import type { Scenarios } from './helpers.js';

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

describe('--perf-sync-fast-path: calls', () => {
    compareWithoutFastPath('calls', SCENARIOS);

    describe('what a call still does', () => {
        const bindings = withFastPathBindings('calls');

        test('a trap poisons the instance', async () => {
            const trapped = await observe(bindings(), SCENARIOS['a guest trap poisons the instance']);
            assert.strictEqual(trapped.traps.length, 1);
            assert.match(message(trapped, 1), /cannot enter component instance/);
        });

        test('a stop ends the call that is running', async () => {
            const stopped = await observe(bindings(), SCENARIOS['a host import stops the instance']);
            assert.deepStrictEqual(stopped.log, [['notify', 1]]);
            assert.match(message(stopped, 0), /instance has been stopped/);
        });

        test('a guest may not leave from realloc', async () => {
            const leaving = await observe(
                bindings(),
                SCENARIOS['realloc may not leave while an import lowers its results'],
            );
            assert.deepStrictEqual(leaving.log, []);
            assert.match(message(leaving, 0), /cannot leave component instance/);
        });
    });
});
