import { fileURLToPath, URL } from 'node:url';
import { readFile } from 'node:fs/promises';

export const WIT_FIXTURE_DIR = fileURLToPath(
    new URL('../../jco/test/fixtures/wits', import.meta.url)
);

export const LOCAL_WIT_FIXTURE_DIR = fileURLToPath(
    new URL('./fixtures/wit', import.meta.url)
);

const COMPONENT_BYTES_CACHE = {};
export async function readComponentBytes(componentPath) {
    let componentBytes;
    if (!COMPONENT_BYTES_CACHE[componentPath]) {
        COMPONENT_BYTES_CACHE[componentPath] = await readFile(componentPath);
    }
    componentBytes = COMPONENT_BYTES_CACHE[componentPath];
    return componentBytes;
}
