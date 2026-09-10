import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { expect, test, vi } from "vitest";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { SQLITE_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { bundleComponentSource } from "../../src/bundle.js";
import { getTmpDir, transpileComponent } from "../helpers.js";
const sqliteModule = fileURLToPath(new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/sqlite.js", import.meta.url));
const fixture = new URL("../fixtures/componentize/node-sqlite/", import.meta.url);
const host = (name) =>
    new URL(
        `../../../jco-std/dist/wasi/0.2.x/node/24.x.x/sqlite-host${name === "node" ? "-node" : ""}.js`,
        import.meta.url,
    ).href;

test.concurrent("node:sqlite requests only its typed capability and leaves bare imports alone", async () => {
    const onWitRequirement = vi.fn();
    const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { sqliteModule, onWitRequirement });
    expect(plugin.resolveId("node:sqlite")).toBe("\0jco-node-builtin:node:sqlite");
    expect(plugin.resolveId("sqlite")).toBeNull();
    expect(onWitRequirement).toHaveBeenCalledWith(SQLITE_WIT_REQUIREMENT);
    const root = await getTmpDir();
    await writeFile(join(root, "world.wit"), "package test:sqlite; world test {}");
    expect((await injectNodeWitImports(root, undefined, [SQLITE_WIT_REQUIREMENT])).imports).toEqual([
        "jco:node/sqlite@0.1.0",
    ]);
    expect(await injectNodeWitImports(root, undefined, [SQLITE_WIT_REQUIREMENT])).toBeUndefined();
    expect(await readFile(join(root, "deps/jco-node-0.1.0/sqlite.wit"), "utf8")).toEqual(
        await readFile(new URL("../../../jco-std/wit/node-0.1.0/sqlite.wit", import.meta.url), "utf8"),
    );
});

test.concurrent.each(["starlingmonkey", "quickjs"])(
    "runs SQLite resources and denial in %s",
    async (backend) => {
        const root = await getTmpDir();
        const wit = join(root, "wit");
        await mkdir(wit);
        await writeFile(join(wit, "world.wit"), await readFile(new URL("source.wit", fixture)));
        const requirements = [];
        const source = await bundleComponentSource(fileURLToPath(new URL("source.js", fixture)), {
            external: ["jco:node/sqlite@0.1.0"],
            plugins: [
                nodeBuiltinPlugin(
                    { imports: [], exports: [] },
                    { sqliteModule, onWitRequirement: (requirement) => requirements.push(requirement) },
                ),
            ],
        });
        await injectNodeWitImports(wit, "test", requirements);
        const entry = join(root, "source.js");
        const componentPath = join(root, "component.wasm");
        await writeFile(entry, source);
        await new Promise((resolve, reject) => {
            const child = spawn(
                process.execPath,
                [
                    fileURLToPath(new URL("../../dist/jco.js", import.meta.url)),
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
            child.stdout.on("data", (c) => {
                output += c;
            });
            child.stderr.on("data", (c) => {
                output += c;
            });
            child.on("error", reject);
            child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(output))));
        });
        for (const provider of ["denied", "node"]) {
            const { modulePath } = await transpileComponent({
                componentPath,
                name: "sqlite",
                extraArgs: ["--map", `jco:node/sqlite@0.1.0=${host(provider)}`],
            });
            const component = await import(modulePath);
            const report = JSON.parse(await component.run());
            expect(report.identity).toBe(true);
            expect(report.exports).toEqual(["DatabaseSync", "Session", "StatementSync", "backup", "constants"]);
            expect(report.constant).toBe(2);
            if (provider === "denied") {
                expect(report.denied).toBe("ERR_JCO_SQLITE_ADAPTER_REQUIRED");
                continue;
            }
            expect(report).toMatchObject({
                open: true,
                session: true,
                statement: true,
                insert: { changes: 1, lastInsertRowid: 1 },
                nullPrototype: true,
                columns: ["id", "value", "blob"],
                iterated: [1],
                afterReturn: 2,
                arrayBigInt: "1",
                missing: true,
                transaction: true,
                changeset: true,
                copied: 2,
                patchset: true,
                tagState: [1, 2, true],
                cleared: 0,
                limit: true,
                restored: 2,
                callback: "ERR_JCO_SQLITE_CALLBACK_UNSUPPORTED",
                closed: true,
                closedStatement: "ERR_INVALID_STATE",
            });
            expect(report.rows).toEqual([
                { id: 1, value: "hello", blob: [0, 255] },
                { id: 2, value: "world", blob: null },
            ]);
            expect(report.sqlError).toEqual({
                name: "Error",
                code: "ERR_SQLITE_ERROR",
                errcode: 1555,
                errstr: "constraint failed",
            });
            // QuickJS currently lowers exported Promise values directly rather than awaiting them.
            // The synchronous resource suite runs on both engines; async backup runs on StarlingMonkey.
            if (backend === "quickjs") {
                continue;
            }
            const destination = join(root, "backup.db");
            const result = JSON.parse(await component.backupTest(destination));
            expect(result.pages).toBeGreaterThan(0);
            const db = new DatabaseSync(destination);
            try {
                expect(db.prepare("SELECT value FROM backup_data").get().value).toBe(42);
            } finally {
                db.close();
            }
        }
    },
    600_000,
);
