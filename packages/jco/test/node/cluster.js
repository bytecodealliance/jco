import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { assert, suite, test } from "vitest";
import { COMPONENT_JS_FIXTURES_DIR } from "../common.js";
import { exec, getTmpDir, jcoPath } from "../helpers.js";

suite("node:cluster", () => {
    // TODO(unskip): jco pins @bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster, and no
    // published jco-std exports the cluster shim at all -- it only exists in the workspace copy.
    // Unskip once a jco-std release carrying it is published and jco's range is bumped to it.
    test.skip("bundles and executes APIs guest-side", async () => {
        const fixtureDir = join(COMPONENT_JS_FIXTURES_DIR, "node-cluster");
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
        // The cluster host interface is not in the default map, so it is supplied explicitly.
        await exec(
            jcoPath,
            "transpile",
            componentPath,
            "-o",
            transpiledDir,
            "--name",
            "node-cluster",
            "--map",
            "jco:node/*=@bytecodealliance/preview2-shim/cluster#*",
        );
        await writeFile(join(transpiledDir, "package.json"), JSON.stringify({ type: "module" }));

        const component = await import(`${pathToFileURL(transpiledDir)}/node-cluster.js`);
        assert.deepEqual(component.run(), {
            roleChecks: 3,
            constantChecks: 3,
            emitterChecks: 3,
            settingsChecks: 3,
            forkChecks: 3,
            // The unsupported surface is exercised by the guest, so its errors are observed here
            // rather than only in jco-std's unit tests.
            workerProcessCode: "ERR_JCO_UNSUPPORTED_NODE_API",
            setupMasterCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
            isMasterCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
            hostSettingCode: "ERR_JCO_UNSUPPORTED_NODE_API",
            nonJsonMessageCode: "ERR_JCO_UNSUPPORTED_NODE_API",
            metaEventCode: "ERR_JCO_UNSUPPORTED_NODE_API",
        });
    });
});
