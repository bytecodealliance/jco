import { readFile, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { URL, fileURLToPath } from "node:url";
import assert from "node:assert/strict";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

// If this import listed below is missing, please run `npm run transpile`
import { instantiate } from "./dist/transpiled/component.js";

const CURRENT_PATH = fileURLToPath(new URL("./", import.meta.url));

async function fileExists(p) {
    return stat(p).then(f => f.isFile()).catch(() => false);
}

async function main() {
    let expectedPath = join(CURRENT_PATH, "output.txt");
    if (await fileExists(expectedPath)) {
        console.log("detected existing file at path, removing...");
        await rm(expectedPath);
    }

    // Create the environment the transpiled component will use
    const shim = new WASIShim({
        sandbox: {
            preopens: {
                '/': CURRENT_PATH,
            },
        }
    });

    // Create an instance of the transpiled component, with environment
    const instance = await instantiate(undefined, shim.getImportObject());

    // Run the actual component function
    const res = instance.test.run();
    assert.strictEqual(res, "SUCCESS: wrote file");

    assert(await fileExists(expectedPath), "expected output file exists");

    const contents = await readFile(expectedPath);
    assert.strictEqual(contents.toString(), "Hello world, from component!", "expected output file exists");

    console.log("successfully wrote output file");
}

await main();
