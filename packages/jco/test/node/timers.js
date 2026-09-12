import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { bundleComponentSource } from "../../src/bundle.js";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { COMPONENT_JS_FIXTURES_DIR } from "../common.js";
import { exec, getTmpDir, jcoPath, transpileComponent } from "../helpers.js";

const fixtureDir = join(COMPONENT_JS_FIXTURES_DIR, "node-timers");
// The installed jco-std predates timers, so the fixture is bundled here with the source plugin
// pointed at the local build rather than with the CLI's `--bundle`.
const timersModule = fileURLToPath(new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/timers.js", import.meta.url));

const timersPromisesModule = fileURLToPath(
    new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/timers-promises.js", import.meta.url),
);

test("resolves timers without unrelated capabilities and preserves installed bare packages", async () => {
    const onWitRequirement = vi.fn();
    const plugin = nodeBuiltinPlugin(
        { imports: [], exports: [] },
        { timersModule, timersPromisesModule, onWitRequirement },
    );
    expect(plugin.resolveId("node:timers")).toBe("\0jco-node-builtin:node:timers");
    expect(await plugin.resolveId.call({ resolve: async () => null }, "timers")).toBe("\0jco-node-builtin:node:timers");
    expect(await plugin.resolveId.call({ resolve: async () => ({ id: "/installed/timers.js" }) }, "timers")).toBeNull();
    expect(plugin.resolveId("timers/promises")).toBeNull();
    expect(plugin.resolveId("node:timers/promises")).toBe("\0jco-node-builtin:node:timers/promises");
    expect(plugin.load(plugin.resolveId("node:timers"))).toContain(timersModule);
    expect(plugin.load(plugin.resolveId("node:timers/promises"))).toContain(timersPromisesModule);
    expect(plugin.resolveId("node:timers/unknown")).toBeNull();
    expect(onWitRequirement).not.toHaveBeenCalled();
});

test.each(["starlingmonkey", "quickjs"])(
    "runs ordinary node:timers imports in %s",
    async (backend) => {
        const outputDir = await getTmpDir();
        const entry = join(outputDir, "source.js");
        const componentPath = join(outputDir, "component.wasm");
        const source = await bundleComponentSource(join(fixtureDir, "source.js"), {
            plugins: [nodeBuiltinPlugin({ imports: [], exports: [] }, { timersModule, timersPromisesModule })],
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
        );
        const { modulePath } = await transpileComponent({ componentPath, name: "timers" });
        const component = await import(modulePath);
        expect(JSON.parse(component.run())).toEqual({
            module: true,
            validation: true,
            scheduling: backend === "quickjs" ? "unavailable" : true,
        });
    },
    600_000,
);
