import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import { bundleComponentSource } from "../../src/bundle.js";
import { nodeBuiltinPlugin, nodeGlobals, type NodeBuiltinOptions } from "../../src/node-builtins/index.js";
import { exec, getTmpDir, jcoPath, setupAsyncTest } from "../helpers.js";
import {
    run as nativeReport,
    runWeb as nativeWebReport,
} from "../fixtures/componentize/node-stream-classic/component.js";

const fixture = fileURLToPath(new URL("../fixtures/componentize/node-stream-classic/", import.meta.url));
const localModule = (name: string): string =>
    fileURLToPath(new URL(`../../../jco-std/dist/wasi/0.2.x/node/24.x.x/${name}.js`, import.meta.url));
const options: NodeBuiltinOptions = {
    streamConsumersModule: localModule("stream/consumers"),
    streamModule: localModule("stream/index"),
    streamPromisesModule: localModule("stream/promises"),
    streamEmitterModule: localModule("stream/emitter"),
    streamSchedulerModule: localModule("stream/scheduler"),
};

describe("node:stream component support", () => {
    test.concurrent("keeps portable-core aliases while allowing normal bare builtin resolution", async () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { ...options, onWitRequirement });
        // The plugin returns concrete hooks; this test exercises those hooks directly.
        const resolve = (plugin.resolveId as (id: string, importer?: string) => unknown).bind({
            resolve: async () => ({ id: "/installed/package.js" }),
        });
        const importer = "/node_modules/readable-stream/lib/internal/streams/readable.js";
        expect(resolve("buffer", importer)).toBe("\0jco-node-builtin:node:buffer");
        expect(resolve("events", importer)).toBe("\0jco-node-builtin:stream-events");
        expect(resolve("string_decoder", importer)).toBe("\0jco-node-builtin:node:string_decoder");
        expect(resolve("process/", importer)).toBe(options.streamSchedulerModule);
        for (const id of ["stream", "events", "buffer", "process/", "string_decoder"]) {
            expect(await resolve(id, "/app.ts")).toBeNull();
        }
        expect(onWitRequirement).not.toHaveBeenCalled();
    });

    test.concurrent.each(["quickjs", "starlingmonkey"])(
        "matches Node in a %s guest without host capabilities",
        async (backend: string) => {
            const directory = await getTmpDir();
            const onWitRequirement = vi.fn();
            const source = await bundleComponentSource(join(fixture, "component.ts"), {
                inject: nodeGlobals(),
                plugins: [nodeBuiltinPlugin({ imports: [], exports: [] }, { ...options, onWitRequirement })],
            });
            expect(onWitRequirement).not.toHaveBeenCalled();
            expect(source).not.toContain("__require(");
            expect(source).not.toMatch(/(?:from|import)\s*["'](?:node:|wasi:|process\/)/);
            await writeFile(join(directory, "component.js"), source);
            await writeFile(
                join(directory, "world.wit"),
                await readFile(join(fixture, backend === "quickjs" ? "world-async.wit" : "world.wit")),
            );
            const path = join(directory, "component.wasm");
            await exec(
                jcoPath,
                "componentize",
                join(directory, "component.js"),
                "-w",
                join(directory, "world.wit"),
                "-o",
                path,
                "--backend",
                backend,
                { closeStdin: true },
            );
            const { instance, cleanup } = await setupAsyncTest({ component: { name: `stream-${backend}`, path } });
            try {
                expect(JSON.parse(await instance.run())).toEqual(JSON.parse(await nativeReport()));
                // QuickJS currently lacks the Web Stream, text-codec and Abort globals.
                // Exercise the same classic suite on both engines, and Web interop where available.
                if (backend === "starlingmonkey") {
                    expect(JSON.parse(await instance.runWeb())).toEqual(JSON.parse(await nativeWebReport()));
                }
            } finally {
                await cleanup();
            }
        },
        600_000,
    );
});
