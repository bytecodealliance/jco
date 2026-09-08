import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { version as nodeVersion } from "node:process";

import { assert, suite, test } from "vitest";

import { componentizeFixture, transpileComponent } from "../helpers.js";

/** jco-std's Node host adapter, which an application must opt into explicitly. */
const NODE_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process/host/node");

suite("node:child_process in a component", () => {
    test("componentizes and calls through the opt-in Node host", async () => {
        // Built from a copy: componentizing rewrites the world in place to add the WIT import.
        const { componentPath, fixtureDir, stderr } = await componentizeFixture({
            fixture: "node-child-process",
            entry: "source.js",
            wit: "wit",
            world: "test",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "starlingmonkey"],
        });

        assert.include(stderr, "Jco added generated WIT import jco:node/child-process@0.1.0");
        assert.include(
            await readFile(join(fixtureDir, "wit/component.wit"), "utf8"),
            "import jco:node/child-process@0.1.0;",
        );

        const { modulePath } = await transpileComponent({
            componentPath,
            name: "node-child-process",
            extraArgs: ["--map", `jco:node/child-process@0.1.0=${NODE_HOST}`],
        });

        const component = await import(modulePath);
        assert.deepEqual(component.run(), {
            execFile: "exec file",
            spawn: "spawn input",
            status: 0,
            shell: nodeVersion,
        });
    });
});
