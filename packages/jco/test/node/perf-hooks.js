import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { bundleComponentSource } from "../../src/bundle.js";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { COMPONENT_JS_FIXTURES_DIR } from "../common.js";
import { exec, getTmpDir, jcoPath, transpileComponent } from "../helpers.js";

const fixtureDir = join(COMPONENT_JS_FIXTURES_DIR, "node-perf-hooks");
// The installed jco-std predates perf_hooks, so the fixture is bundled here with the source plugin
// pointed at the local build rather than with the CLI's `--bundle`.
const perfHooksModule = fileURLToPath(
    new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/perf-hooks.js", import.meta.url),
);

test("resolves perf_hooks without unrelated capabilities and leaves bare imports alone", () => {
    const onWitRequirement = vi.fn();
    const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { perfHooksModule, onWitRequirement });
    expect(plugin.resolveId("node:perf_hooks")).toBe("\0jco-node-builtin:node:perf_hooks");
    expect(plugin.resolveId("perf_hooks")).toBeNull();
    expect(plugin.resolveId("node:perf_hooks/unknown")).toBeNull();
    expect(onWitRequirement).not.toHaveBeenCalled();
});

test.each(["starlingmonkey", "quickjs"])(
    "runs ordinary node:perf_hooks imports in %s",
    async (backend) => {
        const outputDir = await getTmpDir();
        const entry = join(outputDir, "source.js");
        const componentPath = join(outputDir, "component.wasm");
        const source = await bundleComponentSource(join(fixtureDir, "source.js"), {
            plugins: [nodeBuiltinPlugin({ imports: [], exports: [] }, { perfHooksModule })],
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
        const { modulePath } = await transpileComponent({ componentPath, name: "perf-hooks" });
        const component = await import(modulePath);
        expect(JSON.parse(component.run())).toEqual({
            observation: backend === "quickjs" ? "ERR_JCO_UNSUPPORTED_NODE_API" : true,
            identity: true,
            markClass: true,
            zeroStart: 0,
            duration: 7,
            resourceSize: 320,
            missingMark: "SyntaxError",
            histogram: "ERR_JCO_UNSUPPORTED_NODE_API",
            clock: true,
            timed: 5,
            records: backend === "quickjs" ? [] : ["mark", "mark", "measure", "resource", "function"],
            remainingMarks: ["end"],
        });
    },
    600_000,
);
