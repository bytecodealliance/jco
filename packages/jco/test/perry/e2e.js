import assert from "node:assert/strict";
import { cp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { test } from "vitest";
import { node } from "./helpers.js";
import { perryAvailable, withPerryProject } from "./e2e-helpers.js";

test.concurrent.skipIf(!perryAvailable).for(["cli path", "project package"])(
    "real Perry (%s): guest-types → componentize → transpile → filesystem on ordinary Node",
    { timeout: 300_000 },
    async (selection) => {
        await withPerryProject(selection, async ({ directory, build }) => {
            await build();
            // Create input only after compilation: the guest must access the host
            // filesystem at runtime, rather than embedding build-time file contents.
            await writeFile(join(directory, "data", "input.txt"), "filesystem E2E\n");
            const { stdout } = await node(directory, "scripts/demo.mjs");
            assert.match(stdout, /Perry read: filesystem E2E/);
            assert.match(stdout, /Perry size: 15/);

            await writeFile(join(directory, "data", "input.txt"), "updated input\n");
            const changed = await node(directory, "scripts/demo.mjs");
            assert.match(changed.stdout, /Perry read: updated input/);
            assert.match(changed.stdout, /Perry size: 14/);
        });
    },
);

test.concurrent.skipIf(!perryAvailable).for(["cli path", "project package"])(
    "real Perry (%s): filesystem mutations require explicit shim compatibility support",
    { timeout: 300_000 },
    async (selection) => {
        await withPerryProject(selection, async ({ directory, build }) => {
            await build(new URL("../fixtures/perry/filesystem-mutations.ts", import.meta.url));
            await cp(
                new URL("../fixtures/perry/run-mutations.mjs", import.meta.url),
                join(directory, "scripts", "run-mutations.mjs"),
            );
            const data = join(directory, "data");
            const input = "filesystem π\n";
            const original = "existing content that must be truncated";
            await writeFile(join(data, "input.txt"), input);
            await writeFile(join(data, "existing.txt"), original);
            await writeFile(join(data, "remove-me.txt"), "remove me");

            // The same compiled guest must fail under legacy defaults before its
            // first mutation has any host side effects. Fresh Node children isolate
            // the shim configuration and component runtime for each invocation.
            await assert.rejects(node(directory, "scripts/run-mutations.mjs"), {
                code: 1,
                // Perry wraps WASI unsupported as EIO with Rust's diagnostic.
                stderr: /Not supported.*open '\/data\/existing\.txt'/,
            });
            assert.equal(await readFile(join(data, "existing.txt"), "utf8"), original);
            assert.equal(await readFile(join(data, "input.txt"), "utf8"), input);
            assert.equal(await readFile(join(data, "remove-me.txt"), "utf8"), "remove me");
            assert.deepEqual((await readdir(data)).sort(), ["existing.txt", "input.txt", "remove-me.txt"]);

            const { stdout } = await node(directory, "scripts/run-mutations.mjs", "--enable-mutate-directory");
            const contents = input + "appended\n";
            assert.ok(stdout.includes(`Perry contents: ${contents}`));
            assert.match(stdout, new RegExp(`Perry size: ${Buffer.byteLength(contents)}\\b`));
            assert.match(stdout, /Perry entries: renamed\.txt/);
            assert.match(stdout, /Perry mutations complete/);

            // Check actual host effects, including overwrite/truncation and both
            // sides of rename/delete, rather than trusting guest log messages.
            assert.equal(await readFile(join(data, "input.txt"), "utf8"), input);
            assert.equal(await readFile(join(data, "existing.txt"), "utf8"), "new");
            assert.equal(await readFile(join(data, "work", "renamed.txt"), "utf8"), contents);
            assert.equal((await stat(join(data, "work", "renamed.txt"))).size, Buffer.byteLength(contents));
            assert.deepEqual((await readdir(data)).sort(), ["existing.txt", "input.txt", "work"]);
            assert.deepEqual(await readdir(join(data, "work")), ["renamed.txt"]);
        });
    },
);
