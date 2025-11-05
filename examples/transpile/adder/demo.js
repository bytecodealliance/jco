import { mkdir, stat } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert";

import { transpile, writeFiles } from "@bytecodealliance/jco-transpile";
import { getCoreModuleWithBaseDir } from "@bytecodealliance/jco-transpile/helpers";

/**
 * Path to the pre-built component this example uses, an `adder`
 *
 * @see https://component-model.bytecodealliance.org
 * @see https://github.com/bytecodealliance/component-docs
 */
const COMPONENT_PATH = fileURLToPath(new URL("./adder.wasm", import.meta.url));

const DIST_DIR_PATH = fileURLToPath(new URL("./dist", import.meta.url));

/** Utility function for checking whether a directory exists */
async function dirExists(p) {
    return stat(p).then(d => d.isDirectory()).catch(() => false);
}

/** Utility function for checking whether a file exists */
async function fileExists(p) {
    return stat(p).then(f => f.isFile()).catch(() => false);
}

async function main() {
    if (!(await fileExists(COMPONENT_PATH))) { throw new Error(`missing component @ [${COMPONENT_PATH}]`); }

    const { files, imports, exports } = await transpile(COMPONENT_PATH, {
        name: 'adder',
        outDir: DIST_DIR_PATH,
        instantiation: 'async',
    });
    console.error("Wasm component imports and exports ", { imports, exports });

    if (!await dirExists(DIST_DIR_PATH)) {
        console.error(`missing dist directory @ [${DIST_DIR_PATH}], creating...`);
        await mkdir(DIST_DIR_PATH);
    }

    // Write the files to disk, in dist
    await writeFiles(files);

    const expectedModulePath = join(DIST_DIR_PATH, "adder.js");

    // Load the output module, and create a WebAssembly instance
    //
    // NOTE: since we did not specify async instantiation (as the component has no meaningful imports that we
    // want to fulfill), importing the transpile component will immediately initialize it.
    const { instantiate }  = await import(expectedModulePath);
    const instance = await instantiate(getCoreModuleWithBaseDir({ baseDir: DIST_DIR_PATH }), {});

    // Run transpiled WebAssembly component function `docs:adder@0.1.0/add.add`.
    //
    // Alternatively, you can use mod['docs:adder@0.1.0/add.add'], like below:
    // ```
    // const result = instance['docs:adder/add@0.1.0'].add(1,2);
    // ```
    //
    const result = instance.add.add(1,2);
    assert(result === 3, '1 + 2 should equal 3');
    console.log(`1 + 2 = ${result}\n`);
}

await main();
