import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "vitest";
import { componentWitMetadataForWorld } from "@bytecodealliance/jco-transpile";

import { CHILD_PROCESS_WIT_REQUIREMENT, injectNodeWitImports, witInjectionWarnings } from "../../src/node-wit.js";

const temporaryDirectories = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(files) {
    const root = await mkdtemp(join(tmpdir(), "jco-node-wit-test-"));
    temporaryDirectories.push(root);
    for (const [name, source] of Object.entries(files)) {
        const path = join(root, name);
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, source);
    }
    return root;
}

const requirement = CHILD_PROCESS_WIT_REQUIREMENT;

describe("Node API WIT import injection", () => {
    test("adds a generated import and dependency to a single-world WIT directory", async () => {
        const root = await fixture({
            "app.wit": "package example:app;\n\nworld app {\n  export run: func();\n}\n",
        });

        const result = await injectNodeWitImports(root, undefined, [requirement]);
        const source = await readFile(join(root, "app.wit"), "utf8");
        expect(result).toEqual({
            witPath: root,
            worldFile: join(root, "app.wit"),
            dependencyFiles: [join(root, "deps/jco-node-0.1.0/package.wit")],
            imports: ["jco:node/child-process@0.1.0"],
        });
        expect(source).toContain("// Added by Jco because bundled source imports node:child_process.");
        expect(source).toContain("import jco:node/child-process@0.1.0;");
        await expect(stat(join(root, "deps/jco-node-0.1.0/package.wit"))).resolves.toBeDefined();
        const metadata = await componentWitMetadataForWorld({ tag: "path", val: root }, "app");
        expect(metadata.imports).toContainEqual(
            expect.objectContaining({ namespace: "jco", package: "node", interface: "child-process" }),
        );
        expect(witInjectionWarnings(result)).toEqual([
            expect.stringContaining(`to ${join(root, "app.wit")}`),
            expect.stringContaining(join(root, "deps/jco-node-0.1.0/package.wit")),
        ]);
    });

    test("is a no-op when run a second time", async () => {
        const root = await fixture({ "app.wit": "package example:app;\nworld app {}\n" });
        await injectNodeWitImports(root, undefined, [requirement]);
        const once = await readFile(join(root, "app.wit"), "utf8");

        expect(await injectNodeWitImports(root, undefined, [requirement])).toBeUndefined();
        expect(await readFile(join(root, "app.wit"), "utf8")).toBe(once);
        expect(once.match(/import jco:node\/child-process@0\.1\.0;/g)).toHaveLength(1);
    });

    test("does not alter a user-provided import or add a duplicate dependency", async () => {
        const source = "package example:app;\nworld app {\n  import jco:node/child-process@0.1.0;\n}\n";
        const root = await fixture({
            "app.wit": source,
            "deps/jco-node-0.1.0/package.wit": "package jco:node@0.1.0; // user managed\n",
        });

        expect(await injectNodeWitImports(root, undefined, [requirement])).toBeUndefined();
        expect(await readFile(join(root, "app.wit"), "utf8")).toBe(source);
        expect(await readFile(join(root, "deps/jco-node-0.1.0/package.wit"), "utf8")).toContain("user managed");
    });

    test("recognizes an aliased user-provided import", async () => {
        const source = "package example:app;\nworld app {\n  import subprocess: jco:node/child-process@0.1.0;\n}\n";
        const root = await fixture({ "app.wit": source });
        expect(await injectNodeWitImports(root, undefined, [requirement])).toBeUndefined();
        expect(await readFile(join(root, "app.wit"), "utf8")).toBe(source);
    });

    test("deduplicates repeated detector reports", async () => {
        const root = await fixture({ "app.wit": "package example:app;\nworld app {}\n" });
        await injectNodeWitImports(root, undefined, [requirement, requirement]);
        const source = await readFile(join(root, "app.wit"), "utf8");
        expect(source.match(/import jco:node\/child-process@0\.1\.0;/g)).toHaveLength(1);
    });

    test("injects only into an explicitly selected world", async () => {
        const root = await fixture({
            "worlds.wit": [
                "package example:app@1.0.0;",
                "world first { export first: func(); }",
                "world second { export second: func(); }",
                "",
            ].join("\n"),
        });

        await injectNodeWitImports(root, "example:app/second@1.0.0", [requirement]);
        const source = await readFile(join(root, "worlds.wit"), "utf8");
        expect(source.indexOf("import jco:node/child-process@0.1.0;")).toBeGreaterThan(source.indexOf("world second"));
        expect(source.indexOf("import jco:node/child-process@0.1.0;")).toBeLessThan(source.lastIndexOf("}"));
        expect(source.slice(source.indexOf("world first"), source.indexOf("world second"))).not.toContain(
            "child-process",
        );
    });

    test("requires an explicit selection when multiple worlds exist", async () => {
        const source = "package example:app;\nworld first {}\nworld second {}\n";
        const root = await fixture({ "worlds.wit": source });
        await expect(injectNodeWitImports(root, undefined, [requirement])).rejects.toThrow(/specify --world/);
        expect(await readFile(join(root, "worlds.wit"), "utf8")).toBe(source);
    });

    test("reports a selected world that cannot be found", async () => {
        const root = await fixture({ "app.wit": "package example:app;\nworld app {}\n" });
        await expect(injectNodeWitImports(root, "missing", [requirement])).rejects.toThrow(
            /selected world missing was not found/,
        );
    });

    test("ignores world and import text inside comments", async () => {
        const root = await fixture({
            "app.wit": [
                "package example:app;",
                "// world fake { import jco:node/child-process@0.1.0; }",
                "/* world also-fake {} */",
                "world app {}",
                "",
            ].join("\n"),
        });
        await injectNodeWitImports(root, undefined, [requirement]);
        const source = await readFile(join(root, "app.wit"), "utf8");
        expect(source.match(/^[ ]*import jco:node\/child-process@0\.1\.0;/gm)).toHaveLength(1);
    });

    test("supports a WIT file path and preserves CRLF newlines", async () => {
        const root = await fixture({ "app.wit": "package example:app;\r\nworld app {\r\n}\r\n" });
        const witFile = join(root, "app.wit");
        const result = await injectNodeWitImports(witFile, "app", [requirement]);
        const source = await readFile(witFile, "utf8");
        expect(source).toContain("node:child_process.\r\n  import");
        expect(source.replaceAll("\r\n", "")).not.toContain("\n");
        await expect(stat(join(root, "deps/jco-node-0.1.0/package.wit"))).resolves.toBeDefined();
        const metadata = await componentWitMetadataForWorld({ tag: "path", val: result.witPath }, "app");
        expect(metadata.imports).toContainEqual(expect.objectContaining({ interface: "child-process" }));
    });

    test("does not inspect or modify a missing WIT path when nothing was detected", async () => {
        expect(await injectNodeWitImports("/does/not/exist", undefined, [])).toBeUndefined();
    });

    test("does not overwrite an existing dependency when adding a missing import", async () => {
        const root = await fixture({
            "app.wit": "package example:app;\nworld app {}\n",
            "deps/jco-node-0.1.0/package.wit": "package jco:node@0.1.0; // pinned by user\n",
        });
        const result = await injectNodeWitImports(root, undefined, [requirement]);
        expect(result.dependencyFiles).toEqual([]);
        expect(await readFile(join(root, "deps/jco-node-0.1.0/package.wit"), "utf8")).toContain("pinned by user");
    });

    test("leaves the world unchanged when a generated dependency cannot be read", async () => {
        const source = "package example:app;\nworld app {}\n";
        const root = await fixture({ "app.wit": source });
        await expect(
            injectNodeWitImports(root, undefined, [
                { ...requirement, dependencyDirectory: "missing", dependencySource: join(root, "missing.wit") },
            ]),
        ).rejects.toThrow();
        expect(await readFile(join(root, "app.wit"), "utf8")).toBe(source);
    });

    test("rejects an unterminated selected world without modifying it", async () => {
        const source = "package example:app;\nworld app {\n";
        const root = await fixture({ "app.wit": source });
        await expect(injectNodeWitImports(root, "app", [requirement])).rejects.toThrow(
            /unterminated WIT world declaration/,
        );
        expect(await readFile(join(root, "app.wit"), "utf8")).toBe(source);
    });
});
