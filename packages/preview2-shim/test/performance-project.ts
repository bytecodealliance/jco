// Runs only in the "performance" test project, whose setup file turns the
// `performance` options on by default. If that default stopped reaching the
// suites, they would pass while testing the I/O worker a second time.
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { filesystem } from "@bytecodealliance/preview2-shim";
import { inputStreamId } from "@bytecodealliance/preview2-shim/io-worker";
import { assert, test } from "vitest";

import type { Descriptor } from "../types/interfaces/wasi-filesystem-types.js";

const symbolDispose = Symbol.dispose;

/**
 * Read `which.txt` through a preopen created without options of its own.
 *
 * @param path - the host path of the preopen
 * @returns the contents, and whether the I/O worker served the stream they were read from
 */
function readWhich(path: string): { contents: string; servedByWorker: boolean } {
    const root = filesystem._createPreopenDescriptor(path) as unknown as Descriptor;
    const file = root.openAt({}, "which.txt", {}, { read: true });
    const stream = file.readViaStream(0n);
    try {
        return {
            contents: new TextDecoder().decode(stream.blockingRead(100n)),
            servedByWorker: inputStreamId(stream as never) !== undefined,
        };
    } finally {
        stream[symbolDispose]();
        file[symbolDispose]();
    }
}

test("the performance project runs with the options on", () => {
    const directory = mkdtempSync(join(tmpdir(), "jco-p2-performance-project-"));
    try {
        writeFileSync(join(directory, "which.txt"), "here");
        assert.deepStrictEqual(readWhich(directory), { contents: "here", servedByWorker: false });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test.skipIf(process.platform === "win32")("the performance project caches directory paths", () => {
    const directory = mkdtempSync(join(tmpdir(), "jco-p2-performance-project-"));
    try {
        const link = join(directory, "current");
        const targets = ["first", "second"].map((name) => {
            const target = mkdtempSync(join(directory, `${name}-`));
            writeFileSync(join(target, "which.txt"), name);
            return target;
        });
        symlinkSync(targets[0], link);
        const root = filesystem._createPreopenDescriptor(link) as unknown as Descriptor;
        assert.strictEqual(root.statAt({}, "which.txt").size, 5n);
        rmSync(link);
        symlinkSync(targets[1], link);
        // "second" is six bytes long: the path found first is still the one in use.
        assert.strictEqual(root.statAt({}, "which.txt").size, 5n);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
