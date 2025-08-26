/**
 * This file showcases an embedding of a component that uses an import.
 *
 * The embedding (this NodeJS script) defines the required imports,
 * instantiates the transpiled component with the import,
 * and runs the component.
 */
/* global WebAssembly */

import { readFile } from 'node:fs/promises';

import * as wasiShim from '@bytecodealliance/preview2-shim/instantiation';

// If this import listed below is missing, please run `npm run transpile`
import { instantiate } from './dist/transpiled/component.js';

let _LOCAL_RESOURCE_ID = 0n;

/**
 * This is our local implementation of the `example` WIT resource
 */
class LocalExample {
    #id: bigint;

    constructor() {
        this.#id = ++_LOCAL_RESOURCE_ID;
        console.log(`constructed [LocalExample(${this.#id})]!`);
    }

    hello(s: String) {
        return `[LocalExample(${this.#id})] Hello ${s}!`;
    }

    [Symbol.dispose]() {
        console.error(`disposing [LocalExample(${this.#id})]`);
    }
}

async function main() {
    // Build the imports the component requires
    const imports = {
        ...new (wasiShim as any).WASIShim().getImportObject(),
        'test:component/resources': {
            Example: LocalExample,
        },
        'wasi:http/types': {},
        'wasi:http/outgoing-handler': {
            handle: () => {
                throw new Error('NOT SUPPORTED');
            },
        },
    };

    // Instantiate the component with the custom imports
    const loader = async (path: string) => {
        const buf = await readFile(`./dist/transpiled/${path}`);
        return await WebAssembly.compile(buf.buffer as ArrayBuffer);
    };
    const component = await instantiate(loader, imports);

    // Run the component (output will be printed to the console)
    component.run.run();
}

await main();
