import { throws } from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { assert, suite, test } from "vitest";
import { createFilesystem, type NodeFilesystemOptions } from "../dist/nodejs/filesystem.js";
import type {
    Descriptor,
    DescriptorFlags,
    OpenFlags,
} from "../types/interfaces/wasi-filesystem-types.js";

async function createFixture(options: NodeFilesystemOptions = { enableMutateDirectory: true }) {
    const host = await mkdtemp(join(tmpdir(), "jco-mutate-directory-"));
    const opened: Descriptor[] = [];
    try {
        await mkdir(join(host, "nested", "empty"), { recursive: true });
        await writeFile(join(host, "nested", "input.txt"), "original");
        const root = createFilesystem({
            preopens: { "/data": host },
            ...options,
        }).preopens.getDirectories()[0][0];
        return {
            host,
            root,
            open(
                base: Descriptor,
                path: string,
                flags: DescriptorFlags,
                openFlags: OpenFlags = {},
            ) {
                const descriptor = base.openAt({ symlinkFollow: true }, path, openFlags, flags);
                opened.push(descriptor);
                return descriptor;
            },
            async [Symbol.asyncDispose]() {
                try {
                    for (const descriptor of opened.reverse()) {
                        (descriptor as unknown as Disposable)[Symbol.dispose]();
                    }
                } finally {
                    await rm(host, { recursive: true, force: true });
                }
            },
        };
    } catch (error) {
        await rm(host, { recursive: true, force: true });
        throw error;
    }
}

const bytes = new TextEncoder().encode("written by guest");
const now = { tag: "now" } as const;
const readonly = (operation: () => unknown) => throws(operation, (error) => error === "read-only");

suite("Node filesystem mutate-directory", () => {
    test.concurrent("accepts the Rust/Perry create-truncate-write request and clears the flag on a file", async () => {
        await using fixture = await createFixture();
        const { host, root, open } = fixture;
        assert.equal(root.getFlags().mutateDirectory, true);
        const flags = { write: true, mutateDirectory: true };
        const file = open(root, "output.txt", flags, { create: true, truncate: true });
        assert.equal(file.getType(), "regular-file");
        assert.equal(file.getFlags().mutateDirectory, false);
        assert.equal(file.getFlags().write, true);
        assert.equal(flags.mutateDirectory, true);
        assert.equal(file.write(bytes, 0n), BigInt(bytes.length));
        assert.equal(readFileSync(join(host, "output.txt"), "utf8"), "written by guest");
        const truncated = open(root, "output.txt", flags, { truncate: true });
        assert.equal(truncated.stat().size, 0n);
    });

    test.concurrent("mutate-directory alone never grants write access to a regular file", async () => {
        await using fixture = await createFixture();
        const { host, root, open } = fixture;
        const file = open(root, "nested/input.txt", { read: true, mutateDirectory: true });
        assert.equal(file.getFlags().mutateDirectory, false);
        assert.notEqual(file.getFlags().write, true);
        throws(() => file.write(bytes, 0n));
        readonly(() => file.setTimes(now, now));
        assert.equal(readFileSync(join(host, "nested", "input.txt"), "utf8"), "original");
    });

    test.concurrent.each([{}, { directory: true }])(
        "supports mutable directory handles with open flags %o",
        async (options) => {
            await using fixture = await createFixture();
            const { host, root, open } = fixture;
            const dir = open(root, "nested", { read: true, mutateDirectory: true }, options);
            assert.equal(dir.getFlags().mutateDirectory, true);
            dir.createDirectoryAt("created");
            const file = open(
                dir,
                "created/file.txt",
                { write: true, mutateDirectory: true },
                { create: true },
            );
            file.write(bytes, 0n);
            dir.setTimesAt({}, "created/file.txt", now, now);
            dir.setTimes(now, now);
            dir.renameAt("created/file.txt", dir, "renamed.txt");
            dir.linkAt({}, "renamed.txt", dir, "linked.txt");
            assert.equal(
                readFileSync(join(host, "nested", "linked.txt"), "utf8"),
                "written by guest",
            );
            dir.unlinkFileAt("linked.txt");
            dir.unlinkFileAt("renamed.txt");
            dir.removeDirectoryAt("created");
        },
    );

    test.concurrent.each([
        ["writable open", {}, { write: true }],
        ["mutation capability", {}, { read: true, mutateDirectory: true }],
        ["create", { create: true }, { read: true }],
        ["truncate", { truncate: true }, { read: true }],
    ] as const)(
        "read-only directories reject %s before host side effects",
        async (_name, options, flags) => {
            await using fixture = await createFixture();
            const { host, root, open } = fixture;
            const dir = open(root, "nested", { read: true }, { directory: true });
            readonly(() => open(dir, "input.txt", flags, options));
            readonly(() => open(dir, "new.txt", flags, options));
            assert.equal(readFileSync(join(host, "nested", "input.txt"), "utf8"), "original");
            throws(() => statSync(join(host, "nested", "new.txt")), { code: "ENOENT" });
            readonly(() => open(dir, ".", { mutateDirectory: true }, { directory: true }));
        },
    );

    test.concurrent.each([
        ["mkdir", (dir: Descriptor) => dir.createDirectoryAt("new")],
        ["unlink", (dir: Descriptor) => dir.unlinkFileAt("input.txt")],
        ["rmdir", (dir: Descriptor) => dir.removeDirectoryAt("empty")],
        ["symlink", (dir: Descriptor) => dir.symlinkAt("input.txt", "new-link")],
        ["path timestamps", (dir: Descriptor) => dir.setTimesAt({}, "input.txt", now, now)],
        ["descriptor timestamps", (dir: Descriptor) => dir.setTimes(now, now)],
    ] as const)("read-only directories reject %s", async (_name, operation) => {
        await using fixture = await createFixture();
        const { root, open } = fixture;
        const dir = open(root, "nested", { read: true }, { directory: true });
        readonly(() => operation(dir));
    });

    test.concurrent.each(["rename", "link"])(
        "%s checks both source and destination directory rights",
        async (operation) => {
            await using fixture = await createFixture();
            const { host, root, open } = fixture;
            const dir = open(root, "nested", { read: true }, { directory: true });
            if (operation === "rename") {
                readonly(() => dir.renameAt("input.txt", root, "moved.txt"));
                readonly(() => root.renameAt("nested/input.txt", dir, "moved.txt"));
            } else {
                readonly(() => dir.linkAt({}, "input.txt", root, "linked.txt"));
                readonly(() => root.linkAt({}, "nested/input.txt", dir, "linked.txt"));
            }
            assert.equal(readFileSync(join(host, "nested", "input.txt"), "utf8"), "original");
            assert.equal(statSync(join(host, "nested", "input.txt")).nlink, 1);
        },
    );

    test.concurrent("read-only directories retain reads and cannot be escalated through flag objects", async () => {
        await using fixture = await createFixture();
        const { root, open } = fixture;
        const flags: DescriptorFlags = { read: true };
        const dir = open(root, "nested", flags, { directory: true });
        flags.mutateDirectory = true;
        dir.getFlags().mutateDirectory = true;
        assert.notEqual(dir.getFlags().mutateDirectory, true);
        readonly(() => dir.createDirectoryAt("denied"));
        const file = open(dir, "input.txt", { read: true });
        assert.equal(new TextDecoder().decode(file.read(100n, 0n)[0]), "original");
        readonly(() => file.setTimes(now, now));
        const nested = open(dir, "empty", { read: true }, { directory: true });
        readonly(() => nested.createDirectoryAt("denied"));
    });

    test.concurrent("normalization does not loosen path boundaries or synchronization support", async () => {
        await using fixture = await createFixture();
        const { host, root, open } = fixture;
        throws(
            () => open(root, "../escape", { write: true, mutateDirectory: true }, { create: true }),
            (error) => error === "not-permitted",
        );
        for (const sync of ["fileIntegritySync", "dataIntegritySync", "requestedWriteSync"]) {
            throws(
                () =>
                    open(
                        root,
                        "output.txt",
                        { write: true, mutateDirectory: true, [sync]: true },
                        { create: true },
                    ),
                (error) => error === "unsupported",
            );
        }
        throws(() => statSync(join(host, "output.txt")), { code: "ENOENT" });
    });

    test.concurrent("mutable handles update timestamps in seconds and preserve no-change fields", async () => {
        await using fixture = await createFixture();
        const { host, root, open } = fixture;
        const dir = open(root, "nested", { mutateDirectory: true }, { directory: true });
        const file = open(dir, "input.txt", { write: true });
        const timestamp = {
            tag: "timestamp",
            val: { seconds: 1_600_000_000n, nanoseconds: 500_000_000 },
        } as const;
        file.setTimes(timestamp, timestamp);
        assert.equal(statSync(join(host, "nested", "input.txt")).mtimeMs, 1_600_000_000_500);
        const directoryTimestamp = {
            tag: "timestamp",
            val: { seconds: 1_500_000_000n, nanoseconds: 0 },
        } as const;
        dir.setTimes(directoryTimestamp, directoryTimestamp);
        assert.equal(statSync(join(host, "nested")).mtimeMs, 1_500_000_000_000);
        dir.setTimesAt({}, "input.txt", { tag: "no-change" }, now);
        const stats = statSync(join(host, "nested", "input.txt"));
        assert.equal(stats.atimeMs, 1_600_000_000_500);
        assert.ok(Math.abs(stats.mtimeMs - Date.now()) < 5000);
    });

    test.concurrent.each([{}, { enableMutateDirectory: false }])(
        "preserves legacy directory and metadata operations with options %o",
        async (options) => {
            await using fixture = await createFixture(options);
            const { host, root, open } = fixture;
            const dir = open(root, "nested", { read: true }, { directory: true });
            dir.createDirectoryAt("created");
            const file = open(dir, "created/output.txt", { write: true }, { create: true });
            file.write(bytes, 0n);
            assert.equal(
                readFileSync(join(host, "nested", "created", "output.txt"), "utf8"),
                "written by guest",
            );
            const input = open(dir, "input.txt", { read: true });
            input.setTimes(now, now);
            throws(
                () =>
                    open(
                        root,
                        "perry.txt",
                        { write: true, mutateDirectory: true },
                        { create: true },
                    ),
                (error) => error === "unsupported",
            );
            throws(() => statSync(join(host, "perry.txt")), { code: "ENOENT" });
        },
    );

    test.concurrent("filesystem options are isolated and captured by descendant handles", async () => {
        const options = { enableMutateDirectory: true };
        await using enabled = await createFixture(options);
        await using legacy = await createFixture({});
        options.enableMutateDirectory = false;
        const dir = enabled.open(enabled.root, "nested", { read: true }, { directory: true });
        readonly(() => dir.createDirectoryAt("denied"));
        const other = legacy.open(legacy.root, "nested", { read: true }, { directory: true });
        other.createDirectoryAt("allowed");
        readonly(() => enabled.open(dir, "input.txt", { write: true }));
        legacy.open(other, "input.txt", { write: true }).write(bytes, 0n);
    });

    test.concurrent("global preopen options affect only newly created handles", async () => {
        await using fixture = await createFixture({});
        const moduleUrl = new URL("../dist/nodejs/filesystem.js", import.meta.url).href;
        // Isolate global preopen state in a process so this test can run concurrently.
        await promisify(execFile)(process.execPath, [
            "--input-type=module",
            "--eval",
            `
            import assert from 'node:assert/strict';
            const fs = await import(${JSON.stringify(moduleUrl)});
            const host = process.argv[1];
            const options = { enableMutateDirectory: true };
            fs._setPreopens({ '/data': host }, options);
            const [[enabled]] = fs.preopens.getDirectories();
            options.enableMutateDirectory = false;
            fs._setPreopens({ '/legacy': host });
            const [[legacy]] = fs.preopens.getDirectories();
            const file = enabled.openAt({}, 'created.txt', { create: true }, { write: true, mutateDirectory: true });
            assert.equal(file.getFlags().mutateDirectory, false);
            file[Symbol.dispose]();
            assert.throws(() => legacy.openAt({}, 'created.txt', {}, { write: true, mutateDirectory: true }), error => error === 'unsupported');
            fs._addPreopen('/enabled', host, { enableMutateDirectory: true });
            const added = fs.preopens.getDirectories()[1][0];
            const dir = added.openAt({}, 'nested', { directory: true }, { read: true });
            assert.throws(() => dir.createDirectoryAt('denied'), error => error === 'read-only');
            dir[Symbol.dispose]();
        `,
            fixture.host,
        ]);
    });
});
