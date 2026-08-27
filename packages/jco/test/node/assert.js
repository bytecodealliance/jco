import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { assert, suite, test } from "vitest";
import { COMPONENT_JS_FIXTURES_DIR } from "../common.js";
import { exec, getTmpDir, jcoPath } from "../helpers.js";

suite("node:assert", () => {
    test("bundles and executes APIs guest-side", async () => {
        const fixtureDir = join(COMPONENT_JS_FIXTURES_DIR, "node-assert");
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
            join(fixtureDir, "source.wit"),
            "-o",
            componentPath,
        );
        await exec(jcoPath, "transpile", componentPath, "-o", transpiledDir, "--name", "node-assert");
        await writeFile(join(transpiledDir, "package.json"), JSON.stringify({ type: "module" }));

        const component = await import(`${pathToFileURL(transpiledDir)}/node-assert.js`);
        assert.deepEqual(component.run(), {
            scalarChecks: 19,
            deepChecks: 14,
            matcherChecks: 12,
            moduleChecks: 7,
            promiseChecks: 2,
            deprecatedChecks: 2,
            failureCode: "ERR_ASSERTION",
            failureOperator: "strictEqual",
            strictSubpath: true,
            deprecatedCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
        });
    });
});
