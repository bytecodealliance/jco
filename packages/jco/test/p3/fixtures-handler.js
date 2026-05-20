import { suite, test } from "vitest";

import { P3_HANDLER_RUN_FIXTURES, fixtureTestName, setupP3HandlerFixture } from "./helpers/fixtures.js";
import { runHandlerFixture } from "./helpers/http.js";

suite("P3 handler fixtures", () => {
    for (const fixture of P3_HANDLER_RUN_FIXTURES) {
        const run = fixture.failing ? test.skip : test.concurrent;
        run(`invoke ${fixtureTestName(fixture)}`, async () => {
            const { esModule, cleanup } = await setupP3HandlerFixture(fixture);
            try {
                await runHandlerFixture({ esModule, outbound: fixture.outbound, expect: fixture.expect });
            } finally {
                await cleanup?.();
            }
        });
    }
});
