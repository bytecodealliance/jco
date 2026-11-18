// Per-call cost of the Node.js `wasi:filesystem` shim, with and without the
// `performance` options, called the way generated bindings call it.
//
// usage: pnpm build && node bench/filesystem.mjs [path,small,descriptor,read,write]
//
// Every variant runs in the same process against the same files. Each row is
// the fastest of several repetitions, since a shared machine only adds time.
// The fixture is a 16 MiB file in the system temporary directory; it and the
// file written by the `write` group are removed on exit.
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hrtime } from "node:process";

const { _createPreopenDescriptor } = await import("../dist/nodejs/filesystem.js");

const groups = new Set((process.argv[2] ?? "path,small,descriptor,read,write").split(","));
const symbolDispose = Symbol.dispose;
const BIG = 16 * 1024 * 1024;
const PATH_FLAGS = { symlinkFollow: true };
const READ = { read: true };
const READ_WRITE = { read: true, write: true };

/** Preopen options for each measured variant, in column order. */
const VARIANTS = [
    ["default", {}],
    ["mainThreadFilesystem", { performance: { mainThreadFilesystem: true } }],
    ["cacheDirectoryPaths", { performance: { cacheDirectoryPaths: true } }],
    ["both", { performance: { mainThreadFilesystem: true, cacheDirectoryPaths: true } }],
];

// The preopen sits a few directories deep, as an application directory would:
// resolving it costs one step per path component.
const temporary = mkdtempSync(join(tmpdir(), "jco-p2-bench-"));
process.on("exit", () => rmSync(temporary, { recursive: true, force: true }));
const dir = join(temporary, "home/user/project/data");
mkdirSync(join(dir, "a/b/c"), { recursive: true });
writeFileSync(join(dir, "small.txt"), "hello world\n".repeat(20));
writeFileSync(join(dir, "a/b/c/deep.txt"), "hello world\n".repeat(20));
writeFileSync(join(dir, "big.bin"), randomBytes(BIG));

// Stands in for linear memory: bindings copy every host result into it.
const memory = new Uint8Array(new WebAssembly.Memory({ initial: 64 }).buffer);

/**
 * Format a duration for the table.
 *
 * @param {number} ns - duration in nanoseconds
 * @returns {string} the duration with a unit
 */
function format(ns) {
    if (ns < 1e3) {
        return `${ns.toFixed(0)} ns`;
    }
    if (ns < 1e6) {
        return `${(ns / 1e3).toFixed(2)} µs`;
    }
    return `${(ns / 1e6).toFixed(2)} ms`;
}

/**
 * Time `fn`, returning the fastest repetition in nanoseconds per call.
 *
 * @param {() => void} fn - the operation
 * @param {number} iterations - calls per repetition
 * @param {number} repetitions - timed repetitions after one warm-up
 * @returns {number} nanoseconds per call
 */
function fastest(fn, iterations, repetitions = 7) {
    let best = Infinity;
    for (let repetition = -1; repetition < repetitions; repetition++) {
        const start = hrtime.bigint();
        for (let i = 0; i < iterations; i++) {
            fn();
        }
        const elapsed = Number(hrtime.bigint() - start) / iterations;
        if (repetition >= 0 && elapsed < best) {
            best = elapsed;
        }
    }
    return best;
}

/**
 * Read a stream to its end in `chunk`-byte blocking reads, copying each result.
 *
 * @param {object} stream - a `wasi:io/streams` input stream
 * @param {bigint} chunk - bytes requested per read
 * @returns {number} total bytes read
 */
function drain(stream, chunk) {
    let total = 0;
    try {
        for (;;) {
            const bytes = stream.blockingRead(chunk);
            memory.set(bytes, 0);
            total += bytes.byteLength;
        }
    } catch (error) {
        if (error.tag !== "closed") {
            throw error;
        }
    }
    return total;
}

/** @type {Array<[string, number, (root: object) => () => void]>} name, iterations, job factory */
const rows = [];

if (groups.has("path")) {
    rows.push(["stat-at small.txt", 20000, (root) => () => root.statAt(PATH_FLAGS, "small.txt")]);
    rows.push([
        "stat-at a/b/c/deep.txt",
        20000,
        (root) => () => root.statAt(PATH_FLAGS, "a/b/c/deep.txt"),
    ]);
}

if (groups.has("small")) {
    rows.push([
        "open-at + drop",
        3000,
        (root) => () => root.openAt(PATH_FLAGS, "small.txt", {}, READ)[symbolDispose](),
    ]);
    rows.push([
        "open, stat, stream read to end, drop (240 B)",
        2000,
        (root) => () => {
            const descriptor = root.openAt(PATH_FLAGS, "small.txt", {}, READ);
            descriptor.stat();
            const stream = descriptor.readViaStream(0n);
            drain(stream, 4096n);
            stream[symbolDispose]();
            descriptor[symbolDispose]();
        },
    ]);
}

if (groups.has("descriptor")) {
    /**
     * Build a row that calls one method of an open descriptor.
     *
     * @param {string} name - row label
     * @param {(descriptor: object) => void} call - the measured call
     * @returns {[string, number, (root: object) => () => void]} the row
     */
    const onDescriptor = (name, call) => [
        name,
        5000,
        (root) => {
            const descriptor = root.openAt(PATH_FLAGS, "small.txt", {}, READ);
            return () => call(descriptor);
        },
    ];
    rows.push(onDescriptor("descriptor.stat", (descriptor) => descriptor.stat()));
    rows.push(onDescriptor("descriptor.get-type", (descriptor) => descriptor.getType()));
    rows.push(onDescriptor("descriptor.metadata-hash", (descriptor) => descriptor.metadataHash()));
    rows.push(
        onDescriptor("descriptor.read 4 KiB", (descriptor) =>
            memory.set(descriptor.read(4096n, 0n)[0], 0),
        ),
    );
}

if (groups.has("read")) {
    for (const chunk of [65536, 4096]) {
        rows.push([
            `16 MiB stream read, ${chunk / 1024} KiB blocking-read`,
            1,
            (root) => {
                const descriptor = root.openAt(PATH_FLAGS, "big.bin", {}, READ);
                return () => {
                    const stream = descriptor.readViaStream(0n);
                    if (drain(stream, BigInt(chunk)) !== BIG) {
                        throw new Error("short read");
                    }
                    stream[symbolDispose]();
                };
            },
        ]);
    }
}

if (groups.has("write")) {
    const source = new Uint8Array(65536).fill(7);
    for (const chunk of [65536, 4096]) {
        const buffer = source.subarray(0, chunk);
        rows.push([
            `16 MiB stream write, ${chunk / 1024} KiB blocking-write-and-flush`,
            1,
            (root) => () => {
                const descriptor = root.openAt(
                    PATH_FLAGS,
                    "out.bin",
                    { create: true, truncate: true },
                    READ_WRITE,
                );
                const stream = descriptor.writeViaStream(0n);
                for (let offset = 0; offset < BIG; offset += chunk) {
                    stream.blockingWriteAndFlush(buffer);
                }
                stream[symbolDispose]();
                descriptor[symbolDispose]();
            },
        ]);
    }
}

const roots = VARIANTS.map(([, options]) => _createPreopenDescriptor(dir, options));
console.log(`| operation | ${VARIANTS.map(([name]) => name).join(" | ")} |`);
console.log(`| --- | ${VARIANTS.map(() => "---:").join(" | ")} |`);
for (const [name, iterations, createJob] of rows) {
    const cells = roots.map((root) => format(fastest(createJob(root), iterations)));
    console.log(`| ${name} | ${cells.join(" | ")} |`);
}
process.exit(0);
