import { cp, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assert, suite, test } from "vitest";

import { COMPONENT_JS_FIXTURES_DIR } from "../common.js";
import { exec, getTmpDir, jcoPath } from "../helpers.js";

/** jco-std's Node host adapter, which an application must opt into explicitly. */
const NODE_HOST = pathToFileURL(
    fileURLToPath(new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/cluster-host-node.js", import.meta.url)),
).href;

/**
 * Componentize a cluster fixture from a copy, so the WIT import Jco injects lands in a temporary
 * directory rather than editing the fixture in the repository.
 */
async function buildClusterFixture(fixture, name, backend = "starlingmonkey") {
    const outputDir = await getTmpDir();
    const appDir = join(outputDir, "app");
    const componentPath = join(outputDir, "component.wasm");
    const transpiledDir = join(outputDir, "transpiled");
    await cp(join(COMPONENT_JS_FIXTURES_DIR, fixture), appDir, { recursive: true });

    const { stderr } = await exec(
        jcoPath,
        "componentize",
        join(appDir, "source.js"),
        "--bundle",
        "--backend",
        backend,
        "--wit",
        join(appDir, "wit"),
        "--world-name",
        "test",
        "--out",
        componentPath,
    );

    await exec(
        jcoPath,
        "transpile",
        componentPath,
        "--name",
        name,
        "--map",
        `jco:node/cluster@0.1.0=${NODE_HOST}`,
        "--out-dir",
        transpiledDir,
    );
    await writeFile(join(transpiledDir, "package.json"), JSON.stringify({ type: "module" }));
    return { appDir, outputDir, transpiledDir, stderr };
}

suite("node:cluster in a component", () => {
    // TODO(unskip): use the published jco-std cluster exports once a release containing them is available.
    test.skip("componentizes and calls through the opt-in Node host", async () => {
        const { appDir, transpiledDir, stderr } = await buildClusterFixture("node-cluster", "node-cluster");

        assert.include(stderr, "Jco added generated WIT import jco:node/cluster@0.1.0");
        assert.include(await readFile(join(appDir, "wit/component.wit"), "utf8"), "import jco:node/cluster@0.1.0;");

        const component = await import(`${pathToFileURL(transpiledDir)}/node-cluster.js`);
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
        // NOTE: qjs, because this fixture registers cluster listeners at module scope and that traps
        // StarlingMonkey's Wizer snapshot; the other fixture only touches cluster inside run().
        const { outputDir, transpiledDir } = await buildClusterFixture(
            "node-cluster-roundtrip",
            "node-cluster-rt",
            "qjs",
        );

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
import * as component from "${pathToFileURL(transpiledDir)}/node-cluster-rt.js";

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
