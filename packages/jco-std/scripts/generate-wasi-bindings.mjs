import { env } from 'node:process';
import { stat } from 'node:fs/promises';
import { styleText } from "node:util";

import { generateGuestTypes, writeFiles } from '@bytecodealliance/jco-transpile';

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

    try {
        // Generate types and write them to disk
        const files = await generateGuestTypes(WIT_PATH, opts);
        await writeFiles(files, false);
    } catch (err) {
        const warnText = styleText('yellow', 'WARNING');
        console.error(`${warnText}: if WIT has not been fetched yet, please run 'wkg wit fetch --wit-dir .' in the appropriate subfolders (e.x. wit/http-v0m2p3)`);
        throw err;
    }
}

await main();
