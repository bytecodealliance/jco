import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { filesystem } from "@bytecodealliance/preview2-shim";
import { readFileAt, writeFileAt } from "@bytecodealliance/preview2-shim/helpers/filesystem";
import { assert, suite, test } from "vitest";

/**
 * Run `body` against a fresh host directory mounted at its own virtual path, then remove it.
 *
 * Each test gets a distinct preopen, so the suite can run concurrently without tests observing
 * each other's files.
 */
async function withPreopen(
    body: (virtualPath: string, hostDir: string) => Promise<void>,
): Promise<void> {
    const hostDir = await mkdtemp(join(tmpdir(), "jco-fs-helpers-"));
    try {
        const virtualPath = `/${basename(hostDir)}`;
        filesystem._addPreopen(virtualPath, hostDir);
        await body(virtualPath, hostDir);
    } finally {
        await rm(hostDir, { recursive: true, force: true });
    }
}

async function hostBytes(path: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(path));
}

suite("Node filesystem helpers", () => {
    test.concurrent("writeFileAt writes through to the host directory behind the preopen", () =>
        withPreopen(async (root, hostDir) => {
            writeFileAt(root, "output.txt", new Uint8Array([1, 2, 3]));

            assert.deepStrictEqual(
                await hostBytes(join(hostDir, "output.txt")),
                new Uint8Array([1, 2, 3]),
            );
            assert.deepStrictEqual(readFileAt(root, "output.txt"), new Uint8Array([1, 2, 3]));
        }));

    test.concurrent("writeFileAt creates missing intermediate directories and reuses existing ones", () =>
        withPreopen(async (root, hostDir) => {
            await mkdir(join(hostDir, "existing"));

            writeFileAt(root, "existing/nested/output.txt", new Uint8Array([4, 5]));

            assert.deepStrictEqual(
                await hostBytes(join(hostDir, "existing", "nested", "output.txt")),
                new Uint8Array([4, 5]),
            );
        }));

    test.concurrent("writeFileAt truncates by default and appends when asked", () =>
        withPreopen(async (root, hostDir) => {
            writeFileAt(root, "log.txt", new Uint8Array([1, 2, 3]));
            writeFileAt(root, "log.txt", new Uint8Array([9]));
            assert.deepStrictEqual(readFileAt(root, "log.txt"), new Uint8Array([9]));

            writeFileAt(root, "log.txt", new Uint8Array([1, 2]), { append: true });
            assert.deepStrictEqual(
                await hostBytes(join(hostDir, "log.txt")),
                new Uint8Array([9, 1, 2]),
            );
        }));

    test.concurrent("readFileAt reads a host file larger than a single read chunk", () =>
        withPreopen(async (root, hostDir) => {
            const data = new Uint8Array(2 * 1024 * 1024 + 17);
            for (let i = 0; i < data.length; i++) {
                data[i] = i % 256;
            }
            await writeFile(join(hostDir, "big.bin"), data);

            assert.deepStrictEqual(readFileAt(root, "big.bin"), data);
        }));

    test.concurrent("helpers reject unknown preopens and missing files with WASI errors", () =>
        withPreopen(async (root) => {
            assert.throws(() => readFileAt("/missing", "file.txt"), /no preopen/);
            let caught: unknown;
            try {
                readFileAt(root, "absent.txt");
            } catch (err) {
                caught = err;
            }
            assert.strictEqual(caught, "no-entry");
        }));
});
