import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { bundleComponentSource } from "../../src/bundle.js";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { COMPONENT_JS_FIXTURES_DIR } from "../common.js";
import { exec, getTmpDir, jcoPath, transpileComponent } from "../helpers.js";

const fixtureDir = join(COMPONENT_JS_FIXTURES_DIR, "node-test");
const std = (path) => fileURLToPath(new URL(`../../../jco-std/dist/wasi/0.2.x/node/24.x.x/${path}`, import.meta.url));
// The installed package predates these APIs; use local builds for the shared
// stream dependencies as well as the new test modules.
const overrides = {
    testModule: std("test/index.js"),
    testReportersModule: std("test/reporters.js"),
    assertModule: std("assert/index.js"),
    streamModule: std("stream/index.js"),
    streamPromisesModule: std("stream/promises.js"),
    streamSchedulerModule: std("stream/scheduler.js"),
    streamEmitterModule: std("stream/emitter.js"),
    stringDecoderModule: std("string-decoder.js"),
    eventsModule: std("events.js"),
};

test("test adapters resolve lazily without WIT capabilities and leave bare imports alone", () => {
    const onWitRequirement = vi.fn();
    const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { ...overrides, onWitRequirement });
    for (const name of ["node:test", "node:test/reporters"]) {
        expect(plugin.resolveId(name)).toBe(`\0jco-node-builtin:${name}`);
    }
    for (const name of ["test", "test/reporters", "node:test/unknown"]) {
        expect(plugin.resolveId(name)).toBeNull();
    }
    expect(onWitRequirement).not.toHaveBeenCalled();
});

test.each(["starlingmonkey", "quickjs"])(
    "runs ordinary node:test imports in %s",
    async (backend) => {
        const outputDir = await getTmpDir();
        const entry = join(outputDir, "source.js");
        const componentPath = join(outputDir, "component.wasm");
        const source = await bundleComponentSource(join(fixtureDir, "source.js"), {
            plugins: [nodeBuiltinPlugin({ imports: [], exports: [] }, overrides)],
        });
        await writeFile(entry, source);
        await exec(
            jcoPath,
            "componentize",
            entry,
            "--backend",
            backend,
            "-w",
            join(fixtureDir, "source.wit"),
            "-n",
            "test",
            "-o",
            componentPath,
            { closeStdin: true },
        );
        const { modulePath } = await transpileComponent({ componentPath, name: "node-test" });
        const component = await import(modulePath);
        const result = JSON.parse(component.run());
        if (backend === "quickjs") {
            expect(result).toEqual({
                identity: true,
                lifecycle: [],
                passed: [],
                errors: [],
                runner: "ERR_JCO_UNSUPPORTED_NODE_API",
                property: 2,
                restored: 1,
                reporters: true,
            });
            return;
        }
        expect(result).toEqual({
            identity: true,
            suiteName: "suite",
            sentinel: true,
            lifecycle: [
                "before",
                "beforeEach:sync",
                "afterEach:sync",
                "beforeEach:async",
                "beforeEach:nested",
                "afterEach:nested",
                "afterEach:async",
                "beforeEach:callback",
                "afterEach:callback",
                "beforeEach:failure",
                "afterEach:failure",
                "after",
            ],
            passed: [
                ["sync", true],
                ["nested", true],
                ["async", true],
                ["callback", true],
                ["failure", true],
            ],
            errors: Array(4).fill("ERR_JCO_UNSUPPORTED_NODE_API"),
            mockArgs: [2, 3],
            property: 2,
            restored: 1,
            reporters: true,
        });
    },
    600_000,
);
