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
import { basename, join } from "node:path";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { afterEach, assert, beforeEach, suite, test } from "vitest";

import type {
    Descriptor,
    OpenFlags,
    PathFlags,
} from "../types/interfaces/wasi-filesystem-types.js";

suite("Node filesystem symlink paths", () => {
    let testDir: string;
    let outsideDir: string;
    let root: Descriptor;
    let opened: Descriptor[];

    beforeEach(() => {
        testDir = mkdtempSync(join(tmpdir(), "jco-symlink-paths-"));
        outsideDir = mkdtempSync(join(tmpdir(), "jco-symlink-outside-"));
        opened = [];
        writeFileSync(join(testDir, "target.txt"), "target contents");
        writeFileSync(join(outsideDir, "secret.txt"), "outside contents");
        mkdirSync(join(outsideDir, "empty"));
        const shim = new WASIShim({ sandbox: { preopens: { "/test": testDir } } });
        [root] = shim.getImportObject()["wasi:filesystem/preopens"].getDirectories()[0];
    });

    afterEach(() => {
        for (const descriptor of opened.reverse()) {
            (descriptor as unknown as Disposable)[Symbol.dispose]();
        }
        rmSync(testDir, { recursive: true, force: true });
        rmSync(outsideDir, { recursive: true, force: true });
    });

    function open(path: string, pathFlags: PathFlags, openFlags: OpenFlags = {}) {
        const descriptor = root.openAt(pathFlags, path, openFlags, { read: true });
        opened.push(descriptor);
        return descriptor;
    }

    for (const kind of ["relative", "chain", "intermediate"] as const) {
        test(`linkAt resolves ${kind} symlinks to the target inode`, () => {
            let source = "link.txt";
            if (kind === "intermediate") {
                mkdirSync(join(testDir, "nested"));
                symlinkSync("../target.txt", join(testDir, "nested", "link.txt"));
                symlinkSync("nested", join(testDir, "alias"), "dir");
                source = "alias/link.txt";
            } else {
                symlinkSync("target.txt", join(testDir, "link.txt"));
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

    test("rejects absolute symlink targets when following", () => {
        symlinkSync(join(testDir, "target.txt"), join(testDir, "absolute.txt"));
        throws(
            () => open("absolute.txt", { symlinkFollow: true }),
            (error) => error === "not-permitted",
        );
        throws(
            () => root.linkAt({ symlinkFollow: true }, "absolute.txt", root, "linked.txt"),
            (error) => error === "not-permitted",
        );
        assert.strictEqual(root.statAt({}, "absolute.txt").type, "symbolic-link");
    });

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

    test("rejects host-planted final symlinks that escape the preopen", () => {
        symlinkSync(join(outsideDir, "secret.txt"), join(testDir, "escape.txt"));

        throws(
            () => open("escape.txt", { symlinkFollow: true }),
            (error) => error === "not-permitted",
        );
        throws(
            () => root.statAt({ symlinkFollow: true }, "escape.txt"),
            (error) => error === "not-permitted",
        );
        throws(
            () => root.metadataHashAt({ symlinkFollow: true }, "escape.txt"),
            (error) => error === "not-permitted",
        );

        assert.strictEqual(root.statAt({}, "escape.txt").type, "symbolic-link");
        assert.strictEqual(root.readlinkAt("escape.txt"), join(outsideDir, "secret.txt"));
        throws(
            () => open("escape.txt", {}),
            (error) => error === "loop",
        );
    });

    test("rejects every path operation through an escaping intermediate symlink", () => {
        symlinkSync(outsideDir, join(testDir, "escape"), "dir");
        const denied = (operation: () => unknown) =>
            throws(operation, (error) => error === "not-permitted");

        denied(() => open("escape/secret.txt", {}));
        denied(() =>
            root.openAt(
                { symlinkFollow: true },
                "escape/created.txt",
                { create: true },
                { write: true },
            ),
        );
        denied(() => root.createDirectoryAt("escape/created-dir"));
        denied(() => root.statAt({}, "escape/secret.txt"));
        denied(() =>
            root.setTimesAt(
                { symlinkFollow: true },
                "escape/secret.txt",
                { tag: "now" },
                { tag: "now" },
            ),
        );
        denied(() => root.linkAt({}, "target.txt", root, "escape/linked.txt"));
        denied(() => root.linkAt({}, "escape/secret.txt", root, "linked.txt"));
        denied(() => root.readlinkAt("escape/link.txt"));
        denied(() => root.removeDirectoryAt("escape/empty"));
        denied(() => root.renameAt("target.txt", root, "escape/renamed.txt"));
        denied(() => root.symlinkAt("target.txt", "escape/new-link.txt"));
        denied(() => root.unlinkFileAt("escape/secret.txt"));
        denied(() => root.metadataHashAt({}, "escape/secret.txt"));

        assert.strictEqual(
            readFileSync(join(outsideDir, "secret.txt"), "utf8"),
            "outside contents",
        );
        assert.strictEqual(existsSync(join(outsideDir, "created.txt")), false);
        assert.strictEqual(existsSync(join(outsideDir, "created-dir")), false);
        assert.strictEqual(existsSync(join(outsideDir, "linked.txt")), false);
        assert.strictEqual(existsSync(join(outsideDir, "renamed.txt")), false);
        assert.strictEqual(existsSync(join(outsideDir, "new-link.txt")), false);
        assert.strictEqual(existsSync(join(testDir, "target.txt")), true);
    });

    for (const symlinkFollow of [false, true]) {
        test(`rejects guest-created parent escapes with final follow=${symlinkFollow}`, () => {
            const target = `../${basename(outsideDir)}`;
            root.symlinkAt(target, "guest-escape");
            assert.strictEqual(root.readlinkAt("guest-escape"), target);

            throws(
                () => open("guest-escape/secret.txt", { symlinkFollow }),
                (error) => error === "not-permitted",
            );
            throws(
                () =>
                    root.openAt(
                        { symlinkFollow },
                        "guest-escape/created.txt",
                        { create: true },
                        { write: true },
                    ),
                (error) => error === "not-permitted",
            );

            assert.strictEqual(
                readFileSync(join(outsideDir, "secret.txt"), "utf8"),
                "outside contents",
            );
            assert.strictEqual(existsSync(join(outsideDir, "created.txt")), false);
            root.unlinkFileAt("guest-escape");
            assert.strictEqual(existsSync(join(testDir, "guest-escape")), false);
        });
    }

    test("rejects guest-created escape paths that re-enter through the host parent", () => {
        root.symlinkAt("..", "guest-parent");
        throws(
            () => open(`guest-parent/${basename(outsideDir)}/secret.txt`, {}),
            (error) => error === "not-permitted",
        );
        assert.strictEqual(
            readFileSync(join(outsideDir, "secret.txt"), "utf8"),
            "outside contents",
        );
    });

    /** Assert that no path operation on `descriptor` reaches the host filesystem. */
    function assertEveryPathOperationDenied(descriptor: Descriptor) {
        const denied = (operation: () => unknown) =>
            throws(operation, (error) => error === "not-permitted");

        denied(() => descriptor.openAt({}, "secret.txt", {}, { read: true }));
        denied(() => descriptor.openAt({ symlinkFollow: true }, "secret.txt", {}, { read: true }));
        denied(() => descriptor.openAt({}, "created.txt", { create: true }, { write: true }));
        denied(() => descriptor.openAt({}, ".", { directory: true }, { read: true }));
        denied(() => descriptor.readDirectory());
        denied(() => descriptor.statAt({}, "secret.txt"));
        denied(() => descriptor.metadataHashAt({}, "secret.txt"));
        denied(() => descriptor.readlinkAt("secret.txt"));
        denied(() => descriptor.createDirectoryAt("created-dir"));
        denied(() => descriptor.setTimesAt({}, "secret.txt", { tag: "now" }, { tag: "now" }));
        denied(() => descriptor.linkAt({}, "secret.txt", root, "linked.txt"));
        denied(() => root.linkAt({}, "target.txt", descriptor, "linked.txt"));
        denied(() => descriptor.renameAt("secret.txt", root, "renamed.txt"));
        denied(() => root.renameAt("target.txt", descriptor, "renamed.txt"));
        denied(() => descriptor.symlinkAt("secret.txt", "new-link.txt"));
        denied(() => descriptor.unlinkFileAt("secret.txt"));
        denied(() => descriptor.removeDirectoryAt("empty"));
    }

    /** Assert that the directory outside the preopen still has its initial contents. */
    function assertOutsideUntouched(directory = outsideDir) {
        assert.strictEqual(readFileSync(join(directory, "secret.txt"), "utf8"), "outside contents");
        assert.strictEqual(existsSync(join(directory, "empty")), true);
        for (const created of ["created.txt", "created-dir", "linked.txt", "renamed.txt"]) {
            assert.strictEqual(existsSync(join(directory, created)), false);
        }
        assert.strictEqual(existsSync(join(directory, "new-link.txt")), false);
        assert.strictEqual(existsSync(join(testDir, "linked.txt")), false);
        assert.strictEqual(existsSync(join(testDir, "renamed.txt")), false);
        assert.strictEqual(readFileSync(join(testDir, "target.txt"), "utf8"), "target contents");
    }

    test("rejects a descriptor whose directory was replaced by an escaping symlink", () => {
        mkdirSync(join(testDir, "held"));
        const held = open("held", {}, { directory: true });

        root.removeDirectoryAt("held");
        root.symlinkAt(`../${basename(outsideDir)}`, "held");

        assertEveryPathOperationDenied(held);
        assertOutsideUntouched();
    });

    test("rejects a descriptor below a directory replaced by an escaping symlink", () => {
        mkdirSync(join(testDir, "outer", "inner"), { recursive: true });
        mkdirSync(join(outsideDir, "inner", "empty"), { recursive: true });
        writeFileSync(join(outsideDir, "inner", "secret.txt"), "outside contents");
        const inner = open("outer/inner", {}, { directory: true });

        root.renameAt("outer", root, "moved");
        root.symlinkAt(`../${basename(outsideDir)}`, "outer");

        assertEveryPathOperationDenied(inner);
        assertOutsideUntouched(join(outsideDir, "inner"));
    });

    test("rejects a descriptor whose directory was replaced by a symlink to a sibling", () => {
        mkdirSync(join(testDir, "held"));
        mkdirSync(join(testDir, "sibling", "empty"), { recursive: true });
        writeFileSync(join(testDir, "sibling", "secret.txt"), "outside contents");
        const held = open("held", {}, { directory: true });

        root.removeDirectoryAt("held");
        root.symlinkAt("sibling", "held");

        assertEveryPathOperationDenied(held);
        assertOutsideUntouched(join(testDir, "sibling"));
    });

    test("a descriptor works again once its directory is a real directory", () => {
        mkdirSync(join(testDir, "held"));
        const held = open("held", {}, { directory: true });

        root.removeDirectoryAt("held");
        root.symlinkAt(`../${basename(outsideDir)}`, "held");
        throws(
            () => held.statAt({}, "secret.txt"),
            (error) => error === "not-permitted",
        );

        root.unlinkFileAt("held");
        root.createDirectoryAt("held");
        held.createDirectoryAt("created-dir");
        assert.strictEqual(statSync(join(testDir, "held", "created-dir")).isDirectory(), true);
    });

    test("descriptors opened through symlinks inside the preopen keep working", () => {
        mkdirSync(join(testDir, "nested", "deeper"), { recursive: true });
        writeFileSync(join(testDir, "nested", "child.txt"), "child contents");
        symlinkSync("nested", join(testDir, "alias"), "dir");
        symlinkSync("../target.txt", join(testDir, "nested", "up.txt"));

        const viaAlias = open("alias", { symlinkFollow: true }, { directory: true });
        const deeper = open("alias/deeper", {}, { directory: true });

        // Unrelated changes elsewhere in the tree do not affect open descriptors.
        root.createDirectoryAt("unrelated");
        root.symlinkAt("target.txt", "unrelated-link.txt");

        const child = viaAlias.openAt({}, "child.txt", {}, { read: true });
        opened.push(child);
        assert.strictEqual(new TextDecoder().decode(child.read(64n, 0n)[0]), "child contents");
        assert.strictEqual(viaAlias.statAt({}, "child.txt").type, "regular-file");
        assert.strictEqual(viaAlias.statAt({}, "deeper").type, "directory");
        assert.strictEqual(viaAlias.readlinkAt("up.txt"), "../target.txt");
        // A symlink target may not climb above the descriptor it is resolved from.
        throws(
            () => viaAlias.statAt({ symlinkFollow: true }, "up.txt"),
            (error) => error === "not-permitted",
        );

        const names: string[] = [];
        const entries = viaAlias.readDirectory();
        for (let entry = entries.readDirectoryEntry(); entry; ) {
            names.push(entry.name);
            entry = entries.readDirectoryEntry();
        }
        (entries as unknown as Disposable)[Symbol.dispose]();
        assert.deepStrictEqual(names.sort(), ["child.txt", "deeper", "up.txt"]);

        deeper.createDirectoryAt("created-dir");
        const created = deeper.openAt({}, "created.txt", { create: true }, { write: true });
        opened.push(created);
        assert.strictEqual(
            statSync(join(testDir, "nested", "deeper", "created-dir")).isDirectory(),
            true,
        );
        assert.strictEqual(
            statSync(join(testDir, "nested", "deeper", "created.txt")).isFile(),
            true,
        );
    });

    test("descriptors below a preopen reached through a host symlink keep working", () => {
        mkdirSync(join(testDir, "nested"));
        writeFileSync(join(testDir, "nested", "child.txt"), "child contents");
        symlinkSync(testDir, join(outsideDir, "preopen-alias"), "dir");
        const shim = new WASIShim({
            sandbox: { preopens: { "/alias": join(outsideDir, "preopen-alias") } },
        });
        const [aliasRoot] = shim.getImportObject()["wasi:filesystem/preopens"].getDirectories()[0];

        const nested = aliasRoot.openAt({}, "nested", { directory: true }, { read: true });
        opened.push(nested);
        const child = nested.openAt({}, "child.txt", {}, { read: true });
        opened.push(child);
        assert.strictEqual(new TextDecoder().decode(child.read(64n, 0n)[0]), "child contents");
        nested.createDirectoryAt("created-dir");
        assert.strictEqual(statSync(join(testDir, "nested", "created-dir")).isDirectory(), true);
    });
});
