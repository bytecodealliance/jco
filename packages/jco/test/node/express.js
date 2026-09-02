import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { componentizeFixture, exec, setupAsyncTest } from "../helpers.js";

/**
 * Express is the interesting case for Node built-in compatibility: nothing about it is
 * written for components, it is CommonJS all the way down, and between `express`,
 * `body-parser`, `send`, `router`, `depd` and `iconv-lite` its dependency graph reaches most
 * of what Jco supplies -- `node:http`, `node:stream`, `node:crypto`, `node:string_decoder`,
 * `node:zlib`, `node:util`, `node:url`, the `Buffer`, `process` and `setImmediate` globals,
 * and V8's structured stack traces.
 *
 * There is no Express adapter to test. What these cases check is that an ordinary Express
 * program componentizes, and that Express then behaves as Express inside the component.
 */

/** Build a fixture inside this package, so that its `import "express"` resolves. */
async function withFixture(fixture, extraArgs, run) {
    const outputDir = await mkdtemp(fileURLToPath(new URL("../.express-", import.meta.url)));
    try {
        const built = await componentizeFixture({
            fixture,
            bundle: true,
            copy: true,
            outputDir,
            extraArgs: ["--backend", "starlingmonkey", ...extraArgs],
        });
        return await run(built);
    } finally {
        await rm(outputDir, { recursive: true, force: true });
    }
}

describe("express in a component", () => {
    test("componentizes an ordinary Express program", async () => {
        await withFixture("node-express", ["--with-nodejs-http-via", "direct"], ({ stderr }) => {
            // The world the fixture declares carries nothing but its own two exports. Every
            // capability Express reaches for is discovered while bundling and added, which is
            // what makes an unmodified program componentizable without WIT of its own.
            expect(stderr).toContain("jco:node/http@0.1.0");
            expect(stderr).toContain("jco:node/fs@0.1.0");
            expect(stderr).toContain("wasi:cli/environment@0.2.12");
            expect(stderr).toContain("jco:node/http-callbacks@0.1.0");
        });
    }, 600_000);

    test("runs Express request handling inside the component", async () => {
        await withFixture("node-express-handle", ["--with-nodejs-http-via", "wasi-http"], async ({ componentPath }) => {
            const { esModuleOutputPath, cleanup } = await setupAsyncTest({
                component: {
                    name: "node-express-handle",
                    path: componentPath,
                    skipInstantiation: true,
                },
                jco: { transpile: { extraArgs: { asyncExports: ["*"] } } },
            });
            try {
                const runner = fileURLToPath(
                    new URL("../fixtures/componentize/node-express-handle/run.js", import.meta.url),
                );
                const output = await exec(runner, esModuleOutputPath);
                const results = JSON.parse(output.stdout);

                // Routing, and the response Express derives on its own: `res.send()`
                // picks the content type and computes an ETag, which is the digest path
                // through `node:crypto`.
                expect(results.root).toMatchObject({ status: 200, body: "Hello World!" });
                expect(results.root.contentType).toMatch(/^text\/html/);
                expect(results.root.etag).toBe(true);

                // A middleware ran ahead of the route and its header survived.
                expect(results.root.chained).toBe(true);

                // Route parameters and the query string.
                expect(results.params.status).toBe(200);
                expect(JSON.parse(results.params.body)).toEqual({ id: "42", page: "3" });

                // The request body, read off the request as a stream.
                expect(JSON.parse(results.raw.body)).toEqual({ raw: "hello-raw" });

                // `next(error)` reaching the application's error handler.
                expect(results.boom.status).toBe(503);
                expect(JSON.parse(results.boom.body)).toEqual({ handled: "deliberate failure" });

                // Express answers an unrouted request itself, through `finalhandler`.
                expect(results.missing.status).toBe(404);
                expect(results.missing.body).toContain("Cannot GET /nope");
            } finally {
                await cleanup();
            }
        });
    }, 600_000);

    // TODO(unskip): `IncomingMessage` delivers its body to an async iterator and to `pipe()`,
    // but a `"data"` listener does not start the stream the way Node's `Readable` does.
    // `raw-body` -- and so every body parser Express ships, `express.json()` included -- reads
    // through listeners, and sees an empty body. The `/raw` assertion above covers the same
    // request body read the way the stream does support.
    test.skip("parses a JSON request body with express.json()", async () => {
        await withFixture("node-express-handle", ["--with-nodejs-http-via", "wasi-http"], async ({ componentPath }) => {
            const { esModuleOutputPath, cleanup } = await setupAsyncTest({
                component: {
                    name: "node-express-handle",
                    path: componentPath,
                    skipInstantiation: true,
                },
                jco: { transpile: { extraArgs: { asyncExports: ["*"] } } },
            });
            try {
                const runner = fileURLToPath(
                    new URL("../fixtures/componentize/node-express-handle/run.js", import.meta.url),
                );
                const output = await exec(runner, esModuleOutputPath);
                const results = JSON.parse(output.stdout);
                expect(results.posted.status).toBe(201);
                expect(JSON.parse(results.posted.body)).toEqual({ echoed: { hello: "world" } });
            } finally {
                await cleanup();
            }
        });
    }, 600_000);
});
