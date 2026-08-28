import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { assert, suite, test } from "vitest";
import { COMPONENT_JS_FIXTURES_DIR } from "../common.js";
import { exec, getTmpDir, jcoPath } from "../helpers.js";

/** The cluster host interface is not in the default transpile map, so it is supplied explicitly. */
const CLUSTER_MAP = ["--map", "jco:node/*=@bytecodealliance/preview2-shim/cluster#*"];

/** Componentize a fixture whose world imports the cluster interface, then transpile it. */
async function buildClusterFixture(fixture, name) {
    const fixtureDir = join(COMPONENT_JS_FIXTURES_DIR, fixture);
    const outputDir = await getTmpDir();
    const componentPath = join(outputDir, "component.wasm");
    const transpiledDir = join(outputDir, "transpiled");

    await exec(
        jcoPath,
        "componentize",
        join(fixtureDir, "source.js"),
        "--bundle",
        "--backend",
        "qjs",
        "-w",
        fixtureDir,
        "-o",
        componentPath,
    );
    await exec(jcoPath, "transpile", componentPath, "-o", transpiledDir, "--name", name, ...CLUSTER_MAP);
    await writeFile(join(transpiledDir, "package.json"), JSON.stringify({ type: "module" }));
    return { outputDir, transpiledDir };
}

suite("node:cluster", () => {
    // TODO(unskip): jco pins @bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster, and no
    // published jco-std exports the cluster shim at all -- it only exists in the workspace copy.
    // Unskip once a jco-std release carrying it is published and jco's range is bumped to it.
    test.skip("bundles and executes APIs guest-side", async () => {
        const { transpiledDir } = await buildClusterFixture("node-cluster", "node-cluster");
        const component = await import(`${pathToFileURL(transpiledDir)}/node-cluster.js`);

        assert.deepEqual(component.run(), {
            roleChecks: 3,
            constantChecks: 3,
            emitterChecks: 3,
            settingsChecks: 3,
            forkChecks: 3,
            // The unsupported surface is exercised by the guest, so its errors are observed
            // through real componentization rather than only in jco-std's unit tests.
            workerProcessCode: "ERR_JCO_UNSUPPORTED_NODE_API",
            setupMasterCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
            isMasterCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
            hostSettingCode: "ERR_JCO_UNSUPPORTED_NODE_API",
            nonJsonMessageCode: "ERR_JCO_UNSUPPORTED_NODE_API",
            metaEventCode: "ERR_JCO_UNSUPPORTED_NODE_API",
        });
    });

    // TODO(unskip): same jco-std release dependency as above.
    //
    // This one is driven from a spawned script rather than in-process: cluster.fork() re-executes
    // the current entry, so forking from inside the test runner would fork the runner itself.
    test.skip("forks a worker that runs the component and reports back", async () => {
        const { outputDir, transpiledDir } = await buildClusterFixture("node-cluster-roundtrip", "node-cluster-rt");
        const runnerPath = join(outputDir, "runner.mjs");
        await writeFile(
            runnerPath,
            `
import * as component from "${pathToFileURL(transpiledDir)}/node-cluster-rt.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!component.isPrimary()) {
    // The fork re-ran this script; this process is the worker.
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

        const { stdout } = await exec(process.execPath, runnerPath);
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

    test("requires the world to import the cluster host interface", async () => {
        const fixtureDir = join(COMPONENT_JS_FIXTURES_DIR, "node-cluster-missing-capability");
        const outputDir = await getTmpDir();

        let error;
        try {
            await exec(
                jcoPath,
                "componentize",
                join(fixtureDir, "source.js"),
                "--bundle",
                "--backend",
                "qjs",
                "-w",
                join(fixtureDir, "source.wit"),
                "-o",
                join(outputDir, "component.wasm"),
            );
        } catch (thrown) {
            error = thrown;
        }

        assert.isDefined(error, "componentizing without the interface should fail");
        assert.match(String(error), /node:cluster requires the selected WIT world to import/);
        assert.match(String(error), /jco:node\/cluster@0\.1\.0/);
    });
});
