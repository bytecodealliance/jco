import { execFileSync, spawn } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clocks, filesystem, io } from "@bytecodealliance/preview2-shim";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { inputStreamId, outputStreamId } from "@bytecodealliance/preview2-shim/io-worker";
import { afterEach, assert, beforeEach, suite, test } from "vitest";

import {
    checkWorkerPollId,
    createReadyPollableRep,
    disposeReadyPollableRep,
    FIRST_READY_REP,
    LAST_READY_REP,
    READY_REP_COUNT,
} from "../dist/io/ready-pollables.js";

import type { Descriptor } from "../types/interfaces/wasi-filesystem-types.js";
import type { InputStream, OutputStream } from "../types/interfaces/wasi-io-streams.js";

const symbolDispose = Symbol.dispose;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const isWindows = process.platform === "win32";

const MAIN_THREAD = { performance: { mainThreadFilesystem: true } };
const CONTENTS = "0123456789abcdef";

let directories: string[];

beforeEach(() => {
    directories = [];
    // The suite states the options of every preopen it creates.
    filesystem._setPerformance({});
});

afterEach(() => {
    filesystem._setPerformance({});
    filesystem._clearPreopens();
    for (const directory of directories) {
        rmSync(directory, { recursive: true, force: true });
    }
});

/**
 * Create a host directory holding `file.txt`, `nested/inner.txt` and a symlink to the file.
 *
 * @returns the host path, removed after the test
 */
function createDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "jco-p2-performance-"));
    directories.push(directory);
    writeFileSync(join(directory, "file.txt"), CONTENTS);
    mkdirSync(join(directory, "nested"));
    writeFileSync(join(directory, "nested", "inner.txt"), "inner");
    if (!isWindows) {
        symlinkSync("file.txt", join(directory, "link.txt"));
    }
    return directory;
}

/**
 * Create a preopen for a fresh host directory.
 *
 * @param options - the preopen's filesystem options
 * @returns the preopen descriptor and its host path
 */
function createRoot(options: filesystem.NodeFilesystemOptions = {}): [Descriptor, string] {
    const directory = createDirectory();
    const root = filesystem._createPreopenDescriptor(directory, options) as unknown as Descriptor;
    return [root, directory];
}

/**
 * Whether the I/O worker serves a stream, rather than the main thread.
 *
 * @param stream - a stream
 * @returns true when the stream has an id in the I/O worker
 */
function servedByWorker(stream: InputStream | OutputStream): boolean {
    const id =
        stream instanceof io.streams.InputStream
            ? inputStreamId(stream as never)
            : outputStreamId(stream as never);
    return id !== undefined;
}

/**
 * Whether the I/O worker serves the regular files opened through a preopen.
 *
 * @param root - a preopen of a directory made by `createDirectory`
 * @returns true when a stream of `file.txt` has an id in the I/O worker
 */
function opensInWorker(root: Descriptor): boolean {
    const file = root.openAt({}, "file.txt", {}, { read: true });
    const stream = file.readViaStream(0n);
    try {
        return servedByWorker(stream);
    } finally {
        drop(stream, file);
    }
}

/**
 * @param pollable - any pollable
 * @returns the rep generated bindings identify it by
 */
function repOf(pollable: object): number {
    return (pollable as Record<symbol, number>)[Symbol.for("cabiRep")];
}

/**
 * Drop resources in the order given.
 *
 * @param resources - resources to drop
 */
function drop(...resources: unknown[]) {
    for (const resource of resources) {
        (resource as Disposable)[symbolDispose]();
    }
}

/**
 * Read a stream to its end with blocking reads.
 *
 * @param stream - the stream to read
 * @param chunk - bytes requested per read
 * @returns everything read, decoded as UTF-8
 */
function readToEnd(stream: InputStream, chunk = 5n): string {
    const parts: Uint8Array[] = [];
    try {
        for (;;) {
            parts.push(stream.blockingRead(chunk));
        }
    } catch (error) {
        assert.deepStrictEqual(error, { tag: "closed" });
    }
    return decoder.decode(Buffer.concat(parts));
}

/**
 * Describe what a call throws in a form that compares across both backends.
 *
 * @param call - the call expected to throw
 * @returns the WASI error code, the stream error with its filesystem error code, or the Node.js error code
 */
function thrownBy(call: () => unknown): unknown {
    try {
        call();
    } catch (error) {
        if (typeof error === "string") {
            return error;
        }
        const streamError = error as { tag?: string; val?: object };
        if (streamError.tag === "last-operation-failed") {
            return {
                tag: streamError.tag,
                isIoError: streamError.val instanceof io.error.Error,
                code: filesystem.types.filesystemErrorCode(streamError.val as never),
            };
        }
        if (streamError.tag) {
            return { tag: streamError.tag };
        }
        return { nodeErrorCode: (error as NodeJS.ErrnoException).code };
    }
    return "did not throw";
}

suite("Node filesystem performance options", () => {
    test("regular files are opened in the I/O worker by default", () => {
        const [root] = createRoot();
        assert.isTrue(opensInWorker(root));
    });

    test("a preopen carries mainThreadFilesystem to its descendants", () => {
        const [root] = createRoot(MAIN_THREAD);
        assert.isFalse(opensInWorker(root));

        const nested = root.openAt({}, "nested", { directory: true }, { read: true });
        const inner = nested.openAt({}, "inner.txt", {}, { read: true });
        const stream = inner.readViaStream(0n);
        assert.isFalse(servedByWorker(stream));
        assert.strictEqual(readToEnd(stream), "inner");
        drop(stream, inner, nested);
    });

    test("createFilesystem, _setPreopens and _addPreopen accept the options", () => {
        const directory = createDirectory();

        const isolated = filesystem.createFilesystem({
            preopens: { "/": directory },
            ...MAIN_THREAD,
        });
        assert.isFalse(opensInWorker(isolated.preopens.getDirectories()[0][0]));

        filesystem._setPreopens({ "/set": directory }, MAIN_THREAD);
        filesystem._addPreopen("/added", directory, MAIN_THREAD);
        filesystem._addPreopen("/plain", directory);
        const shared = filesystem.preopens.getDirectories();
        assert.deepStrictEqual(
            shared.map(([descriptor, path]) => [path, opensInWorker(descriptor)]),
            [
                ["/set", false],
                ["/added", false],
                ["/plain", true],
            ],
        );
    });

    test("_setPerformance sets the default of preopens without their own options", () => {
        const [inherits] = createRoot();
        const [explicit] = createRoot({ performance: {} });
        assert.isTrue(opensInWorker(inherits));

        filesystem._setPerformance({ mainThreadFilesystem: true });
        assert.isFalse(opensInWorker(inherits));
        assert.isTrue(opensInWorker(explicit));

        filesystem._setPerformance();
        assert.isTrue(opensInWorker(inherits));
    });

    test("WASIShim applies performance to its sandbox preopens", () => {
        const directory = createDirectory();
        const preopensOf = (shim: WASIShim) =>
            shim.getImportObject()["wasi:filesystem/preopens"].getDirectories();

        const [[fast]] = preopensOf(
            new WASIShim({ sandbox: { preopens: { "/": directory } }, ...MAIN_THREAD }),
        );
        const [[plain]] = preopensOf(new WASIShim({ sandbox: { preopens: { "/": directory } } }));
        assert.isFalse(opensInWorker(fast));
        assert.isTrue(opensInWorker(plain));
    });

    test("WASIShim leaves the shared preopens to the module-level options", () => {
        const directory = createDirectory();
        filesystem._addPreopen("/shared", directory);
        const preopens = new WASIShim(MAIN_THREAD).getImportObject()["wasi:filesystem/preopens"];
        assert.isTrue(opensInWorker(preopens.getDirectories()[0][0]));

        filesystem._setPerformance({ mainThreadFilesystem: true });
        assert.isFalse(opensInWorker(preopens.getDirectories()[0][0]));
    });
});

suite("Main-thread filesystem: what stays in the I/O worker", () => {
    test.skipIf(isWindows)("a character device is opened in the worker", () => {
        const root = filesystem._createPreopenDescriptor(
            "/dev",
            MAIN_THREAD,
        ) as unknown as Descriptor;
        const device = root.openAt({}, "null", {}, { read: true });
        assert.strictEqual(device.getType(), "character-device");

        const stream = device.readViaStream(0n);
        assert.isTrue(servedByWorker(stream));
        drop(stream, device);
    });

    test.skipIf(isWindows)("a FIFO is opened in the worker", async (context) => {
        const [root, directory] = createRoot(MAIN_THREAD);
        const fifo = join(directory, "fifo");
        try {
            execFileSync("mkfifo", [fifo]);
        } catch {
            context.skip("mkfifo is not available");
        }

        // Opening a FIFO waits for its other end, which the child process opens.
        const writer = spawn("sh", ["-c", 'printf fifo > "$1"', "sh", fifo], { stdio: "ignore" });
        const exited = new Promise((resolve) => writer.once("exit", resolve));

        const descriptor = root.openAt({}, "fifo", {}, { read: true });
        assert.strictEqual(descriptor.getType(), "fifo");
        assert.strictEqual(descriptor.stat().type, "fifo");
        const stream = descriptor.readViaStream(0n);
        assert.isTrue(servedByWorker(stream));

        drop(stream, descriptor);
        await exited;
    });

    test.skipIf(isWindows)(
        "a symlink that must not be followed is refused as in the worker",
        () => {
            const [fast] = createRoot(MAIN_THREAD);
            const [plain] = createRoot();
            const open = (root: Descriptor) =>
                thrownBy(() =>
                    root.openAt({ symlinkFollow: false }, "link.txt", {}, { read: true }),
                );
            assert.strictEqual(open(fast), "loop");
            assert.strictEqual(open(plain), "loop");
        },
    );
});

suite("Main-thread filesystem: pollables", () => {
    let root: Descriptor;
    let file: Descriptor;
    let input: InputStream;
    let output: OutputStream;

    beforeEach(() => {
        [root] = createRoot(MAIN_THREAD);
        file = root.openAt({}, "file.txt", {}, { read: true, write: true });
        input = file.readViaStream(0n);
        output = file.writeViaStream(0n);
    });

    afterEach(() => {
        drop(input, output, file);
    });

    test("a file stream pollable is ready and never blocks", () => {
        for (const stream of [input, output]) {
            const pollable = stream.subscribe();
            assert.isTrue(pollable.ready());
            pollable.block();
            assert.deepStrictEqual([...io.poll.poll([pollable])], [0]);
            drop(pollable);
        }
    });

    test("poll reports every file pollable of a list", () => {
        const pollables = [input.subscribe(), output.subscribe(), input.subscribe()];
        assert.deepStrictEqual([...io.poll.poll(pollables)], [0, 1, 2]);
        drop(...pollables);
    });

    test("poll does not wait for a worker pollable beside a file pollable", () => {
        const never = clocks.monotonicClock.subscribeDuration(3_600_000_000_000n);
        const filePollable = input.subscribe();

        assert.deepStrictEqual([...io.poll.poll([never, filePollable])], [1]);
        assert.deepStrictEqual([...io.poll.poll([filePollable, never])], [0]);
        assert.isFalse(never.ready());
        drop(never, filePollable);
    });

    test("poll merges ready worker pollables in list order", () => {
        const never = clocks.monotonicClock.subscribeDuration(3_600_000_000_000n);
        const elapsedFirst = clocks.monotonicClock.subscribeDuration(0n);
        const elapsedSecond = clocks.monotonicClock.subscribeDuration(0n);
        const filePollable = output.subscribe();
        elapsedFirst.block();
        elapsedSecond.block();

        const ready = io.poll.poll([elapsedFirst, never, filePollable, never, elapsedSecond]);
        assert.instanceOf(ready, Uint32Array);
        assert.deepStrictEqual([...ready], [0, 2, 4]);
        drop(never, elapsedFirst, elapsedSecond, filePollable);
    });

    test("a worker pollable polled beside a file pollable is reported once it is ready", () => {
        const timer = clocks.monotonicClock.subscribeDuration(20_000_000n);
        const filePollable = input.subscribe();

        const deadline = Date.now() + 10_000;
        let ready: number[] = [];
        while (!ready.includes(1) && Date.now() < deadline) {
            ready = [...io.poll.poll([filePollable, timer])];
            assert.include(ready, 0);
        }
        assert.deepStrictEqual(ready, [0, 1]);
        drop(timer, filePollable);
    });

    test("polling an empty list still traps", () => {
        assert.throws(() => io.poll.poll([]), /attempt to poll on empty list/);
    });

    test("bindings that lower pollables themselves reach file pollables by rep", () => {
        const cabiLower = Symbol.for("cabiLower");
        const cabiRep = Symbol.for("cabiRep");
        const OWN_FLAG = 1 << 30;
        const repOf = (pollable: object) => (pollable as Record<symbol, number>)[cabiRep];

        const never = clocks.monotonicClock.subscribeDuration(3_600_000_000_000n);
        const filePollable = input.subscribe();
        assert.notStrictEqual(repOf(never), repOf(filePollable));

        // A resource table as generated bindings keep it: [next free, rep | flag] per handle.
        const table = [0, 0, 0, repOf(never) | OWN_FLAG, 0, repOf(filePollable) | OWN_FLAG];
        const memory = new WebAssembly.Memory({ initial: 1 });
        const realloc = () => 1024;
        const context = { memory, realloc, resourceTables: [table] };
        const lower = <T>(fn: object): T =>
            (fn as Record<symbol, (context: object) => T>)[cabiLower](context);

        const ready = lower<(handle: number) => number>(io.poll.Pollable.prototype.ready);
        assert.strictEqual(ready(1), 0);
        assert.strictEqual(ready(2), 1);
        lower<(handle: number) => void>(io.poll.Pollable.prototype.block)(2);

        new Uint32Array(memory.buffer, 16, 2).set([1, 2]);
        lower<(list: number, length: number, ret: number) => number>(io.poll.poll)(16, 2, 64);
        const [pointer, length] = new Uint32Array(memory.buffer, 64, 2);
        assert.deepStrictEqual([...new Uint32Array(memory.buffer, pointer, length)], [1]);

        drop(never, filePollable);
    });

    test("the rep of a dropped pollable is used again", () => {
        const first = input.subscribe();
        const second = output.subscribe();
        const reps = [repOf(first), repOf(second)];
        assert.notStrictEqual(reps[0], reps[1]);
        assert.isTrue(reps.every((rep) => rep >= FIRST_READY_REP && rep <= LAST_READY_REP));
        drop(first, second);

        // However many pollables come and go, they stay within the reps of two.
        for (let i = 0; i < 10_000; i++) {
            const pollable = input.subscribe();
            assert.include(reps, repOf(pollable));
            drop(pollable);
        }
        const again = [input.subscribe(), output.subscribe()];
        assert.sameMembers(again.map(repOf), reps);
        drop(...again);
    });

    test("worker poll ids and ready reps cannot meet", () => {
        assert.strictEqual(LAST_READY_REP, 2 ** 30 - 1);
        assert.strictEqual(FIRST_READY_REP, LAST_READY_REP + 1 - READY_REP_COUNT);
        assert.strictEqual(checkWorkerPollId(FIRST_READY_REP - 1), FIRST_READY_REP - 1);
        assert.throws(() => checkWorkerPollId(FIRST_READY_REP), /no poll id left/);

        const timer = clocks.monotonicClock.subscribeDuration(0n);
        assert.isBelow(repOf(timer), FIRST_READY_REP);
        drop(timer);
    });

    test("more live pollables than there are reps is an error, not a collision", () => {
        const owner = { pollables: 0 };
        const reps: number[] = [];
        try {
            assert.throws(() => {
                for (let i = 0; i <= READY_REP_COUNT; i++) {
                    reps.push(createReadyPollableRep(owner));
                }
            }, /pollables of main-thread file streams are alive/);
            assert.isAtMost(reps.length, READY_REP_COUNT);
            assert.strictEqual(Math.min(...reps.slice(-2)), FIRST_READY_REP);
        } finally {
            reps.forEach(disposeReadyPollableRep);
        }
        assert.strictEqual(owner.pollables, 0);

        const pollable = input.subscribe();
        assert.isTrue(pollable.ready());
        drop(pollable);
    });

    test("a stream cannot be dropped before its pollables", () => {
        const pollable = input.subscribe();
        const second = file.readViaStream(0n);
        const secondPollable = second.subscribe();

        assert.throws(() => drop(second), /child poll resource which has not yet been dropped/);
        drop(secondPollable, pollable);
    });
});

/**
 * Scenarios that must behave the same whichever backend serves the file. Each
 * returns what it observed, and the two observations are compared.
 */
const SCENARIOS: Array<[string, (root: Descriptor, directory: string) => unknown]> = [
    [
        "open-at error codes",
        (root) => ({
            missing: thrownBy(() => root.openAt({}, "missing.txt", {}, { read: true })),
            exclusive: thrownBy(() =>
                root.openAt({}, "file.txt", { create: true, exclusive: true }, { write: true }),
            ),
            notDirectory: thrownBy(() =>
                root.openAt({}, "file.txt", { directory: true }, { read: true }),
            ),
            trailingSlash: thrownBy(() => root.openAt({}, "file.txt/", {}, { read: true })),
            writableDirectory: thrownBy(() => root.openAt({}, "nested", {}, { write: true })),
            missingParent: thrownBy(() =>
                root.openAt({}, "absent/file.txt", { create: true }, { write: true }),
            ),
        }),
    ],
    [
        "type, stat and metadata-hash",
        (root) => {
            const file = root.openAt({}, "file.txt", {}, { read: true });
            const nested = root.openAt({}, "nested", { directory: true }, { read: true });
            const { type, size, linkCount } = file.stat();
            const observed = {
                fileType: file.getType(),
                stat: { type, size, linkCount },
                hashMatchesPath:
                    JSON.stringify(file.metadataHash(), String) ===
                    JSON.stringify(root.metadataHashAt({}, "file.txt"), String),
                directoryType: nested.getType(),
                directoryStatType: nested.stat().type,
                directoryHashMatchesPath:
                    JSON.stringify(nested.metadataHash(), String) ===
                    JSON.stringify(root.metadataHashAt({}, "nested"), String),
            };
            assert.deepStrictEqual(observed.stat, {
                type: "regular-file",
                size: BigInt(CONTENTS.length),
                linkCount: 1n,
            });
            assert.isTrue(observed.hashMatchesPath);
            drop(file, nested);
            return observed;
        },
    ],
    [
        "descriptor read and write at offsets",
        (root, directory) => {
            const file = root.openAt({}, "file.txt", {}, { read: true, write: true });
            const written = file.write(encoder.encode("XY"), 3n);
            const [middle, middleEof] = file.read(4n, 2n);
            const [tail, tailEof] = file.read(100n, 14n);
            const [end, endEof] = file.read(4n, 16n);
            const observed = {
                written,
                middle: [decoder.decode(middle), middleEof],
                tail: [decoder.decode(tail), tailEof],
                end: [end.byteLength, endEof],
                host: readFileSync(join(directory, "file.txt"), "utf8"),
            };
            assert.deepStrictEqual(observed, {
                written: 2n,
                middle: ["2XY5", false],
                tail: ["ef", false],
                end: [0, true],
                host: "012XY56789abcdef",
            });
            drop(file);
            return observed;
        },
    ],
    [
        "descriptor read and write without the access mode",
        (root) => {
            const readOnly = root.openAt({}, "file.txt", {}, { read: true });
            const writeOnly = root.openAt({}, "file.txt", {}, { write: true });
            const observed = {
                write: thrownBy(() => readOnly.write(encoder.encode("x"), 0n)),
                read: thrownBy(() => writeOnly.read(1n, 0n)),
            };
            assert.deepStrictEqual(observed, {
                write: { nodeErrorCode: "EBADF" },
                read: { nodeErrorCode: "EBADF" },
            });
            drop(readOnly, writeOnly);
            return observed;
        },
    ],
    [
        "descriptor read of more bytes than can be allocated",
        (root) => {
            const file = root.openAt({}, "file.txt", {}, { read: true });
            const read = (length: bigint, offset: bigint) => {
                const [bytes, eof] = file.read(length, offset);
                return [decoder.decode(bytes), eof];
            };
            const observed = {
                rest: read(2n ** 40n, 10n),
                largest: read(2n ** 64n - 1n, 0n),
                atEnd: read(2n ** 40n, BigInt(CONTENTS.length)),
            };
            assert.deepStrictEqual(observed, {
                rest: ["abcdef", false],
                largest: [CONTENTS, false],
                atEnd: ["", true],
            });
            drop(file);
            return observed;
        },
    ],
    [
        "streams from an offset that is out of range",
        (root) => {
            const file = root.openAt({}, "file.txt", {}, { read: true, write: true });
            const observed = {
                read: thrownBy(() => file.readViaStream(2n ** 63n)),
                write: thrownBy(() => file.writeViaStream(2n ** 63n)),
            };
            assert.deepStrictEqual(observed.read, { nodeErrorCode: "ERR_OUT_OF_RANGE" });
            // The file is still usable and nothing is left holding it open.
            const stream = file.readViaStream(14n);
            assert.strictEqual(readToEnd(stream), "ef");
            drop(stream, file);
            return observed;
        },
    ],
    [
        "stream read from an offset to the end",
        (root) => {
            const file = root.openAt({}, "file.txt", {}, { read: true });
            const stream = file.readViaStream(6n);
            const observed = {
                text: readToEnd(stream),
                afterEnd: thrownBy(() => stream.blockingRead(1n)),
                readAfterEnd: thrownBy(() => stream.read(1n)),
            };
            assert.deepStrictEqual(observed, {
                text: "6789abcdef",
                afterEnd: { tag: "closed" },
                readAfterEnd: { tag: "closed" },
            });
            drop(stream, file);
            return observed;
        },
    ],
    [
        "stream write from an offset",
        (root, directory) => {
            const file = root.openAt({}, "file.txt", {}, { read: true, write: true });
            const stream = file.writeViaStream(2n);
            const permit = stream.checkWrite();
            assert.isTrue(permit > 0n);
            stream.write(encoder.encode("AB"));
            stream.flush();
            stream.blockingFlush();
            stream.blockingWriteAndFlush(encoder.encode("CD"));
            const pollable = stream.subscribe();
            pollable.block();
            drop(pollable);
            stream.checkWrite();
            stream.writeZeroes(2n);
            stream.blockingFlush();
            stream.blockingWriteZeroesAndFlush(1n);
            drop(stream);
            const host = readFileSync(join(directory, "file.txt"), "utf8");
            assert.strictEqual(host, "01ABCD\0\0\x009abcdef");
            drop(file);
            return host;
        },
    ],
    [
        "append-via-stream",
        (root, directory) => {
            const file = root.openAt({}, "file.txt", {}, { read: true, write: true });
            const stream = file.appendViaStream();
            stream.blockingWriteAndFlush(encoder.encode("+1"));
            stream.blockingWriteAndFlush(encoder.encode("+2"));
            drop(stream);
            const host = readFileSync(join(directory, "file.txt"), "utf8");
            assert.strictEqual(host, `${CONTENTS}+1+2`);
            drop(file);
            return host;
        },
    ],
    [
        "stream write to a descriptor opened for reading",
        (root) => {
            const file = root.openAt({}, "file.txt", {}, { read: true });
            const stream = file.writeViaStream(0n);
            const observed = {
                first: thrownBy(() => stream.blockingWriteAndFlush(encoder.encode("x"))),
                second: thrownBy(() => stream.blockingWriteAndFlush(encoder.encode("x"))),
                flush: thrownBy(() => stream.blockingFlush()),
                checkWrite: thrownBy(() => stream.checkWrite()),
            };
            const failed = {
                tag: "last-operation-failed",
                isIoError: true,
                code: "bad-descriptor",
            };
            assert.deepStrictEqual(observed, {
                first: failed,
                second: failed,
                flush: failed,
                checkWrite: failed,
            });
            drop(stream, file);
            return observed;
        },
    ],
    [
        "stream read from a descriptor opened for writing",
        (root) => {
            const file = root.openAt({}, "file.txt", {}, { write: true });
            const stream = file.readViaStream(0n);
            const observed = {
                first: thrownBy(() => stream.blockingRead(1n)),
                second: thrownBy(() => stream.blockingRead(1n)),
            };
            const failed = {
                tag: "last-operation-failed",
                isIoError: true,
                code: "bad-descriptor",
            };
            assert.deepStrictEqual(observed, { first: failed, second: failed });
            drop(stream, file);
            return observed;
        },
    ],
    [
        "stream read from a directory",
        (root) => {
            const nested = root.openAt({}, "nested", { directory: true }, { read: true });
            const stream = nested.readViaStream(0n);
            const observed = thrownBy(() => stream.blockingRead(1n));
            assert.deepStrictEqual(observed, {
                tag: "last-operation-failed",
                isIoError: true,
                code: "is-directory",
            });
            drop(stream, nested);
            return observed;
        },
    ],
    [
        "sync, sync-data, advise, set-size and set-times",
        (root) => {
            const file = root.openAt({}, "file.txt", {}, { read: true, write: true });
            const nested = root.openAt({}, "nested", { directory: true }, { read: true });
            file.sync();
            file.syncData();
            nested.sync();
            nested.syncData();
            file.advise(0n, 0n, "sequential");
            file.setSize(3n);
            const shrunk = file.stat().size;
            file.setSize(5n);
            const stamp = {
                tag: "timestamp",
                val: { seconds: 1_600_000_000n, nanoseconds: 0 },
            } as const;
            file.setTimes(stamp, stamp);
            const { size, dataAccessTimestamp, dataModificationTimestamp } = file.stat();
            const observed = {
                shrunk,
                size,
                contents: decoder.decode(file.read(10n, 0n)[0]),
                dataAccessTimestamp,
                dataModificationTimestamp,
                setSizeReadOnly: (() => {
                    const readOnly = root.openAt({}, "file.txt", {}, { read: true });
                    const thrown = thrownBy(() => readOnly.setSize(1n));
                    drop(readOnly);
                    return thrown;
                })(),
            };
            assert.deepStrictEqual(observed, {
                shrunk: 3n,
                size: 5n,
                contents: "012\0\0",
                dataAccessTimestamp: stamp.val,
                dataModificationTimestamp: stamp.val,
                setSizeReadOnly: "invalid",
            });
            drop(file, nested);
            return observed;
        },
    ],
    [
        "streams outlive their descriptor",
        (root, directory) => {
            const file = root.openAt({}, "file.txt", {}, { read: true, write: true });
            const input = file.readViaStream(10n);
            const output = file.writeViaStream(0n);
            drop(file);
            output.blockingWriteAndFlush(encoder.encode("zz"));
            const observed = {
                text: readToEnd(input),
                host: readFileSync(join(directory, "file.txt"), "utf8"),
            };
            assert.deepStrictEqual(observed, { text: "abcdef", host: "zz23456789abcdef" });
            drop(input, output);
            return observed;
        },
    ],
    [
        "dropping a stream before its pollable traps",
        (root) => {
            const file = root.openAt({}, "file.txt", {}, { read: true });
            const stream = file.readViaStream(0n);
            const pollable = stream.subscribe();
            let message = "";
            try {
                drop(stream);
            } catch (error) {
                message = (error as Error).message;
            }
            assert.match(message, /Cannot drop input stream as it has a child poll resource/);
            drop(pollable, file);
            return message;
        },
    ],
];

suite("Main-thread filesystem: same behavior as the I/O worker", () => {
    test.each(SCENARIOS)("%s", (_name, scenario) => {
        const [workerRoot, workerDirectory] = createRoot();
        const [mainThreadRoot, mainThreadDirectory] = createRoot(MAIN_THREAD);
        assert.isTrue(opensInWorker(workerRoot));
        assert.isFalse(opensInWorker(mainThreadRoot));

        const mainThread = scenario(mainThreadRoot, mainThreadDirectory);
        const worker = scenario(workerRoot, workerDirectory);
        assert.deepStrictEqual(mainThread, worker);
    });
});

suite("Main-thread filesystem: streams", () => {
    test("read returns data without a subscription and skip counts bytes", () => {
        const [root] = createRoot(MAIN_THREAD);
        const file = root.openAt({}, "file.txt", {}, { read: true });
        const stream = file.readViaStream(0n);

        assert.strictEqual(decoder.decode(stream.read(4n)), "0123");
        assert.strictEqual(stream.read(0n).byteLength, 0);
        assert.strictEqual(stream.skip(2n), 2n);
        assert.strictEqual(stream.blockingSkip(3n), 3n);
        assert.strictEqual(readToEnd(stream, 100n), "9abcdef");
        drop(stream, file);
    });

    test("a read returns at most 64 KiB and a large file is read whole", () => {
        const [root, directory] = createRoot(MAIN_THREAD);
        const data = new Uint8Array(200_000).map((_, index) => index % 251);
        writeFileSync(join(directory, "large.bin"), data);
        const file = root.openAt({}, "large.bin", {}, { read: true });
        const stream = file.readViaStream(0n);

        const parts: Uint8Array[] = [];
        try {
            for (;;) {
                const part = stream.blockingRead(1_000_000n);
                assert.isAtMost(part.byteLength, 64 * 1024);
                parts.push(part);
            }
        } catch (error) {
            assert.deepStrictEqual(error, { tag: "closed" });
        }
        assert.deepStrictEqual(new Uint8Array(Buffer.concat(parts)), data);
        drop(stream, file);
    });

    test("a write larger than one chunk is written whole", () => {
        const [root, directory] = createRoot(MAIN_THREAD);
        const data = new Uint8Array(200_000).map((_, index) => index % 241);
        const file = root.openAt({}, "large.bin", { create: true }, { write: true });
        const stream = file.writeViaStream(0n);

        stream.blockingWriteAndFlush(data);
        stream.blockingWriteZeroesAndFlush(100_000n);
        drop(stream, file);

        const host = new Uint8Array(readFileSync(join(directory, "large.bin")));
        assert.strictEqual(host.byteLength, 300_000);
        assert.deepStrictEqual(host.subarray(0, 200_000), data);
        assert.isTrue(host.subarray(200_000).every((byte) => byte === 0));
    });

    test("a created file is served on the main thread", () => {
        const [root, directory] = createRoot(MAIN_THREAD);
        const file = root.openAt({}, "new.txt", { create: true, exclusive: true }, { write: true });
        const stream = file.writeViaStream(0n);
        assert.isFalse(servedByWorker(stream));
        stream.blockingWriteAndFlush(encoder.encode("new"));
        drop(stream, file);
        assert.strictEqual(readFileSync(join(directory, "new.txt"), "utf8"), "new");
    });

    test("the descriptor closes its host file once its streams are dropped", () => {
        const [root, directory] = createRoot(MAIN_THREAD);
        const before = openFileCount();
        const file = root.openAt({}, "file.txt", {}, { read: true });
        const stream = file.readViaStream(0n);
        drop(file);
        assert.strictEqual(decoder.decode(stream.blockingRead(4n)), "0123");
        drop(stream);
        if (before !== undefined) {
            assert.strictEqual(openFileCount(), before);
        }
        assert.isTrue(existsSync(join(directory, "file.txt")));
    });
});

/**
 * Count this process's open file descriptors, where the platform exposes them.
 *
 * @returns the count, or undefined when it cannot be read
 */
function openFileCount(): number | undefined {
    try {
        return execFileSync("ls", [`/proc/${process.pid}/fd`])
            .toString()
            .split("\n").length;
    } catch {
        return undefined;
    }
}

suite("Main-thread filesystem: splice", () => {
    /**
     * Open `file.txt` for reading and a new `copy.txt` for writing under two preopens.
     *
     * @param sourceOptions - options of the preopen read from
     * @param sinkOptions - options of the preopen written to
     * @returns the streams, the path written to, and a function dropping everything
     */
    function openPair(
        sourceOptions: filesystem.NodeFilesystemOptions,
        sinkOptions: filesystem.NodeFilesystemOptions,
    ) {
        const [sourceRoot] = createRoot(sourceOptions);
        const [sinkRoot, sinkDirectory] = createRoot(sinkOptions);
        const source = sourceRoot.openAt({}, "file.txt", {}, { read: true });
        const sink = sinkRoot.openAt({}, "copy.txt", { create: true }, { write: true });
        const input = source.readViaStream(0n);
        const output = sink.writeViaStream(0n);
        return {
            input,
            output,
            copy: join(sinkDirectory, "copy.txt"),
            dropAll: () => drop(input, output, source, sink),
        };
    }

    const PAIRS: Array<[string, object, object]> = [
        ["main thread to main thread", MAIN_THREAD, MAIN_THREAD],
        ["main thread to worker", MAIN_THREAD, {}],
        ["worker to main thread", {}, MAIN_THREAD],
    ];

    test.each(PAIRS)("blocking-splice from %s", (_name, sourceOptions, sinkOptions) => {
        const { input, output, copy, dropAll } = openPair(sourceOptions, sinkOptions);

        assert.strictEqual(output.blockingSplice(input, 5n), 5n);
        let moved = 5n;
        for (;;) {
            try {
                moved += output.blockingSplice(input, 1_000_000n);
            } catch (error) {
                assert.deepStrictEqual(error, { tag: "closed" });
                break;
            }
        }
        output.blockingFlush();
        assert.strictEqual(moved, BigInt(CONTENTS.length));
        dropAll();
        assert.strictEqual(readFileSync(copy, "utf8"), CONTENTS);
    });

    test.each(PAIRS.slice(0, 2))("splice from %s", (_name, sourceOptions, sinkOptions) => {
        const { input, output, copy, dropAll } = openPair(sourceOptions, sinkOptions);

        assert.strictEqual(output.splice(input, 5n), 5n);
        assert.strictEqual(output.splice(input, 0n), 0n);
        assert.strictEqual(output.splice(input, 1_000_000n), BigInt(CONTENTS.length - 5));
        assert.deepStrictEqual(
            thrownBy(() => output.splice(input, 1n)),
            { tag: "closed" },
        );
        output.blockingFlush();
        dropAll();
        assert.strictEqual(readFileSync(copy, "utf8"), CONTENTS);
    });
});

suite("Main-thread filesystem: JSPI", () => {
    const hasJspi = "Suspending" in WebAssembly && "promising" in WebAssembly;

    // (module
    //   (import "host" "read" (func $read (result i32)))
    //   (func (export "run") (result i32) call $read))
    const MODULE = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
        0x02, 0x0d, 0x01, 0x04, 0x68, 0x6f, 0x73, 0x74, 0x04, 0x72, 0x65, 0x61, 0x64, 0x00, 0x00,
        0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x01, 0x0a, 0x06,
        0x01, 0x04, 0x00, 0x10, 0x00, 0x0b,
    ]);

    test.skipIf(!hasJspi)("file calls complete inside a suspending import", async () => {
        const jspi = WebAssembly as unknown as {
            Suspending: new (fn: () => number) => WebAssembly.ImportValue;
            promising: (fn: WebAssembly.ExportValue) => () => Promise<number>;
        };
        const [root] = createRoot(MAIN_THREAD);

        // Async imports of a JSPI build are wrapped like this. The shim's
        // functions return their result directly, so nothing suspends.
        const read = new jspi.Suspending(() => {
            const file = root.openAt({}, "file.txt", {}, { read: true });
            const stream = file.readViaStream(3n);
            const pollable = stream.subscribe();
            pollable.block();
            const [index] = io.poll.poll([pollable]);
            const [byte] = stream.blockingRead(1n);
            drop(pollable, stream, file);
            return index + byte;
        });
        const { exports } = new WebAssembly.Instance(new WebAssembly.Module(MODULE), {
            host: { read },
        });

        assert.strictEqual(await jspi.promising(exports.run)(), CONTENTS.charCodeAt(3));
    });
});
