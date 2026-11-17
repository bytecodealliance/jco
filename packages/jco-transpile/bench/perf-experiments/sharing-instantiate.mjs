/**
 * Time one export while one set of bindings is instantiated more and more times.
 *
 * usage: node sharing-instantiate.mjs <bindings.js> [instances]
 *
 * The bindings must be the `numbers` fixture transpiled in instantiation mode.
 * Prints the nanoseconds per call of the first instance after each further
 * instance has been exercised.
 */
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { cli, filesystem, io } from '@bytecodealliance/preview2-shim';

import { numbers } from './hosts.mjs';

const bindingsUrl = pathToFileURL(process.argv[2]);
const instances = Number(process.argv[3] ?? 6);
const iterations = 100_000;
const { instantiate } = await import(bindingsUrl.href);

const imports = {
    'test:numbers/test': numbers,
    'wasi:cli/stderr': cli.stderr,
    'wasi:cli/stdin': cli.stdin,
    'wasi:cli/stdout': cli.stdout,
    'wasi:filesystem/preopens': filesystem.preopens,
    'wasi:filesystem/types': filesystem.types,
    'wasi:io/error': io.error,
    'wasi:io/streams': io.streams,
};

/**
 * Compile one core module of the bindings.
 *
 * @param {string} name - file name of the module, next to the bindings
 * @returns {Promise<WebAssembly.Module>} the compiled module
 */
const getCoreModule = async (name) => WebAssembly.compile(await readFile(new URL(name, bindingsUrl)));

/**
 * Time calls of one instance's scalar export.
 *
 * @param {object} instance - one instantiation of the bindings
 * @returns {number} nanoseconds per call, the fastest of several rounds
 */
function time(instance) {
    let best = Infinity;
    for (let round = 0; round < 5; round++) {
        const start = performance.now();
        for (let index = 0; index < iterations; index++) {
            instance.test.roundtripU32(42);
        }
        best = Math.min(best, ((performance.now() - start) * 1e6) / iterations);
    }
    return Math.round(best);
}

const first = await instantiate(getCoreModule, imports);
time(first);

const timings = [time(first)];
for (let index = 1; index < instances; index++) {
    const other = await instantiate(getCoreModule, imports);
    time(other);
    timings.push(time(first));
}
console.log(JSON.stringify({ firstInstanceNsPerCall: timings }));
