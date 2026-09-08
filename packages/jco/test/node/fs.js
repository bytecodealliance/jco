import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assert, expect, suite, test } from "vitest";

import { FS_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { componentizeFixture, getTmpDir, transpileComponent } from "../helpers.js";

/** jco-std's Node host adapter, which an application must opt into explicitly. */
const NODE_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs/host/node");

suite("node:fs in a component", () => {
    test.concurrent("injects one filesystem capability into the selected world", async () => {
        const root = await getTmpDir();
        const wit = join(root, "worlds.wit");
        await writeFile(
            wit,
            ["package example:filesystem;", "world unused {}", "world app { export run: func(); }", ""].join("\n"),
        );

        try {
            await injectNodeWitImports(root, "example:filesystem/app", [FS_WIT_REQUIREMENT, FS_WIT_REQUIREMENT]);
            expect(await injectNodeWitImports(root, "app", [FS_WIT_REQUIREMENT])).toBeUndefined();

            const source = await readFile(wit, "utf8");
            expect(source.match(/import jco:node\/fs@0\.1\.0;/g)).toHaveLength(1);
            expect(source.slice(source.indexOf("world unused"), source.indexOf("world app"))).not.toContain(
                "jco:node/fs",
            );
            const dependency = join(root, "deps/jco-node-0.1.0/fs.wit");
            await expect(stat(dependency)).resolves.toBeDefined();
            const filesystemWit = await readFile(dependency, "utf8");
            expect(filesystemWit).toContain("access: func(");
            expect(filesystemWit).toContain("read-file: func(");
            expect(filesystemWit).toContain("writev: func(");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    // TODO(unskip): needs a jco-std release with unwrapped host results and cross-realm byte handling (PR #2080).
    test.skip("componentizes sync, callback, and promise APIs through the opt-in Node host", async () => {
        const { componentPath, fixtureDir, outputDir, stderr } = await componentizeFixture({
            fixture: "node-fs",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "starlingmonkey"],
        });
        assert.include(stderr, "Jco added generated WIT import jco:node/fs@0.1.0");
        assert.include(await readFile(join(fixtureDir, "wit/component.wit"), "utf8"), "import jco:node/fs@0.1.0;");

        const { modulePath } = await transpileComponent({
            componentPath,
            name: "node-fs",
            extraArgs: ["--map", `jco:node/fs@0.1.0=${NODE_HOST}`],
        });
        const component = await import(modulePath);

        assert.deepEqual(await component.run(outputDir), {
            syncContents: "sync",
            callbackContents: "sync",
            promiseContents: "sync + promise",
            descriptorContents: "sync",
            isFile: true,
            entries: "message.txt",
        });
    }, 600_000);
});
