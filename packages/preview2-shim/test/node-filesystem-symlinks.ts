import { throws } from "node:assert";
import {
    existsSync,
    linkSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { afterEach, assert, beforeEach, suite, test } from "vitest";

import type {
    Descriptor,
    OpenFlags,
    PathFlags,
} from "../types/interfaces/wasi-filesystem-types.js";

suite("Node filesystem symlink paths", () => {
    let testDir: string;
    let root: Descriptor;
    let opened: Descriptor[];

    beforeEach(() => {
        testDir = mkdtempSync(join(tmpdir(), "jco-symlink-paths-"));
        opened = [];
        writeFileSync(join(testDir, "target.txt"), "target contents");
        const shim = new WASIShim({ sandbox: { preopens: { "/test": testDir } } });
        [root] = shim.getImportObject()["wasi:filesystem/preopens"].getDirectories()[0];
    });

    afterEach(() => {
        for (const descriptor of opened.reverse()) {
            (descriptor as unknown as Disposable)[Symbol.dispose]();
        }
        rmSync(testDir, { recursive: true, force: true });
    });

    function open(path: string, pathFlags: PathFlags, openFlags: OpenFlags = {}) {
        const descriptor = root.openAt(pathFlags, path, openFlags, { read: true });
        opened.push(descriptor);
        return descriptor;
    }

    for (const kind of ["relative", "absolute", "chain", "intermediate"] as const) {
        test(`linkAt resolves ${kind} symlinks to the target inode`, () => {
            let source = "link.txt";
            if (kind === "intermediate") {
                mkdirSync(join(testDir, "nested"));
                symlinkSync("../target.txt", join(testDir, "nested", "link.txt"));
                symlinkSync("nested", join(testDir, "alias"), "dir");
                source = "alias/link.txt";
            } else {
                symlinkSync(
                    kind === "absolute" ? join(testDir, "target.txt") : "target.txt",
                    join(testDir, "link.txt"),
                );
                if (kind === "chain") {
                    symlinkSync("link.txt", join(testDir, "chain.txt"));
                    source = "chain.txt";
                }
            }

            root.linkAt({ symlinkFollow: true }, source, root, "linked.txt");
            const linked = lstatSync(join(testDir, "linked.txt"));
            const target = statSync(join(testDir, "target.txt"));
            assert.strictEqual(linked.isFile(), true);
            assert.strictEqual(linked.dev, target.dev);
            assert.strictEqual(linked.ino, target.ino);
            assert.strictEqual(
                readFileSync(join(testDir, "linked.txt"), "utf8"),
                "target contents",
            );
        });
    }

    for (const target of ["target.txt", "missing.txt", "link.txt"]) {
        test(`linkAt without follow preserves native link behavior for ${target}`, () => {
            symlinkSync(target, join(testDir, "link.txt"));
            linkSync(join(testDir, "link.txt"), join(testDir, "native.txt"));
            root.linkAt({ symlinkFollow: false }, "link.txt", root, "linked.txt");
            root.linkAt({}, "link.txt", root, "default.txt");
            const linked = lstatSync(join(testDir, "linked.txt"));
            const native = lstatSync(join(testDir, "native.txt"));
            assert.strictEqual(linked.isSymbolicLink(), native.isSymbolicLink());
            assert.strictEqual(linked.ino, native.ino);
            assert.strictEqual(lstatSync(join(testDir, "default.txt")).ino, native.ino);
        });
    }

    for (const [target, expected] of [
        ["missing.txt", "no-entry"],
        ["link.txt", "loop"],
    ]) {
        test(`linkAt with follow reports ${expected} instead of linking the symlink`, () => {
            symlinkSync(target, join(testDir, "link.txt"));
            throws(
                () => root.linkAt({ symlinkFollow: true }, "link.txt", root, "linked.txt"),
                (error) => error === expected,
            );
            throws(() => lstatSync(join(testDir, "linked.txt")), { code: "ENOENT" });
        });
    }

    test("linkAt with follow rejects a missing source", () => {
        throws(
            () => root.linkAt({ symlinkFollow: true }, "missing.txt", root, "linked.txt"),
            (error) => error === "no-entry",
        );
        assert.strictEqual(existsSync(join(testDir, "linked.txt")), false);
    });

    test("linkAt with follow does not overwrite an existing destination", () => {
        symlinkSync("target.txt", join(testDir, "link.txt"));
        writeFileSync(join(testDir, "existing.txt"), "keep me");
        throws(
            () => root.linkAt({ symlinkFollow: true }, "link.txt", root, "existing.txt"),
            (error) => error === "exist",
        );
        assert.strictEqual(readFileSync(join(testDir, "existing.txt"), "utf8"), "keep me");
    });

    for (const path of ["target.txt/", "link.txt/"]) {
        test(`openAt with follow rejects a trailing slash on ${path}`, () => {
            symlinkSync("target.txt", join(testDir, "link.txt"));
            throws(
                () => open(path, { symlinkFollow: true }),
                (error) => error === "not-directory",
            );
        });

        test(`linkAt with follow rejects a trailing slash on ${path}`, () => {
            symlinkSync("target.txt", join(testDir, "link.txt"));
            throws(
                () => root.linkAt({ symlinkFollow: true }, path, root, "linked.txt"),
                (error) => error === "not-directory",
            );
            assert.strictEqual(existsSync(join(testDir, "linked.txt")), false);
        });
    }

    test("openAt with follow still opens valid symlinks", () => {
        symlinkSync("target.txt", join(testDir, "link.txt"));
        const file = open("link.txt", { symlinkFollow: true });
        assert.strictEqual(new TextDecoder().decode(file.read(64n, 0n)[0]), "target contents");
    });

    test("openAt without follow rejects a final symlink", () => {
        symlinkSync("target.txt", join(testDir, "link.txt"));
        throws(
            () => open("link.txt", {}),
            (error) => error === "loop",
        );
    });

    for (const symlinkFollow of [false, true]) {
        test(`openAt follows intermediate symlinks with final follow=${symlinkFollow}`, () => {
            mkdirSync(join(testDir, "nested"));
            writeFileSync(join(testDir, "nested", "child.txt"), "child contents");
            symlinkSync("nested", join(testDir, "alias"), "dir");
            const file = open("alias/child.txt", { symlinkFollow });
            assert.strictEqual(new TextDecoder().decode(file.read(64n, 0n)[0]), "child contents");
        });
    }

    test("openAt with follow still accepts directory paths with a trailing slash", () => {
        mkdirSync(join(testDir, "nested"));
        symlinkSync("nested", join(testDir, "alias"), "dir");
        assert.strictEqual(
            open("alias/", { symlinkFollow: true }, { directory: true }).getType(),
            "directory",
        );
    });

    test("openAt with follow can create a dangling symlink's target", () => {
        symlinkSync("created.txt", join(testDir, "link.txt"));
        const file = open("link.txt", { symlinkFollow: true }, { create: true });
        assert.strictEqual(file.getType(), "regular-file");
        assert.strictEqual(lstatSync(join(testDir, "link.txt")).isSymbolicLink(), true);
        assert.strictEqual(statSync(join(testDir, "created.txt")).isFile(), true);
    });

    test("openAt with follow can create a new file", () => {
        const file = open("created.txt", { symlinkFollow: true }, { create: true });
        assert.strictEqual(file.getType(), "regular-file");
        assert.strictEqual(statSync(join(testDir, "created.txt")).isFile(), true);
    });

    test("openAt with exclusive create rejects an existing symlink", () => {
        symlinkSync("target.txt", join(testDir, "link.txt"));
        throws(
            () => open("link.txt", { symlinkFollow: true }, { create: true, exclusive: true }),
            (error) => error === "exist",
        );
        assert.strictEqual(readFileSync(join(testDir, "target.txt"), "utf8"), "target contents");
    });
});
