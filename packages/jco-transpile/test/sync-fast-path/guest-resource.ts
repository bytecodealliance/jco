import { describe } from 'vitest';

import { attempt, compareWithoutFastPath, throwing } from './helpers.js';
import type { Scenarios } from './helpers.js';

/** Calls of a resource that the guest defines, whose destructor calls a host function. */
const SCENARIOS: Scenarios = {
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

describe('--perf-sync-fast-path: a guest resource', () => {
    compareWithoutFastPath('guest-resource', SCENARIOS);
});
