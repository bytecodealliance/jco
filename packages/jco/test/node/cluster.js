import { readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assert, suite, test } from "vitest";

import { componentizeFixture, exec, transpileComponent } from "../helpers.js";

/** jco-std's Node host adapter, which an application must opt into explicitly. */
const NODE_HOST = pathToFileURL(
    fileURLToPath(new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/cluster-host-node.js", import.meta.url)),
).href;

/** Build a cluster fixture from a copy, since componentizing rewrites its world in place. */
async function buildClusterFixture(fixture, name) {
    const { componentPath, fixtureDir, outputDir, stderr } = await componentizeFixture({
        fixture,
        entry: "source.js",
        wit: "wit",
        world: "test",
        bundle: true,
        copy: true,
        extraArgs: ["--backend", "starlingmonkey"],
    });
    // Transpile beside the component so a test that spawns the output can put a node_modules
    // next to it, which is how the generated JS resolves @bytecodealliance/preview2-shim.
    const { transpiledDir, modulePath } = await transpileComponent({
        componentPath,
        name,
        outputDir: join(outputDir, "transpiled"),
        extraArgs: ["--map", `jco:node/cluster@0.1.0=${NODE_HOST}`],
    });
    return { appDir: fixtureDir, outputDir, transpiledDir, modulePath, stderr };
}

suite("node:cluster in a component", () => {
    // TODO(unskip): use the published jco-std cluster exports once a release containing them is available.
    test.skip("componentizes and calls through the opt-in Node host", async () => {
        const { appDir, modulePath, stderr } = await buildClusterFixture("node-cluster", "node-cluster");

        assert.include(stderr, "Jco added generated WIT import jco:node/cluster@0.1.0");
        assert.include(await readFile(join(appDir, "wit/component.wit"), "utf8"), "import jco:node/cluster@0.1.0;");

        const component = await import(modulePath);
        assert.deepEqual(component.run(), {
            roleChecks: 3,
            constantChecks: 3,
            emitterChecks: 3,
            settingsChecks: 3,
            forkChecks: 3,
            // The unsupported surface is exercised by the guest, so its errors are observed through
            // real componentization rather than only in jco-std's unit tests.
            workerProcessCode: "ERR_JCO_UNSUPPORTED_NODE_API",
            setupMasterCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
            isMasterCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
            hostSettingCode: "ERR_JCO_UNSUPPORTED_NODE_API",
            nonJsonMessageCode: "ERR_JCO_UNSUPPORTED_NODE_API",
            metaEventCode: "ERR_JCO_UNSUPPORTED_NODE_API",
        });
    });

    // TODO(unskip): use the published jco-std cluster exports once a release containing them is available.
    //
    // Driven from a spawned script rather than in-process: cluster.fork() re-executes the current
    // entry, so forking from inside the test runner would fork the runner itself.
    test.skip("forks a worker that runs the component and reports back", async () => {
        const { outputDir, modulePath } = await buildClusterFixture("node-cluster-roundtrip", "node-cluster-rt");

        // The runner is a bare node process outside the workspace, so give the transpiled output a
        // node_modules to resolve @bytecodealliance/preview2-shim through.
        await symlink(
            fileURLToPath(new URL("../../node_modules", import.meta.url)),
            join(outputDir, "node_modules"),
            "dir",
        );

        const runnerPath = join(outputDir, "runner.mjs");
        await writeFile(
            runnerPath,
            `
import * as component from "${modulePath}";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!component.isPrimary()) {
    component.reportIn();
    await sleep(1000);
} else {
    component.start();
    let progress = component.poll();
    for (let i = 0; i < 60 && !progress.messages; i += 1) {
        await sleep(50);
        progress = component.poll();
    }
    component.shutdown();
    for (let i = 0; i < 60 && !progress.exited; i += 1) {
        await sleep(50);
        progress = component.poll();
    }
    console.log(JSON.stringify(progress));
    process.exit(0);
}
`,
        );

        const { stdout } = await exec(runnerPath);
        const progress = JSON.parse(stdout.trim().split("\n").at(-1));

        // The worker really ran the component: it reported its own id and env-provided role.
        const message = JSON.parse(progress.messages.split("|")[0]);
        assert.strictEqual(message.from, "worker");
        assert.strictEqual(message.role, "roundtrip");
        assert.strictEqual(typeof message.id, "number");

        for (const event of ["fork", "online", "message", "disconnect", "exit"]) {
            assert.include(progress.events, event, `expected a '${event}' event`);
        }
        assert.strictEqual(progress.exited, true);
    });
});
