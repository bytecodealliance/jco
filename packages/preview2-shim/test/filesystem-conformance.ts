import { assert, suite, test } from "vitest";

import { WASIShim } from "../src/common/instantiation.js";
import type { FilesystemShim } from "../types/instantiation.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface FilesystemTestSubject {
    filesystem: FilesystemShim;
    preopens: Record<string, unknown>;
}

export function testFilesystemImplementation(
    name: string,
    createSubject: () => FilesystemTestSubject,
) {
    const createRoot = () => {
        const subject = createSubject();
        const shim = new WASIShim({
            filesystem: subject.filesystem,
            sandbox: { preopens: subject.preopens },
        });
        const directories = shim.getImportObject()["wasi:filesystem/preopens"].getDirectories();
        assert.strictEqual(directories.length, 1);
        assert.strictEqual(directories[0][1], "/data");
        return directories[0][0];
    };

    const readText = (descriptor: any) => decoder.decode(descriptor.read(1_000_000n, 0n)[0]);

    suite(name, () => {
        test("preopens, stats, and file reads", () => {
            const root = createRoot();

            assert.strictEqual(root.getType(), "directory");
            assert.strictEqual(root.statAt({}, "hello.txt").type, "regular-file");
            const file = root.openAt({}, "hello.txt", {}, { read: true });
            assert.strictEqual(readText(file), "hello from a Map");
        });

        test("file creation, writes, streams, truncation, and reopening", () => {
            const root = createRoot();

            const file = root.openAt(
                {},
                "created.txt",
                { create: true },
                { read: true, write: true },
            );
            assert.strictEqual(file.write(encoder.encode("first"), 0n), 5n);
            let output = file.writeViaStream(5n);
            output.checkWrite();
            output.write(encoder.encode(" second"));
            output.blockingFlush();
            assert.strictEqual(readText(file), "first second");

            file.setSize(5n);
            assert.strictEqual(file.stat().size, 5n);
            assert.strictEqual(readText(file), "first");

            const reopened = root.openAt({}, "created.txt", {}, { read: true });
            assert.strictEqual(readText(reopened), "first");
            root.openAt({}, "created.txt", { truncate: true }, { write: true });
            assert.strictEqual(reopened.stat().size, 0n);
        });

        test("directory creation, traversal, entries, and removal", () => {
            const root = createRoot();

            root.createDirectoryAt("nested");
            const nested = root.openAt(
                {},
                "nested",
                { directory: true },
                { mutateDirectory: true },
            );
            nested.openAt({}, "b.txt", { create: true }, { write: true });
            nested.openAt({}, "a.txt", { create: true }, { write: true });

            const entries = nested.readDirectory();
            const names: string[] = [];
            for (
                let entry = entries.readDirectoryEntry();
                entry;
                entry = entries.readDirectoryEntry()
            ) {
                names.push(entry.name);
            }
            assert.deepStrictEqual(names, ["a.txt", "b.txt"]);

            nested.unlinkFileAt("a.txt");
            nested.unlinkFileAt("b.txt");
            root.removeDirectoryAt("nested");
            assert.throws(() => root.statAt({}, "nested"));
        });

        test("renames, hard links, identity, and link counts", () => {
            const root = createRoot();

            root.renameAt("hello.txt", root, "renamed.txt");
            const renamed = root.openAt({}, "renamed.txt", {}, { read: true });
            assert.strictEqual(readText(renamed), "hello from a Map");
            assert.throws(() => root.statAt({}, "hello.txt"));

            root.linkAt({}, "renamed.txt", root, "linked.txt");
            const linked = root.openAt({}, "linked.txt", {}, { read: true });
            assert.strictEqual(renamed.isSameObject(linked), true);
            assert.strictEqual(renamed.stat().linkCount, 2n);
            assert.deepStrictEqual(renamed.metadataHash(), linked.metadataHash());

            root.unlinkFileAt("renamed.txt");
            assert.strictEqual(linked.stat().linkCount, 1n);
            assert.strictEqual(readText(linked), "hello from a Map");
        });

        test("metadata changes and path validation", () => {
            const root = createRoot();
            const file = root.openAt({}, "hello.txt", {}, { read: true, write: true });
            const before = file.metadataHash();

            file.setTimes({ tag: "now" }, { tag: "now" });
            assert.notDeepEqual(file.metadataHash(), before);
            assert.deepStrictEqual(root.metadataHashAt({}, "hello.txt"), file.metadataHash());

            assert.throws(() =>
                root.openAt({}, "missing/child", { create: true }, { write: true }),
            );
            assert.throws(() => root.createDirectoryAt("scratch"));
            assert.throws(() => root.removeDirectoryAt("hello.txt"));
        });
    });
}
