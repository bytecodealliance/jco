import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { rolldown } from "rolldown";
import { rollup } from "rollup";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import jcoPlugin from "../src/index.js";

type Builder = "rolldown" | "rollup";

const componentPath = resolve(import.meta.dirname, "../../../examples/transpile/adder/adder.wasm");
const importedComponentPath = resolve(
    import.meta.dirname,
    "../../jco-transpile/test/fixtures/components/runtime/example_guest_import.wasm",
);
let tempDir: string;

beforeAll(async () => {
    const tempRoot = resolve(import.meta.dirname, "../.tmp");
    await mkdir(tempRoot, { recursive: true });
    tempDir = await mkdtemp(resolve(tempRoot, "integration-"));
});

afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
});

for (const builder of ["rolldown", "rollup"] as const) {
    describe(builder, () => {
        test("supports lifecycle, named, namespace, and dynamic component imports", async () => {
            const input = resolve(tempDir, `${builder}-imports/entry.mjs`);
            await writeSource(
                input,
                `
          import instantiate, { add } from ${JSON.stringify(relativeImport(input, componentPath))};
          import { add as markedAdd } from ${JSON.stringify(`${relativeImport(input, componentPath)}?component`)};
          export const defaultResult = instantiate().add.add(2, 3);
          export const namedResult = add.add(4, 5);
          export const sameExport = add === markedAdd;
          export async function dynamicResult() {
            const loaded = await import(${JSON.stringify(relativeImport(input, componentPath))});
            return [loaded.default().add === loaded.add, loaded.add.add(6, 7)];
          }
        `,
            );

            const outputDir = resolve(tempDir, `${builder}-imports/out`);
            const output = await build(builder, input, outputDir);
            expect(output.assets).toHaveLength(1);

            const module = await import(`${pathToFileURL(resolve(outputDir, "index.mjs")).href}?test=imports`);
            expect(module.defaultResult).toBe(5);
            expect(module.namedResult).toBe(9);
            expect(module.sameExport).toBe(true);
            await expect(module.dynamicResult()).resolves.toEqual([true, 13]);
        });

        test("supports supplying component imports through custom instantiation", async () => {
            const input = resolve(tempDir, `${builder}-instantiation/entry.mjs`);
            await writeSource(
                input,
                `
          import instantiate, { front } from ${JSON.stringify(relativeImport(input, importedComponentPath))};
          export { instantiate as default, front };
        `,
            );

            const outputDir = resolve(tempDir, `${builder}-instantiation/out`);
            const output = await build(builder, input, outputDir, "async");
            expect(output.assets.length).toBeGreaterThan(0);

            const module = await import(`${pathToFileURL(resolve(outputDir, "index.mjs")).href}?test=instantiation`);
            expect(module.front).toBeUndefined();

            let nextScalar = 0;
            let fetchCalls = 0;
            class Scalars {
                value = nextScalar++;
                getB() {
                    return this.value;
                }
            }
            const instance = await module.default(async (url: URL) => WebAssembly.compile(await readFile(url)), {
                "example2:component/backend": {
                    Scalars,
                    fetch() {
                        fetchCalls++;
                        return new Scalars();
                    },
                },
            });

            expect(module.front).toBe(instance.front);
            expect(module.front.handle(new Scalars())).toBeTypeOf("number");
            expect(fetchCalls).toBe(1);
            expect(() => module.default()).toThrow(/already been instantiated/);
        });

        test("deduplicates one component imported by ten source modules", async () => {
            const one = await createImporterGraph(builder, 1);
            const ten = await createImporterGraph(builder, 10);

            const oneOutput = await build(builder, one.input, one.outputDir);
            const tenOutput = await build(builder, ten.input, ten.outputDir);

            expect(oneOutput.assets).toHaveLength(1);
            expect(tenOutput.assets).toHaveLength(1);
            expect(tenOutput.assets[0]!.source).toEqual(oneOutput.assets[0]!.source);

            const module = await import(`${pathToFileURL(resolve(ten.outputDir, "index.mjs")).href}?test=dedupe`);
            expect(module.results).toEqual(Array.from({ length: 10 }, (_, index) => index + index + 1));
        });
    });
}

async function createImporterGraph(builder: Builder, count: number) {
    const root = resolve(tempDir, `${builder}-${count}-importers`);
    const imports: string[] = [];
    for (let index = 0; index < count; index++) {
        const importer = resolve(root, `importer-${index}.mjs`);
        await writeSource(
            importer,
            `
        import { add } from ${JSON.stringify(relativeImport(importer, componentPath))};
        export const result = add.add(${index}, ${index + 1});
      `,
        );
        imports.push(`import { result as result${index} } from "./importer-${index}.mjs";`);
    }

    const input = resolve(root, "entry.mjs");
    await writeSource(
        input,
        `${imports.join("\n")}
     export const results = [${Array.from({ length: count }, (_, index) => `result${index}`).join(",")}];`,
    );
    return { input, outputDir: resolve(root, "out") };
}

async function build(builder: Builder, input: string, outputDir: string, instantiation?: "async" | "sync") {
    const options = {
        input,
        external: (id: string) => id.startsWith("node:"),
        plugins: [
            jcoPlugin({
                transpile: {
                    base64Cutoff: 0,
                    instantiation,
                },
            }),
        ],
    };
    const outputOptions = {
        dir: outputDir,
        format: "esm" as const,
        entryFileNames: "index.mjs",
        chunkFileNames: "chunks/[name]-[hash].mjs",
        assetFileNames: "assets/[name]-[hash][extname]",
    };

    const bundle =
        builder === "rolldown"
            ? await rolldown(options)
            : await rollup({
                  ...options,
                  onwarn(warning, warn) {
                      if (warning.code !== "UNRESOLVED_IMPORT" || !warning.exporter?.startsWith("node:")) {
                          warn(warning);
                      }
                  },
              });
    const result = await bundle.write(outputOptions);
    await bundle.close();
    return {
        assets: result.output.flatMap((item) =>
            item.type === "asset" && item.fileName.endsWith(".wasm")
                ? [
                      {
                          fileName: item.fileName,
                          source: Buffer.from(item.source),
                      },
                  ]
                : [],
        ),
    };
}

async function writeSource(path: string, source: string) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source);
}

function relativeImport(importer: string, target: string) {
    const path = relative(dirname(importer), target).split(sep).join("/");
    return path.startsWith(".") ? path : `./${path}`;
}
