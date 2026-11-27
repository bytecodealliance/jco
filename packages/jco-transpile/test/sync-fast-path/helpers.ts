import { readFileSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { transpileBytes, unlinkedRuntimeBase, writeFiles } from '../transpilation.js';
import type { TranspilationOptions } from '../../src/transpile.js';
import { parse } from '../../src/wasm-tools.js';
import { COMPONENT_FIXTURES_DIR } from '../common.js';
import { getTmpDir } from '../helpers.js';

const FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'sync-fast-path');

/** What a call did: the value it returned, or the error it threw. */
export type Outcome = { value: unknown } | { throws: string; message: string; trap: boolean };

/** Everything a scenario lets a host observe. */
export interface Observation {
    /** What the scenario returned. */
    outcome: unknown;
    /** What the host functions and resource destructors saw, in order. */
    log: unknown[];
    /** The traps reported to `onTrap`. */
    traps: Outcome[];
}

/** The functions of the `host` import, replaceable by a scenario. */
export interface Host {
    double: (value: number) => unknown;
    notify: (code: number) => unknown;
    fallible: (value: number) => unknown;
    name: () => unknown;
    inspect: (thing: unknown) => unknown;
}

// oxlint-disable-next-line typescript/no-explicit-any -- generated bindings are untyped here
type Instance = any;

/** What a scenario is given: a new instance, its host functions and the log they write to. */
export interface Context {
    instance: Instance;
    host: Host;
    log: unknown[];
}

/** Named sequences of calls against one fixture. */
export type Scenarios = Record<string, (context: Context) => unknown>;

/** Bindings of a fixture, generated into a directory of their own. */
export interface Bindings {
    dir: string;
    name: string;
    source: string;
    sync: boolean;
}

/** Ways of generating and loading bindings that the fast path must not depend on. */
const VARIANTS: { label: string; options: Partial<TranspilationOptions> }[] = [
    { label: 'async instantiation', options: { instantiation: 'async' } },
    { label: 'sync instantiation', options: { instantiation: 'sync' } },
    { label: 'imported runtime', options: { instantiation: 'async', cmRuntimeEsModule: unlinkedRuntimeBase } },
];

/**
 * Describe a thrown value without its identity or stack, which differ between instances.
 *
 * @param error - the thrown value
 * @returns the outcome of a call that threw it
 */
export function describeError(error: unknown): Outcome {
    return {
        throws: (error as Error)?.constructor?.name ?? typeof error,
        message: String((error as Error)?.message ?? error),
        trap: error instanceof WebAssembly.RuntimeError,
    };
}

/**
 * Call `fn`, capturing what it returns or throws.
 *
 * @param fn - the call to make
 * @returns its outcome
 */
export function attempt(fn: () => unknown): Outcome {
    try {
        return { value: fn() };
    } catch (error) {
        return describeError(error);
    }
}

/** A host resource that logs its disposal, and may act during it. */
export class Thing {
    #log: unknown[];
    #onDispose?: () => void;

    /**
     * @param log - where to record the disposal
     * @param onDispose - what to do after recording it
     */
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
 * A host function that logs its call and throws what `error` makes for any code but 0.
 *
 * @param log - where to record each call
 * @param error - makes the value to throw for a code
 * @returns a replacement for `host.notify`
 */
export function throwing(log: unknown[], error: (code: number) => unknown): (code: number) => void {
    return (code) => {
        log.push(['notify', code]);
        if (code !== 0) {
            throw error(code);
        }
    };
}

/**
 * Read a WAT fixture of this suite.
 *
 * @param name - the fixture name, without extension
 * @returns its text
 */
export function readFixture(name: string): Promise<string> {
    return readFile(join(FIXTURES_DIR, `${name}.wat`), 'utf8');
}

/**
 * Generate the bindings of a component into a temporary directory.
 *
 * @param name - the name of the bindings
 * @param wat - the component, as WAT
 * @param options - transpilation options
 * @returns the generated bindings
 */
export async function generate(name: string, wat: string, options: Partial<TranspilationOptions>): Promise<Bindings> {
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

/**
 * Generate the bindings of a component without and with the fast path.
 *
 * @param name - the name of the bindings
 * @param wat - the component, as WAT
 * @param options - transpilation options shared by both
 * @returns the bindings without and with the fast path
 */
export function generatePair(
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

/**
 * Remove the directories of generated bindings.
 *
 * @param bindings - the bindings to remove; undefined entries are skipped
 */
export async function remove(...bindings: (Bindings | undefined)[]) {
    await Promise.all(bindings.map((generated) => generated && rm(generated.dir, { recursive: true, force: true })));
}

/**
 * Run a scenario against a new instance of the bindings.
 *
 * @param bindings - the bindings to instantiate
 * @param scenario - the calls to make
 * @returns what the host could observe
 */
export async function observe(bindings: Bindings, scenario: (context: Context) => unknown): Promise<Observation> {
    const log: unknown[] = [];
    const traps: Outcome[] = [];

    // Default host functions; a scenario replaces them on `host` before it calls in.
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

/**
 * The message of the error that the call at `index` of a scenario threw.
 *
 * @param observation - what the scenario observed
 * @param index - the position of the call in its outcome
 * @returns the error message
 */
export function message(observation: Observation, index: number): string {
    return (observation.outcome as { message: string }[])[index].message;
}

/**
 * Check, for every variant, that the fast path removes the task of a synchronous call
 * from a fixture's bindings and that each scenario observes the same as without it.
 *
 * @param name - the fixture name
 * @param scenarios - the scenarios to compare
 */
export function compareWithoutFastPath(name: string, scenarios: Scenarios) {
    describe.each(VARIANTS)('with $label', ({ options }) => {
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
}

/**
 * Generate a fixture's bindings with the fast path for the tests of one describe block,
 * and remove them afterwards.
 *
 * @param name - the fixture name
 * @returns a getter for the bindings, valid inside the block's tests
 */
export function withFastPathBindings(name: string): () => Bindings {
    let bindings: Bindings | undefined;

    beforeAll(async () => {
        bindings = await generate(name, await readFixture(name), { instantiation: 'async', perfSyncFastPath: true });
    });

    afterAll(() => remove(bindings));

    return () => {
        assert.isDefined(bindings);
        return bindings;
    };
}
