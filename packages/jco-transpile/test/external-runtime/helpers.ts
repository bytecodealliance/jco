import { cp, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const runtimeBuild = new URL('../../../jco-cm-runtime/dist/', import.meta.url);
const overrides = new URL('../fixtures/custom-runtime/', import.meta.url);

/** Create a standalone provider from the runtime build plus test-only observations. */
export async function writeCustomRuntime(destination: string): Promise<URL> {
    await cp(runtimeBuild, destination, { recursive: true });
    await rename(join(destination, 'intrinsics/resource.js'), join(destination, 'intrinsics/resource-default.js'));
    await cp(overrides, destination, { recursive: true });
    return pathToFileURL(destination + '/');
}
