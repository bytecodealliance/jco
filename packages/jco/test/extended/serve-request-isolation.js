import { execPath } from "node:process";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { rm, writeFile } from "node:fs/promises";

import { suite, test, assert, beforeAll, afterAll } from "vitest";

import { COMPONENT_JS_FIXTURES_DIR, JCO_JS_PATH } from "../common.js";
import { exec, getRandomPort, getTmpDir, waitForServer } from "../helpers.js";

suite("serve request isolation", () => {
    let tmpDir;
    let componentPath;

    beforeAll(async () => {
        tmpDir = await getTmpDir();
        componentPath = join(tmpDir, "stateful-http.wasm");
        const sourcePath = join(tmpDir, "stateful-http.js");
        await writeFile(
            sourcePath,
            `
let requests = 0;
addEventListener("fetch", event => event.respondWith((async () =>
  new Response(String(++requests) + ":" + await event.request.text())
)()));
`,
        );
        await exec(
            JCO_JS_PATH,
            "componentize",
            sourcePath,
            "-w",
            join(COMPONENT_JS_FIXTURES_DIR, "wasi-http-detection-old/wit"),
            "-o",
            componentPath,
            { closeStdin: true },
        );
    }, 300_000);

    afterAll(async () => rm(tmpDir, { recursive: true, force: true }));

    for (const [name, option] of [
        ["instance mode", "--isolate-requests=instance"],
        ["worker mode", "--isolate-requests=worker"],
        ["bare option defaults to worker mode", "--isolate-requests"],
    ]) {
        test(`isolates state and proxies bodies end to end in ${name}`, async () => {
            const port = await getRandomPort();
            const child = spawn(execPath, [JCO_JS_PATH, "serve", componentPath, option, "--port", String(port)], {
                stdio: ["ignore", "ignore", "pipe"],
            });
            try {
                await waitForServer(child);
                const first = await fetch(`http://localhost:${port}`, { method: "POST", body: "first" });
                const second = await fetch(`http://localhost:${port}`, { method: "POST", body: "second" });
                assert.strictEqual(await first.text(), "1:first");
                assert.strictEqual(await second.text(), "1:second");
            } finally {
                child.kill();
                await new Promise((resolve) => child.once("exit", resolve));
            }
        });
    }
});
