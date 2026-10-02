import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { _createPreopenDescriptor } from "../src/nodejs/filesystem.js";

test.skipIf(process.platform !== "win32")(
    "opens a real Windows WIT directory for reading",
    async () => {
        const dir = await mkdtemp(join(tmpdir(), "jco-wit-"));
        try {
            await writeFile(join(dir, "component.wit"), "package test:component;\n");
            const root = _createPreopenDescriptor("/");
            const wit = root.openAt(
                { symlinkFollow: true },
                dir,
                { directory: true },
                { read: true },
            );
            expect(wit.stat().type).toBe("directory");
            const entries = wit.readDirectory();
            expect(entries.readDirectoryEntry()?.name).toBe("component.wit");
            entries[Symbol.dispose]();
            // Guests look each entry up through the directory they are listing
            expect(wit.statAt({ symlinkFollow: false }, "component.wit").type).toBe("regular-file");
            expect(() =>
                wit.metadataHashAt({ symlinkFollow: false }, "component.wit"),
            ).not.toThrow();
            wit[Symbol.dispose]();
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
