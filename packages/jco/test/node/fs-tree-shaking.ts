import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { bundleComponentSource } from "../../src/bundle.js";
import { nodeBuiltinPlugin, nodeGlobals } from "../../src/node-builtins/index.js";
import {
    retainedNodeWitRequirements,
    FS_WIT_REQUIREMENT,
    HTTP_WIT_REQUIREMENT,
    CONSOLE_WIT_REQUIREMENT,
    type NodeWitRequirement,
} from "../../src/node-wit.js";

const std = fileURLToPath(new URL("../../../jco-std/src/wasi/0.2.x/node/24.x.x/", import.meta.url));

async function bundle(source: string, extension = "ts") {
    const dir = await mkdtemp(join(tmpdir(), "jco-fs-shaking-"));
    const requirements: NodeWitRequirement[] = [];
    let modules: string[] = [];
    try {
        const entry = join(dir, `entry.${extension}`);
        await writeFile(entry, source);
        const code = await bundleComponentSource(entry, {
            typescript: extension === "ts",
            inject: nodeGlobals({ webGlobals: true }),
            config: { tsconfig: false, transform: { target: "es2022" } },
            plugins: [
                {
                    name: "workspace-std",
                    resolveId(id) {
                        // Exercise this checkout, even when Jco's dependencies use a released SDK.
                        if (id.startsWith("jco:web-globals/")) {
                            return join(std, `web-globals/${id.split("/").at(-1)}.ts`);
                        }
                        const marker = "/dist/wasi/0.2.x/node/24.x.x/";
                        if (id.includes("/jco-std/") && id.includes(marker)) {
                            return join(std, id.split(marker)[1].replace(/\.js$/, ".ts"));
                        }
                    },
                    generateBundle(_options, output) {
                        modules = Object.values(output).flatMap((item) =>
                            item.type === "chunk"
                                ? Object.entries(item.modules)
                                      .filter(([, value]) => value.renderedLength > 0)
                                      .map(([id]) => id.replaceAll("\\", "/"))
                                : [],
                        );
                    },
                },
                nodeBuiltinPlugin(
                    { imports: [], exports: [] },
                    {
                        fsModule: join(std, "fs.ts"),
                        fsPromisesModule: join(std, "fs-promises.ts"),
                        onWitRequirement: (requirement) => requirements.push(requirement),
                    },
                ),
            ],
        });
        return { code, modules, requirements: retainedNodeWitRequirements(code, requirements) };
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

for (const extension of ["js", "ts"]) {
    for (const [name, expression] of [
        ["statSync", "statSync(path).size"],
        ["readFileSync", 'readFileSync(path,"utf8")'],
    ]) {
        test(`${extension}: ${name} removes unused filesystem and network implementations`, async () => {
            const result = await bundle(
                `import {${name}} from "node:fs"; export const run=path=>${expression};`,
                extension,
            );
            expect(Buffer.byteLength(result.code)).toBeLessThan(160_000);
            expect(result.modules.some((id) => id.includes(std.replaceAll("\\", "/")))).toBe(true);
            expect(
                result.modules.filter((id) =>
                    /\/(?:fs\/(?:optional\/)?(?:core|callbacks|callback-api|callback-operations|promises|promise-operations|file-handle|streams|stream-api)|fs-promises|stream\/|http\/|web-globals\/fetch)/.test(
                        id,
                    ),
                ),
            ).toEqual([]);
            expect(new Set(result.requirements.map((r) => r.witImport))).toEqual(
                new Set([FS_WIT_REQUIREMENT.witImport, CONSOLE_WIT_REQUIREMENT.witImport]),
            );
        });
    }
}

test("promise and callback reads retain their own facades without streams or HTTP", async () => {
    for (const source of [
        'import {readFile} from "node:fs/promises"; export const run=path=>readFile(path,"utf8");',
        'import {readFile} from "node:fs"; export const run=(path,cb)=>readFile(path,"utf8",cb);',
    ]) {
        const result = await bundle(source);
        expect(Buffer.byteLength(result.code)).toBeLessThan(170_000);
        expect(
            result.modules.filter((id) =>
                /\/(?:fs\/(?:optional\/)?(?:file-handle|streams|stream-api)|stream\/|http\/)/.test(id),
            ),
        ).toEqual([]);
    }
});

test("default, dynamic namespace and stream consumers retain supported functionality", async () => {
    for (const source of [
        'import fs from "node:fs"; export const run=name=>fs[name];',
        'import * as fs from "node:fs"; export const run=name=>fs[name];',
        'import {createReadStream} from "node:fs"; export const run=path=>createReadStream(path);',
    ]) {
        const result = await bundle(source);
        expect(result.modules.some((id) => id.endsWith("/fs/streams.ts"))).toBe(true);
        expect(result.modules.some((id) => id.endsWith("/stream/index.ts"))).toBe(true);
        expect(result.requirements.some((r) => r.witImport === HTTP_WIT_REQUIREMENT.witImport)).toBe(false);
    }
});

test("WIT selection follows real imports, including re-exports and dynamic imports", () => {
    const requirements = [FS_WIT_REQUIREMENT, HTTP_WIT_REQUIREMENT, CONSOLE_WIT_REQUIREMENT];
    expect(
        retainedNodeWitRequirements(
            `import {stat} from "${FS_WIT_REQUIREMENT.witImport}"; // import "${HTTP_WIT_REQUIREMENT.witImport}"\nconst text='${CONSOLE_WIT_REQUIREMENT.witImport}';`,
            requirements,
        ),
    ).toEqual([FS_WIT_REQUIREMENT]);
    expect(retainedNodeWitRequirements(`export * from "${HTTP_WIT_REQUIREMENT.witImport}";`, requirements)).toEqual([
        HTTP_WIT_REQUIREMENT,
    ]);
    expect(retainedNodeWitRequirements(`export {stat} from "${FS_WIT_REQUIREMENT.witImport}";`, requirements)).toEqual([
        FS_WIT_REQUIREMENT,
    ]);
    expect(retainedNodeWitRequirements(`import("${HTTP_WIT_REQUIREMENT.witImport}");`, requirements)).toEqual([
        HTTP_WIT_REQUIREMENT,
    ]);
    expect(retainedNodeWitRequirements("import(name);", requirements)).toEqual(requirements);
});

test("Web stream and Blob fallbacks do not retain fetch or HTTP", async () => {
    for (const name of ["ReadableStream", "WritableStream", "TransformStream", "Blob", "File"]) {
        const result = await bundle(`export const value = ${name};`);
        expect(result.modules.filter((id) => /\/(?:http\/|web-globals\/fetch)/.test(id))).toEqual([]);
        expect(result.requirements.some((r) => r.witImport === HTTP_WIT_REQUIREMENT.witImport)).toBe(false);
    }
});
