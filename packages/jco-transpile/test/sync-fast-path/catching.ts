import { assert, describe, test } from 'vitest';

import { attempt, compareWithoutFastPath, message, observe, throwing, withFastPathBindings } from './helpers.js';
import type { Outcome, Scenarios } from './helpers.js';

/**
 * Calls of a guest that catches what its imports throw. A host function that
 * throws fails the export that called it even then, with what it threw first.
 */
const SCENARIOS: Scenarios = {
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

describe('--perf-sync-fast-path: a guest that catches', () => {
    compareWithoutFastPath('catching', SCENARIOS);

    describe('what a call still does', () => {
        const bindings = withFastPathBindings('catching');

        test('an error that the guest catches fails the export', async () => {
            const caught = await observe(bindings(), SCENARIOS['the guest catches two errors']);
            assert.deepStrictEqual(caught.log, [
                ['notify', 1],
                ['notify', 2],
            ]);
            assert.strictEqual(message(caught, 0), 'host 1');
            assert.deepStrictEqual((caught.outcome as Outcome[])[1], { value: 3 });
        });
    });
});
