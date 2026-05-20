import { env as processEnv } from "node:process";

import { suite, test, beforeAll, afterAll } from "vitest";

import { runP3CliFixture } from "./helpers/cli.js";
import { P3_CLI_RUN_FIXTURES, fixtureTestName, setupP3CliFixture } from "./helpers/fixtures.js";
import { startP3HttpServer } from "./helpers/http.js";

suite("P3 CLI fixtures", () => {
    let server;
    let previousHttpServer;

    beforeAll(async () => {
        server = await startP3HttpServer();
        previousHttpServer = processEnv.HTTP_SERVER;
        processEnv.HTTP_SERVER = server.address;
    });

    afterAll(async () => {
        if (previousHttpServer === undefined) {
            delete processEnv.HTTP_SERVER;
        } else {
            processEnv.HTTP_SERVER = previousHttpServer;
        }
        await server?.cleanup();
    });

    for (const fixture of P3_CLI_RUN_FIXTURES) {
        const run = fixture.failing ? test.skip : test.concurrent;
        run(`run ${fixtureTestName(fixture)}`, async () => {
            const { esModuleHref, preopenDir, runnerArgs, cleanup } = await setupP3CliFixture(fixture);
            try {
                await runP3CliFixture({
                    esModuleHref,
                    preopenDir,
                    runnerArgs,
                });
            } finally {
                await cleanup?.();
            }
        });
    }
});
