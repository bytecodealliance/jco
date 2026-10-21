import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { suite, test, assert } from "vitest";

import { exec, jcoPath, fileExists, setupTestWithLocalShims } from "../helpers.js";
import { EXTENDED_TEST_COMPONENTS_DIR } from "../common.js";

async function runPosixPthreadTest(testPath) {
    const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, "posix", testPath, "component.wasm");
    assert(await fileExists(componentPath), `built POSIX pthread component ${testPath} must be in place`);

    const { outDir, cleanup } = await setupTestWithLocalShims();
    try {
        await exec(jcoPath, "transpile", componentPath, "-o", outDir, "--name", "out");
        const instance = await import(pathToFileURL(join(outDir, "out.js")));
        return await instance.run();
    } finally {
        await cleanup();
    }
}

// TODO(unskip): When jco-transpile is updated
suite.skip("posix-pthread", () => {
    test("mutex lock: 1-1", async () => {
        assert.strictEqual(await runPosixPthreadTest("pthread-mutex-lock/1-1"), 0);
    });

    test("create and join", async () => {
        assert.strictEqual(await runPosixPthreadTest("pthread-create-join/1-1"), 0);
    });

    test("condition wait and signal", async () => {
        assert.strictEqual(await runPosixPthreadTest("pthread-cond-wait/1-1"), 0);
    });

    test("thread-specific storage", async () => {
        assert.strictEqual(await runPosixPthreadTest("pthread-setspecific/1-1"), 0);
    });
});
