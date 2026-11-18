// Runs only in the "performance" test project, whose setup file turns the
// `performance` options on by default. If that default stopped reaching the
// suites, they would pass while testing the I/O worker a second time.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
