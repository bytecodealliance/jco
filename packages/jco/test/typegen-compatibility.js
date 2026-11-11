import { mkdtemp, mkdir, writeFile, readFile, rm, cp, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript-compiler-api";
import { assert, test, beforeAll, afterAll } from "vitest";

import { executeNodeScript as exec } from "../../../test/helpers/node.mjs";

let types, transpile, componentEmbed, componentNew, parse, generateHostTypes, generate, generateTypes;
let installDir, jcoPath;

beforeAll(async () => {
    installDir = await mkdtemp(join(tmpdir(), "jco-unpublished-typegen-"));
    const jcoDir = fileURLToPath(new URL("../", import.meta.url));
    const transpileDir = fileURLToPath(new URL("../../jco-transpile/", import.meta.url));
    const installedJco = join(installDir, "jco");
    const installedTranspile = join(installDir, "jco-transpile");
    const linkType = process.platform === "win32" ? "junction" : "dir";

    // Jco normally consumes the published transpiler. Install the workspace sources
    // with the freshly built backend to test the next dependency upgrade in isolation.
    await mkdir(installedTranspile);
    for (const name of ["src", "package.json", "tsconfig.json"]) {
        await cp(join(transpileDir, name), join(installedTranspile, name), { recursive: true });
    }
    await cp(join(jcoDir, "obj"), join(installedTranspile, "vendor"), { recursive: true });
    await symlink(
        await realpath(join(transpileDir, "node_modules")),
        join(installedTranspile, "node_modules"),
        linkType,
    );
    await exec(join(jcoDir, "node_modules/typescript/bin/tsc"), "-p", installedTranspile);

    await mkdir(installedJco);
    for (const name of ["dist", "src", "lib", "package.json"]) {
        await cp(join(jcoDir, name), join(installedJco, name), { recursive: true });
    }
    const manifest = JSON.parse(await readFile(join(jcoDir, "package.json"), "utf8"));
    for (const name of Object.keys(manifest.dependencies)) {
        const source =
            name === "@bytecodealliance/jco-transpile"
                ? installedTranspile
                : await realpath(join(jcoDir, "node_modules", name));
        const destination = join(installedJco, "node_modules", name);
        await mkdir(dirname(destination), { recursive: true });
        await symlink(source, destination, linkType);
    }
    ({ types, transpile, componentEmbed, componentNew, parse } = await import(
        pathToFileURL(join(installedJco, "dist/api.js")).href
    ));
    ({ generate, generateTypes } = await import(pathToFileURL(join(installedJco, "dist/browser.js")).href));
    ({ generateHostTypes } = await import(pathToFileURL(join(installedTranspile, "dist/index.js")).href));
    jcoPath = join(installedJco, "dist/jco.js");
});

afterAll(async () => {
    if (installDir) {
        await rm(installDir, { recursive: true, force: true });
    }
});

const resources = `package compat:resources;
interface api {
    resource thing { constructor(); size: func() -> u32; }
    take: func(value: thing);
}
world exported { export api; }
world shared { import api; export api; }
world imported { import api; }`;
const asyncImports = `package compat:async-imports;
interface api {
    read: async func() -> string;
    resource reader { read: async func() -> string; }
}
world test { import api; }`;
const errors = `package compat:errors;
interface api { enum failure { denied } check: func() -> result<u32, failure>; }
world test { export api; }`;

/** Generate declarations and compile a consumer in an isolated ESM package. */
async function checkConsumer(wit, consumer, opts = {}, lowerLevel = false) {
    const dir = await mkdtemp(join(tmpdir(), "jco-typegen-compat-"));
    try {
        const witPath = join(dir, "input.wit");
        await writeFile(witPath, wit);
        const files = lowerLevel
            ? await generateHostTypes(witPath, { name: "component", ...opts })
            : await types(witPath, { name: "component", ...opts });
        await saveFiles(dir, files);
        await writeFile(join(dir, "package.json"), '{"type":"module"}');
        const consumerPath = join(dir, "consumer.mts");
        await writeFile(consumerPath, consumer);
        const program = ts.createProgram([consumerPath], {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.NodeNext,
            strict: true,
            noEmit: true,
            types: [],
        });
        const diagnostics = ts.getPreEmitDiagnostics(program);
        return {
            files,
            errors: diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
        };
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

/** Write generated files, including nested declaration directories. */
async function saveFiles(dir, files) {
    for (const [name, bytes] of Object.entries(files)) {
        await mkdir(dirname(join(dir, name)), { recursive: true });
        await writeFile(join(dir, name), bytes);
    }
}

for (const worldName of ["exported", "shared"]) {
    test(`Jco preserves legacy resource annotations and flat paths (${worldName})`, async () => {
        const { files, errors } = await checkConsumer(
            resources,
            `
            import { api } from './component.js';
            import type { Thing } from './interfaces/compat-resources-api.js';
            const value: Thing = new api.Thing();
            api.take(value);
            const mock = { size() { return 1; }, [Symbol.dispose]() {} };
            api.take(mock);
        `,
            { worldName },
        );
        assert.deepEqual(errors, []);
        assert.isFalse(Object.keys(files).some((name) => name.includes("/exports/")));
    });
}

test("nominal resource opt-in rejects structural mocks", async () => {
    const consumer = `import { api } from './component.js';
        api.take({ size() { return 1; }, [Symbol.dispose]() {} });`;
    for (const lowerLevel of [false, true]) {
        const { files, errors } = await checkConsumer(
            resources,
            consumer,
            { worldName: "exported", ...(lowerLevel ? {} : { nominalResources: true }) },
            lowerLevel,
        );
        assert.isTrue(
            errors.some((error) => error.includes("$brand")),
            errors.join("\n"),
        );
        assert.property(files, "interfaces/exports/compat-resources-api.d.ts");
    }
});

test("Jco guest imports retain structural resource types", async () => {
    const consumer = `/// <reference path="./component.d.ts" />
        import { take } from 'compat:resources/api';
        take({ size() { return 1; }, [Symbol.dispose]() {} });`;
    const defaults = await checkConsumer(resources, consumer, { worldName: "imported", guest: true });
    assert.deepEqual(defaults.errors, []);
    const optedIn = await checkConsumer(resources, consumer, {
        worldName: "imported",
        guest: true,
        nominalResources: true,
    });
    assert.isTrue(optedIn.errors.some((error) => error.includes("$brand")));
});

test("Jco preserves Promise-only async imports unless opted in", async () => {
    const consumer = `import * as api from './interfaces/compat-async-imports-api.js';
        api.read().then(value => value.toUpperCase());
        declare const reader: api.Reader;
        reader.read().then(value => value.toUpperCase());`;
    assert.deepEqual((await checkConsumer(asyncImports, consumer)).errors, []);
    const optedIn = await checkConsumer(asyncImports, consumer, { asyncImportsMayReturnSync: true });
    assert.isTrue(optedIn.errors.some((error) => error.includes("then")));
    const synchronousHost = `import type * as Api from './interfaces/compat-async-imports-api.js';
        const read: typeof Api.read = () => 'ready';`;
    assert.deepEqual(
        (await checkConsumer(asyncImports, synchronousHost, { asyncImportsMayReturnSync: true })).errors,
        [],
    );
});

test("Jco preserves exhaustive interface keys unless named errors are enabled", async () => {
    const consumer = `import { api } from './component.js';
        const keys: Record<keyof typeof api, boolean> = { check: true };`;
    assert.deepEqual((await checkConsumer(errors, consumer)).errors, []);
    const optedIn = await checkConsumer(errors, consumer, { typedErrorClasses: true });
    assert.isTrue(optedIn.errors.some((error) => error.includes("FailureError")));
});

test("Jco preserves generic Result narrowing unless optional payloads are enabled", async () => {
    const wit = `package compat:results;
        interface api { accept: func(values: list<result<u32, string>>); }
        world test { export api; }`;
    const consumer = `import type { Result } from './interfaces/compat-results-api.js';
        export function map<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
            return result.tag === 'ok' ? { tag: 'ok', val: fn(result.val) } : result;
        }`;
    assert.deepEqual((await checkConsumer(wit, consumer)).errors, []);
    assert.isNotEmpty((await checkConsumer(wit, consumer, { optionalResultPayloads: true })).errors);
});

test("Jco retains the first version's legacy path while distinguishing versions", async () => {
    const wit = `package compat:versions;
        package compat:versioned@1.0.0 { interface api { record value { id: u32 } } }
        package compat:versioned@2.0.0 { interface api { record value { label: string } } }
        world test { import compat:versioned/api@1.0.0; import compat:versioned/api@2.0.0; }`;
    const { errors, files } = await checkConsumer(
        wit,
        `
        import type { Value } from './interfaces/compat-versioned-api.js';
        import type { Value as NewValue } from './interfaces/compat-versioned-api-2-0-0.js';
        const old: Value = { id: 1 };
        const next: NewValue = { label: 'ready' };`,
    );
    assert.deepEqual(errors, []);
    assert.property(files, "interfaces/compat-versioned-api-1-0-0.d.ts");
});

test("Jco transpilation uses the same declaration defaults and opt-ins", async () => {
    const component = await componentNew(await componentEmbed({ witSource: errors, dummy: true }));
    const defaults = await transpile(component, { name: "component", instantiation: "sync" });
    assert.property(defaults.files, "interfaces/compat-errors-api.d.ts");
    assert.notProperty(defaults.files, "interfaces/exports/compat-errors-api.d.ts");
    assert.notInclude(new TextDecoder().decode(defaults.files["component.js"]), "class FailureError");
    const optedIn = await transpile(component, { name: "component", instantiation: "sync", typedErrorClasses: true });
    assert.property(optedIn.files, "interfaces/exports/compat-errors-api.d.ts");
    assert.include(new TextDecoder().decode(optedIn.files["component.js"]), "class FailureError");
});

for (const typedErrorClasses of [false, true]) {
    test(`Jco preserves wrapped runtime errors (named classes=${typedErrorClasses})`, async () => {
        const dir = await mkdtemp(join(tmpdir(), "jco-runtime-compat-"));
        try {
            // A canonical result<u32, failure> return area containing err(denied).
            const binary = await parse(`(module
                (memory (export "memory") 1)
                (data (i32.const 0) "\\01\\00\\00\\00\\00\\00\\00\\00")
                (func (export "compat:errors/api#check") (result i32) i32.const 0)
            )`);
            const bytes = await componentNew(await componentEmbed({ binary, witSource: errors }));
            const { files } = await transpile(bytes, { name: "component", instantiation: "async", typedErrorClasses });
            await saveFiles(dir, files);
            await writeFile(join(dir, "package.json"), '{"type":"module"}');
            const { instantiate } = await import(pathToFileURL(join(dir, "component.js")).href);
            const instance = await instantiate(
                async (name) => WebAssembly.compile(await readFile(join(dir, name))),
                {},
            );
            const failures = instance["compat:errors/api"];
            assert.equal("FailureError" in failures, typedErrorClasses);
            try {
                failures.check();
                assert.fail("expected a wrapped result error");
            } catch (error) {
                assert.instanceOf(error, Error);
                assert.isTrue(instance._util.isComponentError(error));
                assert.equal(error.payload, "denied");
                if (typedErrorClasses) {
                    assert.instanceOf(error, failures.FailureError);
                }
            } finally {
                instance._util.stop();
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
}

test("separate declarations can be enabled without nominal resources", async () => {
    const { files, errors } = await checkConsumer(
        resources,
        `
        import { api } from './component.js';
        api.take({ size() { return 1; }, [Symbol.dispose]() {} });
    `,
        { worldName: "shared", separateInterfaceTypes: true },
    );
    assert.deepEqual(errors, []);
    assert.property(files, "interfaces/exports/compat-resources-api.d.ts");
});

test("Jco component API applies compatibility defaults and opt-ins", async () => {
    const component = await componentNew(await componentEmbed({ witSource: errors, dummy: true }));
    for (const typedErrorClasses of [undefined, true]) {
        const generated = await generateTypes("component", {
            wit: { tag: "source", val: errors },
            typedErrorClasses,
        });
        const transpiled = await generate(component, { name: "component", typedErrorClasses });
        for (const files of [generated, transpiled.files]) {
            assert.equal(
                files.some(([name]) => name.includes("/exports/")),
                typedErrorClasses === true,
            );
            const declarations = files
                .filter(([name]) => name.endsWith(".d.ts"))
                .map(([, bytes]) => new TextDecoder().decode(bytes))
                .join("\n");
            assert.equal(declarations.includes("class FailureError"), typedErrorClasses === true);
        }
    }
});

for (const command of ["types", "guest-types", "transpile"]) {
    test(`Jco ${command} CLI exposes declaration opt-ins`, async () => {
        const dir = await mkdtemp(join(tmpdir(), "jco-cli-compat-"));
        try {
            const input = join(dir, command === "transpile" ? "input.wasm" : "input.wit");
            await writeFile(
                input,
                command === "transpile"
                    ? await componentNew(await componentEmbed({ witSource: errors, dummy: true }))
                    : errors,
            );
            for (const optIn of [false, true]) {
                const outDir = join(dir, String(optIn));
                await exec(
                    jcoPath,
                    command,
                    input,
                    "-o",
                    outDir,
                    "--name",
                    "component",
                    ...(optIn
                        ? [
                              "--nominal-resources",
                              "--async-imports-may-return-sync",
                              "--typed-error-classes",
                              "--separate-interface-types",
                              "--optional-result-payloads",
                          ]
                        : []),
                );
                const root = await readFile(join(outDir, "component.d.ts"), "utf8");
                assert.equal(root.includes("/exports/"), optIn);
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
}
