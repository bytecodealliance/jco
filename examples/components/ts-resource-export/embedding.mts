/**
 * This file showcases an embedding of a component that exports a resource.
 *
 * The embedding (this NodeJS script) instantiates the component and
 * makes use of the resources that were exported.
 *
 * One of the exported resources has dispose configured, but the other does not,
 * note that the disposal behavior will be triggered from the embedder once the
 * created resource goes out of scope.
 *
 */
/* global WebAssembly */

import { readFile } from 'node:fs/promises';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

// If this import listed below is missing, please run `npm run transpile`
import { instantiate } from './dist/transpiled/component.js';

async function main() {
    // Instantiate the component with the custom imports
    const loader = async (path: string) => {
        const buf = await readFile(`./dist/transpiled/${path}`);
        return await WebAssembly.compile(buf.buffer as ArrayBuffer);
    };

    const shim = new WASIShim();
    const { resources } = await instantiate(loader, {
        // NOTE: While we can implement the shim once, we have to
        // merge different versions of it to create a complete import object
        // that the transpiled component can use.
        ...shim.getImportObject<'0.2.7'>({ asVersion: '0.2.7' }),
        ...shim.getImportObject<'0.2.3'>({ asVersion: '0.2.3' }),
        ...shim.getImportObject(),
    });

    // TODO: disposable resources are not yet implemented properly
    // {
    //     using ex1 = new resources.Example();
    //     console.log('Hello from ex1:', ex1.hello('ex1'));
    // }

    const ex1 = new resources.Example();
    console.log('Hello from ex1:', ex1.hello('ex1'));

    const ex2 = new resources.ExampleNoDispose();
    console.log('Hello from ex2:', ex2.hello('ex2'));
}

await main();
