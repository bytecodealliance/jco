import { writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { bundleComponentSource } from "../../src/bundle.js";
import { nodeBuiltinPlugin, nodeGlobals } from "../../src/node-builtins/index.js";
import { exec, getTmpDir } from "../helpers.js";

test("bundled await and timer continuations isolate concurrent request contexts", async () => {
    const directory = await getTmpDir();
    try {
        const entry = join(directory, "entry.mjs");
        await writeFile(
            entry,
            `
import { AsyncLocalStorage } from 'node:async_hooks';
const context = new AsyncLocalStorage();
export async function exercise() {
    const seen = await Promise.all([1, 2, 3].map(id => context.run(id, async () => {
        await new Promise(resolve => setTimeout(resolve, 4 - id));
        const first = context.getStore();
        await Promise.resolve();
        await new Promise(resolve => queueMicrotask(resolve));
        return [first, context.getStore()];
    })));
    return { seen, cleared: context.getStore() === undefined };
}
`,
        );
        const source = await bundleComponentSource(entry, {
            inject: nodeGlobals(),
            plugins: [nodeBuiltinPlugin({ imports: [], exports: [] })],
        });
        const output = join(directory, "bundled.mjs");
        await writeFile(output, source);
        const runner = join(directory, "run.mjs");
        const report = join(directory, "report.json");
        await writeFile(
            runner,
            `import {writeFile} from 'node:fs/promises'; import {exercise} from ${JSON.stringify(pathToFileURL(output).href)}; await writeFile(${JSON.stringify(report)}, JSON.stringify(await exercise()));`,
        );
        await exec(runner, { closeStdin: true });
        expect(JSON.parse(await readFile(report, "utf8"))).toEqual({
            seen: [
                [1, 1],
                [2, 2],
                [3, 3],
            ],
            cleared: true,
        });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
