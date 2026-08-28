import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { version as nodeVersion } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assert, suite, test } from "vitest";

import { COMPONENT_JS_FIXTURES_DIR } from "../common.js";
import { exec, getTmpDir, jcoPath } from "../helpers.js";

suite("node:child_process in a component", () => {
    // TODO(unskip): use the published jco-std child-process exports once a release containing them is available.
    test.skip("componentizes and calls through the opt-in Node host", async () => {
        const fixtureDir = join(COMPONENT_JS_FIXTURES_DIR, "node-child-process");
        const outputDir = await getTmpDir();
        const appDir = join(outputDir, "app");
        const componentPath = join(outputDir, "component.wasm");
        const transpiledDir = join(outputDir, "transpiled");
        await cp(fixtureDir, appDir, { recursive: true });

        const { stderr } = await exec(
            jcoPath,
            "componentize",
            join(appDir, "source.js"),
            "--bundle",
            "--backend",
            "starlingmonkey",
            "--wit",
            join(appDir, "wit"),
            "--world-name",
            "test",
            "--out",
            componentPath,
        );
        assert.include(stderr, "Jco added generated WIT import jco:node/child-process@0.1.0");
        assert.include(
            await readFile(join(appDir, "wit/component.wit"), "utf8"),
            "import jco:node/child-process@0.1.0;",
        );

        const nodeHost = pathToFileURL(
            fileURLToPath(
                new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/child-process-host-node.js", import.meta.url),
            ),
        ).href;
        await exec(
            jcoPath,
            "transpile",
            componentPath,
            "--name",
            "node-child-process",
            "--map",
            `jco:node/child-process@0.1.0=${nodeHost}`,
            "--out-dir",
            transpiledDir,
        );
        await writeFile(join(transpiledDir, "package.json"), JSON.stringify({ type: "module" }));

        const component = await import(`${pathToFileURL(transpiledDir)}/node-child-process.js`);
        assert.deepEqual(component.run(), {
            execFile: "exec file",
            spawn: "spawn input",
            status: 0,
            shell: nodeVersion,
        });
    });
});
