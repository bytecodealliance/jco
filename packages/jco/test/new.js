import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import typescript from "typescript-compiler-api";

import { assert, expect, suite, test } from "vitest";

import { WIT_FIXTURES_DIR } from "./common.js";
import { getTmpDir } from "./helpers.js";

import { createProject } from "../dist/cmd/new.js";
import { validateComponentSource } from "../dist/cmd/new/declarations.js";
import {
    packageManagerAdapter,
    DEFAULT_PNPM_VERSION,
    DEFAULT_YARN_VERSION,
    DEFAULT_NPM_VERSION,
} from "../dist/cmd/new/package-manager.js";
import { renderComponent } from "../dist/cmd/new/render.js";

suite("jco scaffold", () => {
    test.each([
        ["pnpm", `pnpm@${DEFAULT_PNPM_VERSION}`, "pnpm-lock.yaml", "pnpm run check"],
        ["npm", `npm@${DEFAULT_NPM_VERSION}`, "package-lock.json", "npm run check"],
        ["yarn", `yarn@${DEFAULT_YARN_VERSION}`, "yarn.lock", "yarn run check"],
    ])("abstracts %s commands", (name, metadata, lockfile, check) => {
        const manager = packageManagerAdapter(name);
        assert.equal(manager.packageManager, metadata);
        assert.equal(manager.lockfile, lockfile);
        assert.equal(manager.run("check"), check);
    });

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
        const root = await getTmpDir();
        const project = join(root, "my-component");
        await createProject(project, {
            wit: join(WIT_FIXTURES_DIR, "/multiple-worlds/test.wit"),
            world: "jco:test/world1",
            targets: ["web"],
        });

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
        const generatedTest = await readFile(join(project, "test/component.test.ts"), "utf8");
        assert.include(generatedTest, 'component["foo1"]');
        assert.include(generatedTest, '["foo"]');
        const packageJson = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
        assert.equal(packageJson.packageManager, `pnpm@${DEFAULT_PNPM_VERSION}`);
        assert.equal(packageJson.scripts.check, "pnpm run check:types");
        assert.equal(packageJson.scripts.prebuild, "pnpm run types");
        assert.notProperty(packageJson.devDependencies, "@types/node");
        assert.notProperty(packageJson.scripts, "build:web");
        assert.include(await readFile(join(project, "rolldown.config.mjs"), "utf8"), '"../tsconfig.json"');

        await rm(root, { recursive: true, force: true });
    });

    test("scaffolds both guest and host sides of a world", async () => {
        const root = await getTmpDir();
        const wit = join(root, "both.wit");
        await writeFile(
            wit,
            `package test:both;

interface dependency {
    ping: func(value: string) -> string;
}

world app {
    import dependency;
    export run: func(value: string) -> string;
}
`,
        );
        const guest = join(root, "guest");
        const host = join(root, "host");
        await createProject(guest, { wit, world: "test:both/app", targets: ["nodejs"] });
        await createProject(host, { wit, world: "test:both/app", host: true });

        assert.include(await readFile(join(guest, "src/component.ts"), "utf8"), "export const run: typeof World.run");
        const plugin = await readFile(join(host, "src/plugin.ts"), "utf8");
        assert.include(plugin, '"test:both/dependency"');
        assert.match(plugin, /ping\(value/);
        assert.include(plugin, "export default imports");
        const packageJson = JSON.parse(await readFile(join(host, "package.json"), "utf8"));
        assert.match(packageJson.scripts.types, /^jco types /);
        assert.notProperty(packageJson.scripts, "build");

        await rm(root, { recursive: true, force: true });
    });

    test("creates checked JavaScript and both targets by default", async () => {
        const root = await getTmpDir();
        const project = join(root, "javascript-component");
        await createProject(project, {
            wit: join(WIT_FIXTURES_DIR, "/multiple-worlds/test.wit"),
            world: "jco:test/world1",
            language: "javascript",
            packageManager: "npm",
        });

        const source = await readFile(join(project, "src/component.js"), "utf8");
        assert.match(source, /^\/\/ @ts-check/);
        assert.include(source, '@type {typeof import("jco:test/world1").foo1}');
        const packageJson = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
        assert.equal(packageJson.packageManager, `npm@${DEFAULT_NPM_VERSION}`);
        assert.equal(packageJson.scripts.prebuild, "npm run types");
        assert.property(packageJson.scripts, "build:nodejs");
        assert.property(packageJson.scripts, "build:web");
        assert.include(await readFile(join(project, "rolldown.web.config.mjs"), "utf8"), '"../tsconfig.web.json"');

        await rm(root, { recursive: true, force: true });
    });

    test("requires a world when the WIT package has multiple worlds", async () => {
        const root = await getTmpDir();
        const project = join(root, "ambiguous");
        await expect(
            createProject(project, { wit: join(WIT_FIXTURES_DIR, "/multiple-worlds/test.wit") }),
        ).rejects.toThrow(/multiple worlds|world/i);
        await expect(readdir(project)).rejects.toThrow();

        await rm(root, { recursive: true, force: true });
    });

    test("does not overwrite a non-empty destination", async () => {
        const root = await getTmpDir();
        await writeFile(join(root, "keep.txt"), "keep");
        await expect(
            createProject(root, { wit: join(WIT_FIXTURES_DIR, "/multiple-worlds/test.wit"), world: "jco:test/world1" }),
        ).rejects.toThrow(/not empty/);

        await rm(root, { recursive: true, force: true });
    });
});
