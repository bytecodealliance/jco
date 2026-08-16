import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, assert, expect, suite, test } from "vitest";

import { createProject } from "../dist/cmd/new.js";
import { validateComponentSource } from "../dist/cmd/new-declarations.js";
import { renderComponent } from "../dist/cmd/new-render.js";
import typescript from "typescript-compiler-api";

const fixture = fileURLToPath(new URL("./fixtures/wit/multiple-worlds/test.wit", import.meta.url));
const temporaryDirectories = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

suite("jco new", () => {
    test("renders reserved world export names through aliases", () => {
        const source = renderComponent(
            typescript,
            { world: "test:names/world", functions: [{ name: "class", parameters: [] }], interfaces: [] },
            "typescript",
        );
        assert.include(source, "const _class");
        assert.include(source, "export { _class as class }");
        const parsed = typescript.createSourceFile("component.ts", source, typescript.ScriptTarget.Latest, true);
        assert.lengthOf(parsed.parseDiagnostics, 0);
    });

    test("rejects a generated implementation that does not match its world", () => {
        const declarations = {
            "world.d.ts": new TextEncoder().encode(
                "declare module 'test:validation/world' { export function required(): string; }",
            ),
        };
        assert.throws(
            () =>
                validateComponentSource(
                    typescript,
                    declarations,
                    "export const required: typeof import('test:validation/world').required = () => 1;",
                    "typescript",
                ),
            /failed type checking/,
        );
    });

    test("creates a type-checkable single-target TypeScript scaffold", async () => {
        const root = await temporaryDirectory();
        const project = join(root, "my-component");
        await createProject(project, { wit: fixture, world: "jco:test/world1", targets: ["web"] });

        assert.deepEqual((await readdir(project)).sort(), [
            ".gitignore",
            "README.md",
            "package.json",
            "rolldown.config.mjs",
            "src",
            "test",
            "tsconfig.json",
            "types",
            "wit",
        ]);
        assert.include(
            await readFile(join(project, "src/component.ts"), "utf8"),
            "export const foo1: typeof World.foo1",
        );
        const packageJson = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
        assert.equal(packageJson.packageManager, "pnpm@11.0.0");
        assert.notProperty(packageJson.devDependencies, "@types/node");
        assert.notProperty(packageJson.scripts, "build:web");
        assert.include(await readFile(join(project, "rolldown.config.mjs"), "utf8"), '"../tsconfig.json"');
    });

    test("creates checked JavaScript and both targets by default", async () => {
        const root = await temporaryDirectory();
        const project = join(root, "javascript-component");
        await createProject(project, {
            wit: fixture,
            world: "jco:test/world1",
            language: "javascript",
            packageManager: "npm",
        });

        const source = await readFile(join(project, "src/component.js"), "utf8");
        assert.match(source, /^\/\/ @ts-check/);
        assert.include(source, '@type {typeof import("jco:test/world1").foo1}');
        const packageJson = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
        assert.equal(packageJson.packageManager, "npm@11.0.0");
        assert.property(packageJson.scripts, "build:nodejs");
        assert.property(packageJson.scripts, "build:web");
        assert.include(await readFile(join(project, "rolldown.web.config.mjs"), "utf8"), '"../tsconfig.web.json"');
    });

    test("requires a world when the WIT package has multiple worlds", async () => {
        const root = await temporaryDirectory();
        const project = join(root, "ambiguous");
        await expect(createProject(project, { wit: fixture })).rejects.toThrow(/multiple worlds|world/i);
        await expect(readdir(project)).rejects.toThrow();
    });

    test("does not overwrite a non-empty destination", async () => {
        const root = await temporaryDirectory();
        await writeFile(join(root, "keep.txt"), "keep");
        await expect(createProject(root, { wit: fixture, world: "jco:test/world1" })).rejects.toThrow(/not empty/);
    });
});

async function temporaryDirectory() {
    const directory = await mkdtemp(join(tmpdir(), "jco-new-test-"));
    temporaryDirectories.push(directory);
    return directory;
}
