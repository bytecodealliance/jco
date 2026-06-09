import { join } from "node:path";

import { fileURLToPath } from "node:url";

import { suite, test, expect } from "vitest";

import { setupAsyncTest } from "../helpers.js";

const COMPONENT_FIXTURES_DIR = fileURLToPath(new URL("../fixtures/components", import.meta.url));

const P3_COMPONENT_FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, "p3");

suite("Context (WASI P3)", () => {
    test("context.get/set (sync export, sync call)", async () => {
        const name = "context-sync";

        // NOTE: Despite not specifying the export as async (via jco transpile options in setupAsyncTest),
        // the export is async -- since the component lifted the function in an async manner.
        //
        // This test performs a sync call of an async lifted export.
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(P3_COMPONENT_FIXTURES_DIR, name, "component.wasm"),
            },
        });

        expect(instance.pullContext).toBeTruthy();
        expect(instance.pushContext).toBeTruthy();
        expect(instance.pushContext(33)).toEqual(33);
        // NOTE: context is wiped from task to task, and sync call tasks end as soon as they return
        expect(instance.pullContext()).toEqual(0);

        await cleanup();
    });
});
