import { env as processEnv } from "node:process";

import { suite, test, beforeAll, afterAll } from "vitest";
import { _setHandler } from "@bytecodealliance/preview3-shim/http";

import { P3_HANDLER_RUN_FIXTURES, fixtureTestName, setupP3HandlerFixture } from "./helpers/fixtures.js";
import { createEchoHandler, runHandlerFixture, startP3HttpServer } from "./helpers/http.js";

suite("P3 handler fixtures", () => {
    let server;
    let previousHttpServer;
    let previousHandler;

    beforeAll(async () => {
        server = await startP3HttpServer();
        previousHttpServer = processEnv.HTTP_SERVER;
        processEnv.HTTP_SERVER = server.address;
        previousHandler = _setHandler(createEchoHandler());
    });

    afterAll(async () => {
        if (previousHttpServer === undefined) {
            delete processEnv.HTTP_SERVER;
        } else {
            processEnv.HTTP_SERVER = previousHttpServer;
        }
        _setHandler(previousHandler);
        await server?.cleanup();
    });

    for (const fixture of P3_HANDLER_RUN_FIXTURES) {
        const run = fixture.failing ? test.skip : test.concurrent;
        run(`invoke ${fixtureTestName(fixture)}`, async () => {
            const context = { server };
            const outbound = typeof fixture.outbound === "function" ? fixture.outbound(context) : fixture.outbound;
            const expect = typeof fixture.expect === "function" ? fixture.expect(context) : fixture.expect;
            const { esModule, cleanup } = await setupP3HandlerFixture(fixture);
            try {
                await runHandlerFixture({ esModule, outbound, expect });
            } finally {
                await cleanup?.();
            }
        });
    }
});
