import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { nodeBuiltinPlugin } from "../../src/node-builtins.js";
import { bundleComponentSource } from "../../src/bundle.js";
import { spawn } from "node:child_process";
import { getTmpDir, transpileComponent } from "../helpers.js";

const perfHooksModule = fileURLToPath(
    new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/perf-hooks.js", import.meta.url),
);
const fixture = fileURLToPath(new URL("../fixtures/componentize/node-perf-hooks/source.js", import.meta.url));
const wit = fileURLToPath(new URL("../fixtures/componentize/node-perf-hooks/source.wit", import.meta.url));
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
        const root = await getTmpDir();
        const source = await bundleComponentSource(fixture, {
            plugins: [nodeBuiltinPlugin({ imports: [], exports: [] }, { perfHooksModule })],
        });
        const entry = join(root, "source.js");
        const componentPath = join(root, "component.wasm");
        await writeFile(entry, source);
        await new Promise((resolve, reject) => {
            const cli = fileURLToPath(new URL("../../dist/jco.js", import.meta.url));
            const child = spawn(
                process.execPath,
                [
                    cli,
                    "componentize",
                    entry,
                    "--wit",
                    wit,
                    "--world-name",
                    "test",
                    "--out",
                    componentPath,
                    "--backend",
                    backend,
                ],
                { stdio: ["ignore", "pipe", "pipe"] },
            );
            let output = "";
            child.stdout.on("data", (chunk) => {
                output += chunk;
            });
            child.stderr.on("data", (chunk) => {
                output += chunk;
            });
            child.on("error", reject);
            child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(output))));
        });
        const { modulePath } = await transpileComponent({ componentPath, name: "perf-hooks" });
        const component = await import(modulePath);
        const report = JSON.parse(component.run());
        expect(report).toEqual({
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
