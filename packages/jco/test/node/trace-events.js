import { readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";

import { withDefaultNodeCapabilities } from "../../src/cmd/transpile.js";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { TRACE_EVENTS_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { componentizeFixture, exec, getTmpDir, transpileComponent } from "../helpers.js";

const NODE_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/trace-events/host/node");

const runner = fileURLToPath(new URL("../fixtures/componentize/node-trace-events/run.js", import.meta.url));

test("resolves only node:trace_events and requests only its host capability", () => {
    const onWitRequirement = vi.fn();
    const plugin = nodeBuiltinPlugin(
        { imports: [], exports: [] },
        { traceEventsModule: "/test/trace-events.js", onWitRequirement },
    );

    expect(plugin.resolveId("trace_events")).toBeNull();
    expect(plugin.resolveId("node:trace_events/unknown")).toBeNull();
    expect(onWitRequirement).not.toHaveBeenCalled();

    const id = plugin.resolveId("node:trace_events");

    expect(id).toBe("\0jco-node-builtin:node:trace_events");
    expect(plugin.load(id)).toContain('from "/test/trace-events.js"');
    expect(onWitRequirement).toHaveBeenCalledExactlyOnceWith(TRACE_EVENTS_WIT_REQUIREMENT);
});

test("injects the tracing WIT dependency once and defaults to denial", async () => {
    const root = await getTmpDir();

    await writeFile(join(root, "component.wit"), "package test:tracing; world component {}\n");

    const injected = await injectNodeWitImports(root, undefined, [TRACE_EVENTS_WIT_REQUIREMENT]);

    expect(injected.imports).toEqual(["jco:node/trace-events@0.1.0"]);
    expect(injected.exports).toEqual([]);
    expect(await readFile(join(root, "deps/jco-node-0.1.0/trace-events.wit"), "utf8")).toEqual(
        await readFile(new URL("../../../jco-std/wit/node-0.1.0/trace-events.wit", import.meta.url), "utf8"),
    );
    expect(await injectNodeWitImports(root, undefined, [TRACE_EVENTS_WIT_REQUIREMENT])).toBeUndefined();
    expect(withDefaultNodeCapabilities({}).map["jco:node/trace-events@0.1.0"]).toMatch(/trace-events\/host$/);
    expect(
        withDefaultNodeCapabilities({ map: { "jco:node/trace-events@0.1.0": NODE_HOST } }).map[
            "jco:node/trace-events@0.1.0"
        ],
    ).toBe(NODE_HOST);
});

for (const backend of ["starlingmonkey", "quickjs"]) {
    test(`${backend}: ordinary imports, catchable denial, shared categories and real trace output`, async () => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "node-trace-events",
            entry: "source.js",
            wit: "source.wit",
            world: "test",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", backend],
        });

        expect(stderr).toContain("Jco added generated WIT import jco:node/trace-events@0.1.0");

        for (const mode of ["denied", "granted"]) {
            const { modulePath, transpiledDir } = await transpileComponent({
                componentPath,
                name: `trace-events-${mode}`,
                extraArgs: mode === "denied" ? [] : ["--map", `jco:node/trace-events@0.1.0=${NODE_HOST}`],
            });

            await symlink(
                fileURLToPath(new URL("../../node_modules", import.meta.url)),
                join(transpiledDir, "node_modules"),
                "dir",
            );

            const result = await exec(runner, modulePath, transpiledDir, mode, { closeStdin: true });

            expect(result.stdout.trim()).toBe("Trace events component OK");

            if (mode === "granted") {
                // Read after child exit, when Node has flushed the trace writer.
                const trace = JSON.parse(await readFile(join(transpiledDir, "node_trace.1.log"), "utf8"));

                expect(trace.traceEvents.some((event) => event.cat.includes("node.fs.sync"))).toBe(true);
            }
        }
    }, 600_000);
}
