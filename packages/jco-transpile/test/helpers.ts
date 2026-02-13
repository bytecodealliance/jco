import { fileURLToPath, URL } from 'node:url';
import { readFile } from 'node:fs/promises';

/** Stable path to the jco's fixture directory containing WIT files */
export const JCO_WIT_FIXTURE_DIR = fileURLToPath(new URL('../../jco/test/fixtures/wits', import.meta.url));

/** Stable path to the local (jco-transpile) fixture directory containing WIT files */
export const WIT_FIXTURE_DIR = fileURLToPath(new URL('./fixtures/wit', import.meta.url));

/** Cache of bytes that is used */
const COMPONENT_BYTES_CACHE = {};

/**
 * Read the bytes of a component from disk (or the cache, if available) */
export async function readComponentBytes(componentPath: string): Promise<Buffer> {
    if (!COMPONENT_BYTES_CACHE[componentPath]) {
        COMPONENT_BYTES_CACHE[componentPath] = await readFile(componentPath);
    }
    return COMPONENT_BYTES_CACHE[componentPath];
}
