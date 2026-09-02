import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

import { componentizeFixture, exec, setupAsyncTest } from "../helpers.js";

/**
 * Express is the widest test of Node builtin compatibility: nothing about it is written for
 * components, it is CommonJS all the way down, and between `express`, `body-parser`, `send`,
 * `router`, `depd` and `iconv-lite` its dependency graph reaches most of what Jco supplies --
 * `node:http`, `node:stream`, `node:crypto`, `node:string_decoder`, `node:zlib`, `node:util`,
 * `node:url`, the `Buffer`, `process` and `setImmediate` globals, and V8's structured stack
 * traces.
 *
 * There is no Express adapter to test. The fixture is an ordinary Express program -- it
 * builds an app, registers routes and calls `app.listen()` -- and the assertions are made by
 * talking to it over a real socket.
 */

const NODE_HTTP_HOST = pathToFileURL(
    fileURLToPath(new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/http-host-node.js", import.meta.url)),
).href;

const NODE_FS_HOST = pathToFileURL(
    fileURLToPath(new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/fs-host.js", import.meta.url)),
).href;

/**
 * The exports and imports that have to cross the JSPI boundary asynchronously.
 *
 * Named rather than given as `"*"`: the wildcard marks an export's binding async without
 * wrapping the export itself in `WebAssembly.promising`, so a call that suspends on an async
 * import fails with `SuspendError`.
 */
const ASYNC_EXPORTS = ["start", "stop", "jco:node/http-callbacks@0.1.0#handle-request"];

describe("express in a component", () => {
    test("serves an unmodified Express application over a socket", async () => {
        // Componentizing rewrites the world in place to add the Node WIT imports, so the
        // fixture is built from a copy. The copy stays inside this package because the
        // fixture imports `express` by name, and a copy outside the workspace would not
        // resolve it -- which is also true of any real application being componentized.
        const outputDir = await mkdtemp(fileURLToPath(new URL("../.express-", import.meta.url)));
        try {
            const { componentPath, stderr } = await componentizeFixture({
                fixture: "node-express",
                bundle: true,
                copy: true,
                outputDir,
                extraArgs: ["--backend", "starlingmonkey", "--with-nodejs-http-via", "direct"],
            });

            // The world the fixture declares carries nothing but its own two exports.
            // Every capability Express reaches for is discovered while bundling and
            // added, which is what makes an unmodified program componentizable without
            // WIT of its own.
            expect(stderr).toContain("jco:node/http@0.1.0");
            expect(stderr).toContain("jco:node/fs@0.1.0");
            expect(stderr).toContain("wasi:cli/environment@0.2.12");
            expect(stderr).toContain("jco:node/http-callbacks@0.1.0");

            const { esModuleOutputPath, cleanup } = await setupAsyncTest({
                component: { name: "node-express", path: componentPath, skipInstantiation: true },
                jco: {
                    transpile: {
                        extraArgs: {
                            asyncExports: ASYNC_EXPORTS,
                            map: {
                                "jco:node/http@0.1.0": NODE_HTTP_HOST,
                                // Express loads `node:fs` on its way to `res.sendFile()`
                                // even when nothing calls it, so the import has to be
                                // satisfied; the deny-by-default host does that without
                                // granting access.
                                "jco:node/fs@0.1.0": NODE_FS_HOST,
                            },
                        },
                    },
                },
            });

            try {
                const runner = fileURLToPath(new URL("../fixtures/componentize/node-express/run.js", import.meta.url));
                const output = await exec(
                    runner,
                    esModuleOutputPath,
                    NODE_HTTP_HOST,
                    `${NODE_FS_HOST}=${NODE_FS_HOST}`,
                );
                const results = JSON.parse(output.stdout);

                // A route, and the response Express derives on its own: `res.send()` picks
                // the content type and computes an ETag, which is the digest path through
                // `node:crypto`.
                expect(results.root).toMatchObject({ status: 200, body: "Hello World!" });
                expect(results.root.contentType).toMatch(/^text\/html/);
                expect(results.root.etag).toBe(true);

                // Route parameters and the query string.
                expect(results.params.status).toBe(200);
                expect(JSON.parse(results.params.body)).toEqual({ id: "42", page: "3" });

                // A status the application set itself.
                expect(results.posted.status).toBe(201);

                // Express answers an unrouted request itself, through `finalhandler`.
                expect(results.missing.status).toBe(404);
                expect(results.missing.body).toContain("Cannot GET /nope");
            } finally {
                await cleanup();
            }
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    }, 600_000);
});
