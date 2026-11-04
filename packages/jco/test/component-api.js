import { readFile } from "node:fs/promises";

import { assert, test, vi } from "vitest";

import { transpile } from "../src/browser.js";

// Exercise the locally built bindgen rather than the released transpile dependency.
vi.mock("@bytecodealliance/jco-transpile/component", () => import("../obj/js-component-bindgen-component.js"));

test("component API transpiles async exports returning a type-only imported resource", async () => {
    const component = await readFile(
        new URL("../../jco-transpile/test/fixtures/components/p3/async-pass-imported-resource.wat", import.meta.url),
    );
    const { files, imports, exports } = await transpile(component, {
        name: "async-pass-imported-resource",
        instantiation: { tag: "async" },
        noTypescript: true,
    });

    assert.include(imports, "test:data/blob");
    assert.deepInclude(exports, ["pass", "function"]);
    assert.include(
        files.map(([name]) => name),
        "async-pass-imported-resource.js",
    );
});
