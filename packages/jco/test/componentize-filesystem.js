import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assert, test } from "vitest";

import { executeNodeScript } from "../../../test/helpers/node.mjs";

test.each(["old", "new"])("componentizes WASI HTTP %s without ambient filesystem access", async (version) => {
    const directory = await mkdtemp(join(tmpdir(), "jco-componentize-filesystem-"));
    const preload = join(directory, "empty-filesystem.mjs");
    const output = join(directory, "component.wasm");
    const fixture = new URL(`./fixtures/componentize/wasi-http-detection-${version}/`, import.meta.url);

    try {
        // Start the CLI with no filesystem access even when testing against an older shim.
        await writeFile(
            preload,
            `import { _setPreopens } from ${JSON.stringify(import.meta.resolve("@bytecodealliance/preview2-shim/filesystem"))};
             _setPreopens({});`,
        );
        const { stderr } = await executeNodeScript(
            "--import",
            pathToFileURL(preload).href,
            fileURLToPath(new URL("../dist/jco.js", import.meta.url)),
            "componentize",
            fileURLToPath(new URL("component.js", fixture)),
            "--wit",
            fileURLToPath(new URL("wit", fixture)),
            "--out",
            output,
            { closeStdin: true },
        );

        if (version === "old") {
            assert.match(stderr, /Falling back to componentize-js 0\.19\.3/);
        } else {
            assert.strictEqual(stderr, "");
        }
        const component = await readFile(output);
        assert.deepEqual([...component.subarray(0, 8)], [0, 97, 115, 109, 13, 0, 1, 0]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
