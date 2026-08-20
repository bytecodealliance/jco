import { createServer } from "node:http";
import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { exec, jcoPath, fileExists } from "../helpers.js";
import { EXTENDED_TEST_COMPONENTS_DIR } from "../common.js";

suite("jco-issue-577", () => {
    test("wstd HTTP client handles an empty trailers result", async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, "jco-issue-577/component.wasm");
        assert(await fileExists(componentPath), "built issue component must be in place");

        const responseBody = "hello from the jco issue 577 test\n";
        const server = createServer((_request, response) => {
            response.writeHead(200, { "content-type": "text/plain" });
            response.end(responseBody);
        });

        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });

        try {
            const address = server.address();
            assert.isObject(address);
            const url = `http://127.0.0.1:${address.port}/`;
            const { stdout, stderr } = await exec(jcoPath, "run", componentPath, url);

            assert.strictEqual(stdout, responseBody);
            assert.include(stderr, "> GET / HTTP/1.1");
            assert.include(stderr, "< HTTP/1.1 200 OK");
        } finally {
            await new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
});
