import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { rolldown } from "rolldown";
import { rollup } from "rollup";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { startTestServer } from "../../preview2-shim/test/common.js";
import jcoPlugin from "../src/index.js";

type Builder = "rolldown" | "rollup";

const componentPath = resolve(import.meta.dirname, "../../../examples/transpile/adder/adder.wasm");
const importedComponentPath = resolve(
    import.meta.dirname,
    "../../jco-transpile/test/fixtures/components/runtime/example_guest_import.wasm",
);
const pollableComponentPath = resolve(
    import.meta.dirname,
    "../../jco/test/fixtures/components/stdout-pollable-hang.component.wasm",
);
const preview2ShimDir = resolve(import.meta.dirname, "../../preview2-shim");
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
        test("emits and deduplicates self-contained worker assets", async () => {
            const root = resolve(tempDir, `${builder}-workers`);
            const input = resolve(root, "entry.mjs");
            await writeSource(
                input,
                `
          import { Worker } from "node:worker_threads";
          const first = new Worker(new URL("./fixture-worker.bundle.js", import.meta.url));
          const second = new Worker(new URL("./fixture-worker.bundle.js", import.meta.url));
          first.unref();
          second.unref();
        `,
            );
            await writeSource(
                resolve(root, "fixture-worker.bundle.js"),
                `import { parentPort } from "node:worker_threads"; parentPort?.postMessage("ready");`,
            );

            const outputDir = resolve(root, "out");
            const options = {
                input,
                external: (id: string) => id.startsWith("node:"),
                plugins: [jcoPlugin()],
            };
            const bundle = builder === "rolldown" ? await rolldown(options) : await rollup(options);
            const result = await bundle.write({
                dir: outputDir,
                format: "esm",
                entryFileNames: "chunks/index.mjs",
                assetFileNames: "assets/[name]-[hash][extname]",
            });
            await bundle.close();

            const workers = result.output.filter(
                (item) => item.type === "asset" && item.fileName.includes("fixture-worker.bundle"),
            );
            expect(workers).toHaveLength(1);
            const entry = await readFile(resolve(outputDir, "chunks/index.mjs"), "utf8");
            expect(entry).not.toContain("./fixture-worker.bundle.js");
            expect(entry).toContain("../assets/fixture-worker.bundle-");
            await import(`${pathToFileURL(resolve(outputDir, "chunks/index.mjs")).href}?test=worker`);
        });

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

test("a worker-backed Preview 2 component runs from isolated Rolldown output", async () => {
    const root = resolve(tempDir, "preview2-worker-component");
    const input = resolve(root, "entry.mjs");
    await writeSource(
        input,
        `
      import { run } from ${JSON.stringify(relativeImport(input, pollableComponentPath))};
      run.run();
      export const result = "worker-backed-run-completed";
    `,
    );

    const outputDir = resolve(root, "out");
    await build("rolldown", input, outputDir);
    const isolatedDir = resolve(root, "isolated");
    await cp(outputDir, isolatedDir, { recursive: true });

    const outputFiles = await readdir(resolve(isolatedDir, "assets"));
    const entry = await readFile(resolve(isolatedDir, "index.mjs"), "utf8");
    expect(
        outputFiles.filter((file) => file.includes("worker-thread.bundle")),
        entry,
    ).toHaveLength(1);
    expect(entry).not.toMatch(/worker-thread\.js|node_modules|\/home\/agent/);

    const module = await import(`${pathToFileURL(resolve(isolatedDir, "index.mjs")).href}?test=preview2-worker`);
    expect(module.result).toBe("worker-backed-run-completed");
});

test("a downstream Preview 2 component bundles and runs in the browser", async () => {
    const root = resolve(tempDir, "preview2-browser-component");
    const input = resolve(root, "entry.mjs");
    await writeSource(
        input,
        `
      import { run } from ${JSON.stringify(relativeImport(input, pollableComponentPath))};
      run.run();
      document.body.dataset.result = "browser-run-completed";
    `,
    );

    const outputDir = resolve(root, "out");
    const bundle = await rolldown({
        input,
        platform: "browser",
        plugins: [
            workspacePreview2Shim("browser"),
            jcoPlugin({ transpile: { base64Cutoff: Number.MAX_SAFE_INTEGER } }),
        ],
    });
    await bundle.write({
        dir: outputDir,
        format: "esm",
        entryFileNames: "chunks/index.mjs",
        assetFileNames: "assets/[name]-[hash][extname]",
    });
    await bundle.close();

    const outputFiles = await readdir(outputDir, { recursive: true });
    expect(outputFiles.some((file) => file.includes("worker-thread"))).toBe(false);
    const entry = await readFile(resolve(outputDir, "chunks/index.mjs"), "utf8");
    expect(entry).not.toMatch(/node:|worker-thread|node_modules|\/home\/agent/);

    const htmlDir = resolve(root, "html");
    await writeSource(
        resolve(htmlDir, "index.html"),
        '<!doctype html><body><script type="module" src="/transpiled/chunks/index.mjs"></script></body>',
    );
    const { baseURL, browser, cleanup } = await startTestServer({
        transpiledOutputDir: outputDir,
        htmlDir,
    });
    try {
        const page = await browser.newPage();
        await page.goto(baseURL);
        await page.waitForFunction(() => document.body.dataset.result === "browser-run-completed");
        expect(await page.evaluate(() => document.body.dataset.result)).toBe("browser-run-completed");
        await page.close();
    } finally {
        await browser.close();
        await cleanup();
    }
});

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
            workspacePreview2Shim("nodejs"),
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
            ? await rolldown({ ...options, platform: "node" })
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

function workspacePreview2Shim(target: "browser" | "nodejs") {
    return {
        name: `workspace-preview2-shim-${target}`,
        resolveId(source: string) {
            const prefix = "@bytecodealliance/preview2-shim";
            if (source !== prefix && !source.startsWith(`${prefix}/`)) {
                return null;
            }
            const subpath = source === prefix ? "index" : source.slice(prefix.length + 1);
            return resolve(preview2ShimDir, "dist", target, `${subpath}.js`);
        },
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
