import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const runtimeBuild = new URL('../../../jco-cm-runtime/dist/', import.meta.url);
const runtimeManifest = new URL('../../../jco-cm-runtime/package.json', import.meta.url);
const overrides = new URL('../fixtures/custom-runtime/', import.meta.url);

/** Create a standalone provider from the runtime build plus test-only observations. */
export async function writeCustomRuntime(destination: string): Promise<URL> {
    await cp(runtimeBuild, destination, { recursive: true });
    await rename(join(destination, 'intrinsics/resource.js'), join(destination, 'intrinsics/resource-default.js'));
    await cp(overrides, destination, { recursive: true });
    return pathToFileURL(destination + '/');
}

/**
 * Write an ES module package into `dir` whose `root` directory provides the runtime:
 * the intrinsic module `name` is `source`, and every other one re-exports the runtime build.
 */
export async function writeRuntimeProvider(dir: string, name: string, source: string, root = 'provider') {
    const { exports } = JSON.parse(await readFile(runtimeManifest, 'utf8')) as { exports: Record<string, unknown> };
    const prefix = './intrinsics/';
    const modules = Object.keys(exports)
        .filter((subpath) => subpath.startsWith(prefix))
        .map((subpath) => subpath.slice(prefix.length));
    if (!modules.includes(name)) {
        throw new Error(`the runtime has no intrinsic module named [${name}]`);
    }
    await mkdir(join(dir, root, 'intrinsics'), { recursive: true });
    await Promise.all([
        writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' })),
        writeFile(join(dir, root, 'runtime.js'), 'export const CM_RUNTIME_API_VERSION = 1;'),
        ...modules.map((module) =>
            writeFile(
                join(dir, root, `intrinsics/${module}.js`),
                module === name
                    ? source
                    : `export * from ${JSON.stringify(new URL(`intrinsics/${module}.js`, runtimeBuild).href)};`,
            ),
        ),
    ]);
}
