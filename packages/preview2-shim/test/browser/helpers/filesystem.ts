import { suite, test, assert } from "vitest";

let preopenCount = 0;

/** Mount a fresh in-memory directory at its own virtual path so concurrent tests never share a tree. */
async function freshPreopen(): Promise<string> {
    const { _addPreopen } = await import("../../../src/browser/filesystem.js");
    const virtualPath = `/preopen-${preopenCount++}`;
    _addPreopen(virtualPath, { dir: {} });
    return virtualPath;
}

function helpers() {
    return import("../../../src/browser/helpers/filesystem.js");
}

suite("Browser filesystem helpers", () => {
    test.concurrent("writeFileAt and readFileAt round-trip bytes without a guest", async () => {
        const [root, { writeFileAt, readFileAt }] = await Promise.all([freshPreopen(), helpers()]);

        writeFileAt(root, "output.txt", new Uint8Array([1, 2, 3]));

        assert.deepStrictEqual(readFileAt(root, "output.txt"), new Uint8Array([1, 2, 3]));
    });

    test.concurrent("writeFileAt creates missing intermediate directories", async () => {
        const [root, { writeFileAt, readFileAt }] = await Promise.all([freshPreopen(), helpers()]);

        writeFileAt(root, "nested/dir/output.txt", new Uint8Array([4, 5]));

        assert.deepStrictEqual(readFileAt(root, "nested/dir/output.txt"), new Uint8Array([4, 5]));
    });

    test.concurrent("writeFileAt truncates by default and appends when asked", async () => {
        const [root, { writeFileAt, readFileAt }] = await Promise.all([freshPreopen(), helpers()]);

        writeFileAt(root, "log.txt", new Uint8Array([1, 2, 3]));
        writeFileAt(root, "log.txt", new Uint8Array([9]));
        assert.deepStrictEqual(readFileAt(root, "log.txt"), new Uint8Array([9]));

        writeFileAt(root, "log.txt", new Uint8Array([1, 2]), { append: true });
        assert.deepStrictEqual(readFileAt(root, "log.txt"), new Uint8Array([9, 1, 2]));
    });

    test.concurrent("writeFileAt resolves the virtual path against the matching preopen", async () => {
        const [first, second, { writeFileAt, readFileAt }] = await Promise.all([
            freshPreopen(),
            freshPreopen(),
            helpers(),
        ]);

        writeFileAt(second, "file.txt", new Uint8Array([7]));

        assert.deepStrictEqual(readFileAt(second, "file.txt"), new Uint8Array([7]));
        assert.throws(() => readFileAt(first, "file.txt"));
        assert.throws(() => readFileAt("/missing", "file.txt"), /no preopen/);
    });

    test.concurrent("readFileAt reads a file larger than a single read chunk", async () => {
        const [root, { writeFileAt, readFileAt }] = await Promise.all([freshPreopen(), helpers()]);
        const data = new Uint8Array(2 * 1024 * 1024 + 17);
        for (let i = 0; i < data.length; i++) {
            data[i] = i % 256;
        }

        writeFileAt(root, "big.bin", data);

        assert.deepStrictEqual(readFileAt(root, "big.bin"), data);
    });
});
