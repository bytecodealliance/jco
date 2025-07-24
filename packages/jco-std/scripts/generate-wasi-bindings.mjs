import { env } from 'node:process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { styleText } from "node:util";

// TODO: update jco-transpile so it can be used here
// import { generateGuestTypes } from '@bytecodealliance/jco-transpile';

import { types as generateTypes } from "@bytecodealliance/jco";


/** World that should be used for binding generation */
const BINDING_WORLD = env.BINDING_WORLD;

/** Path to the WIT file or folder that should be searched for the world */
const WIT_PATH = env.WIT_PATH;

/** Alternate output path for generated files */
const OUTPUT_DIR_PATH = env.OUTPUT_DIR_PATH;

/** Check if a given path exists */
async function pathExists(p) {
    return stat(p)
        .then(() => true)
        .catch(() => false);
}

async function main() {
    // Ensure the WIT path exists
    if (!(await pathExists(WIT_PATH))) {
        throw new Error(`specified WIT_PATH [${WIT_PATH}] does not exist`);
    }

    // Generate options
    const opts = {guest: true};
    if (BINDING_WORLD) {
        opts.worldName = BINDING_WORLD;
    }
    if (OUTPUT_DIR_PATH) {
        opts.outDir = OUTPUT_DIR_PATH;
    }

    // Generate types and write them to disk

    // TODO: use this once jco-transpile is updated
    // const files = await generateGuestTypes(WIT_PATH, opts);

    try {
        const files = await generateTypes(WIT_PATH, opts);
        await writeFiles(files, false);
    } catch (err) {
        const warnText = styleText('yellow', 'WARNING');
        console.error(`${warnText}: if WIT has not been fetched yet, please run 'wkg wit fetch --wit-dir .' in the appropriate subfolders (e.x. wit/http-v0m2p3)`);

        throw err;
    }
}

/**
 * Helper function for writing out files in the form that jco-tranpsile generates them
 *
 * @param {Record<string, string>} files
 * @returns {Promise<void>} A Promise that resovles when all files have been written
 */
export async function writeFiles(files) {
    return Promise.all(
        Object.entries(files).map(async ([name, file]) => {
            await mkdir(dirname(name), { recursive: true });
            await writeFile(name, file);
        })
    );
}

await main();
