// A file that reports itself as regular and still answers EAGAIN cannot be
// made on demand, so these tests put the answer in front of `node:fs`.
import { constants, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, assert, beforeEach, test, vi } from "vitest";

const wouldBlock = vi.hoisted(() => ({ reads: 0, writes: 0 }));

vi.mock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    /**
     * Wrap an operation to fail with EAGAIN for as many calls as are requested.
     *
     * @param kind - the counter of calls left to fail
     * @param operation - the `node:fs` function
     * @returns the wrapped function
     */
    function sometimesBlocking<A extends unknown[], R>(
        kind: "reads" | "writes",
        operation: (...args: A) => R,
    ) {
        return (...args: A): R => {
            if (wouldBlock[kind] > 0) {
                wouldBlock[kind]--;
                throw Object.assign(new Error("EAGAIN: resource temporarily unavailable"), {
                    code: "EAGAIN",
                });
            }
            return operation(...args);
        };
    }
    return {
        ...actual,
        readSync: sometimesBlocking("reads", actual.readSync),
        writeSync: sometimesBlocking("writes", actual.writeSync),
    };
});
vi.mock("../src/io/worker-io.js", () => ({
    STREAM_CHUNK: 64 * 1024,
    earlyDispose: (finalizer: () => void) => finalizer(),
    hostSplice: vi.fn(),
    lastOperationFailed: (error: Error) => ({ tag: "last-operation-failed", val: error }),
    readyPollableCreate: vi.fn(),
    registerDispose: (_resource: object, _parent: unknown, _id: number, drop: () => void) => drop,
    streams: { InputStream: class {}, OutputStream: class {} },
    streamTrap: vi.fn(),
}));

import { openMainThreadFile } from "../src/io/main-thread-file.js";

const decoder = new TextDecoder();
let directory: string;
let path: string;

beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "jco-p2-wait-"));
    path = join(directory, "file.txt");
    writeFileSync(path, "hello");
    wouldBlock.reads = 0;
    wouldBlock.writes = 0;
});

afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
});

/**
 * @param call - a stream call expected to throw a stream error
 * @returns the tag of the stream error
 */
function tagThrownBy(call: () => unknown): string | undefined {
    try {
        call();
    } catch (error) {
        return (error as { tag?: string }).tag;
    }
    return undefined;
}

test("descriptor reads and writes wait for a file that would block", () => {
    const file = openMainThreadFile(path, constants.O_RDWR)!;
    wouldBlock.reads = 3;
    assert.strictEqual(decoder.decode(file.read(5, 0).bytes), "hello");
    assert.strictEqual(wouldBlock.reads, 0);

    wouldBlock.writes = 3;
    assert.strictEqual(file.write(new TextEncoder().encode("J"), 0), 1);
    assert.strictEqual(decoder.decode(file.read(5, 0).bytes), "Jello");
    file.close();
});

test("a blocking stream read waits, and a plain read returns nothing yet", () => {
    const file = openMainThreadFile(path, constants.O_RDONLY)!;
    const stream = file.readViaStream(0n);

    wouldBlock.reads = 1;
    assert.deepStrictEqual(stream.read(2n), new Uint8Array(0));
    // The stream is not stuck in an error: the bytes arrive on the next read.
    assert.strictEqual(decoder.decode(stream.read(2n)), "he");

    wouldBlock.reads = 3;
    assert.strictEqual(decoder.decode(stream.blockingRead(10n)), "llo");
    assert.strictEqual(wouldBlock.reads, 0);
    assert.strictEqual(
        tagThrownBy(() => stream.read(1n)),
        "closed",
    );
    stream[Symbol.dispose]();
    file.close();
});

test("a stream write waits until every byte is written", () => {
    const file = openMainThreadFile(path, constants.O_RDWR)!;
    const stream = file.writeViaStream(1n);
    wouldBlock.writes = 3;
    stream.write(new TextEncoder().encode("ipp"));
    wouldBlock.writes = 2;
    stream.blockingWriteAndFlush(new TextEncoder().encode("y"));
    stream.blockingFlush();
    assert.strictEqual(decoder.decode(file.read(5, 0).bytes), "hippy");
    stream[Symbol.dispose]();
    file.close();
});

test("other errors still fail the stream for good", () => {
    const file = openMainThreadFile(path, constants.O_RDONLY)!;
    const stream = file.writeViaStream(0n);
    assert.strictEqual(
        tagThrownBy(() => stream.blockingWriteAndFlush(new Uint8Array(1))),
        "last-operation-failed",
    );
    assert.strictEqual(
        tagThrownBy(() => stream.checkWrite()),
        "last-operation-failed",
    );
    stream[Symbol.dispose]();
    file.close();
});
