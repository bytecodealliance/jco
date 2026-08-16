import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

import { typesComponent } from "./types.js";
import { declarationModel } from "./new-declarations.js";
import { renderComponent } from "./new-render.js";

export type NewLanguage = "typescript" | "javascript";
export type NewPackageManager = "pnpm" | "npm" | "yarn";
export type NewTarget = "nodejs" | "web";

export interface NewProjectOptions {
    wit: string;
    world?: string;
    language?: NewLanguage | "ts" | "js";
    packageManager?: NewPackageManager;
    targets?: NewTarget[];
}

export async function createProject(projectDirectory: string, options: NewProjectOptions): Promise<string> {
    const destination = resolve(projectDirectory);
    const witSource = resolve(options.wit);
    const language = normalizeLanguage(options.language);
    const packageManager = options.packageManager ?? "pnpm";
    const targets = normalizeTargets(options.targets);
    await validatePaths(destination, witSource);

    const typescript = (await import("typescript")).default;
    const generatedTypes = await typesComponent(witSource, {
        guest: true,
        worldName: options.world,
        strict: true,
    });
    const model = declarationModel(typescript, generatedTypes);
    const source = renderComponent(typescript, model, language);
    const files = await scaffoldFiles({
        projectName: npmPackageName(basename(destination)),
        language,
        packageManager,
        targets,
        world: model.world,
        source,
        generatedTypes,
        witSource,
    });

    const temporary = await mkdtemp(join(dirname(destination), `.${basename(destination)}-jco-new-`));
    try {
        for (const [name, contents] of Object.entries(files)) {
            const output = join(temporary, name);
            await mkdir(dirname(output), { recursive: true });
            await writeFile(output, contents);
        }
        await copyWit(witSource, join(temporary, "wit"));
        if (await exists(destination)) await rm(destination, { recursive: false });
        await rename(temporary, destination);
    } catch (error) {
        await rm(temporary, { recursive: true, force: true });
        throw error;
    }
    console.log(`Created ${destination}`);
    return destination;
}

async function scaffoldFiles(input: {
    projectName: string;
    language: NewLanguage;
    packageManager: NewPackageManager;
    targets: NewTarget[];
    world: string;
    source: string;
    generatedTypes: Record<string, Uint8Array>;
    witSource: string;
}): Promise<Record<string, string | Uint8Array>> {
    const extension = input.language === "typescript" ? "ts" : "js";
    const files: Record<string, string | Uint8Array> = {
        ".gitignore": "node_modules/\ndist/\n",
        [`src/component.${extension}`]: input.source,
        [`test/component.test.${extension}`]: smokeTest(input.language),
    };
    for (const [name, contents] of Object.entries(input.generatedTypes)) files[`types/generated/${name}`] = contents;
    const packageJson = await generatedPackageJson(input);
    files["package.json"] = `${JSON.stringify(packageJson, null, 2)}\n`;
    files["README.md"] = readme(input, extension);
    Object.assign(files, configurations(input.language, input.targets));
    return files;
}

async function generatedPackageJson(input: {
    projectName: string;
    language: NewLanguage;
    packageManager: NewPackageManager;
    targets: NewTarget[];
    world: string;
    witSource: string;
}) {
    const ownPackage = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
    const extension = input.language === "typescript" ? "ts" : "js";
    const world = shellArgument(input.world);
    const wit = "wit";
    const source = `src/component.${extension}`;
    const types = `jco guest-types ${wit} --world-name ${world} --strict -o types/generated`;
    const scripts: Record<string, string> = { types };
    if (input.targets.length === 2) {
        scripts["check:types:nodejs"] = "tsc -p tsconfig.nodejs.json";
        scripts["check:types:web"] = "tsc -p tsconfig.web.json";
        scripts.check = "npm run check:types:nodejs && npm run check:types:web";
        scripts["build:nodejs"] = buildCommand(
            source,
            wit,
            world,
            "rolldown.nodejs.config.mjs",
            "dist/nodejs/component.wasm",
        );
        scripts["build:web"] = buildCommand(source, wit, world, "rolldown.web.config.mjs", "dist/web/component.wasm");
        scripts.build = "npm run build:nodejs && npm run build:web";
    } else {
        scripts["check:types"] = "tsc -p tsconfig.json";
        scripts.check = "npm run check:types";
        scripts.build = buildCommand(source, wit, world, "rolldown.config.mjs", "dist/component.wasm");
    }
    scripts.test = "vitest run";
    scripts.prebuild = "npm run types";
    return {
        name: input.projectName,
        version: "0.1.0",
        private: true,
        type: "module",
        packageManager: packageManagerVersion(input.packageManager),
        scripts,
        devDependencies: {
            "@bytecodealliance/jco": `^${ownPackage.version}`,
            ...(input.targets.includes("nodejs") ? { "@types/node": "^24.0.0" } : {}),
            rolldown: "^1.2.0",
            typescript: "^6.0.3",
            vitest: "^4.0.8",
        },
    };
}

function buildCommand(source: string, wit: string, world: string, config: string, output: string): string {
    const outputDirectory = output.slice(0, output.lastIndexOf("/"));
    return `node -e "require('node:fs').mkdirSync('${outputDirectory}', { recursive: true })" && jco componentize ${source} --wit ${wit} --world-name ${world} --bundle-config ${config} -o ${output}`;
}

function configurations(language: NewLanguage, targets: NewTarget[]): Record<string, string> {
    const allowJs = language === "javascript" ? { allowJs: true, checkJs: true, noImplicitAny: false } : {};
    const shared = {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        noEmit: true,
        verbatimModuleSyntax: true,
        skipLibCheck: true,
        ...allowJs,
    };
    const include = ["src/**/*", "test/**/*", "types/generated/**/*.d.ts"];
    if (targets.length === 1) {
        const target = targets[0];
        return {
            "tsconfig.json": json({
                compilerOptions: {
                    ...shared,
                    lib: target === "web" ? ["ES2022", "DOM", "DOM.Iterable"] : ["ES2022"],
                    types: target === "web" ? [] : ["node"],
                },
                include,
            }),
            "rolldown.config.mjs": `export default {\n  tsconfig: "./tsconfig.json",\n};\n`,
        };
    }
    return {
        "tsconfig.json": json({ compilerOptions: shared, include }),
        "tsconfig.nodejs.json": json({
            extends: "./tsconfig.json",
            compilerOptions: { lib: ["ES2022"], types: ["node"] },
        }),
        "tsconfig.web.json": json({
            extends: "./tsconfig.json",
            compilerOptions: { lib: ["ES2022", "DOM", "DOM.Iterable"], types: [] },
        }),
        "rolldown.nodejs.config.mjs": `export default {\n  tsconfig: "./tsconfig.nodejs.json",\n};\n`,
        "rolldown.web.config.mjs": `export default {\n  tsconfig: "./tsconfig.web.json",\n};\n`,
    };
}

function smokeTest(language: NewLanguage): string {
    const typeAnnotation = language === "typescript" ? ": Record<string, unknown>" : "";
    const sourceExtension = language === "typescript" ? "" : ".js";
    return `import { describe, expect, test } from "vitest";\nimport * as component from "../src/component${sourceExtension}";\n\ndescribe("component implementation", () => {\n  test("exports an implementation", () => {\n    const exports${typeAnnotation} = component;\n    expect(Object.keys(exports).length).toBeGreaterThan(0);\n  });\n});\n`;
}

function readme(
    input: { packageManager: NewPackageManager; targets: NewTarget[]; world: string },
    extension: string,
): string {
    const run = input.packageManager === "npm" ? "npm run" : input.packageManager;
    const install = input.packageManager === "yarn" ? "yarn install" : `${input.packageManager} install`;
    const builds = input.targets.length === 2 ? `\`${run} build:nodejs\` and \`${run} build:web\`` : `\`${run} build\``;
    return `# JavaScript component\n\nThis project implements the \`${input.world}\` WIT world. Edit \`src/component.${extension}\` and replace the generated TODO bodies.\n\n## Develop\n\n\`\`\`console\n${install}\n${run} types\n${run} check\n${run} test\n${run} build\n\`\`\`\n\nThe WIT package is copied into \`wit/\`; generated guest declarations live in \`types/generated/\`. Run \`${run} types\` after changing WIT. Build individual targets with ${builds}.\n\nThe scripts are standard package scripts, so npm, pnpm, or Yarn can be used with their equivalent \`install\` and \`run\` commands. Rolldown settings are in the generated configuration file${input.targets.length === 2 ? "s" : ""}.\n`;
}

async function validatePaths(destination: string, witSource: string): Promise<void> {
    const witStat = await stat(witSource).catch(() => undefined);
    if (!witStat || (!witStat.isFile() && !witStat.isDirectory()))
        throw new Error(`WIT path does not exist: ${witSource}`);
    if (witStat.isFile() && extname(witSource) !== ".wit") throw new Error("--wit must name a .wit file or directory");
    if (destination === witSource || witSource.startsWith(destination + sep)) {
        throw new Error("The project destination cannot contain the WIT source");
    }
    const destinationStat = await stat(destination).catch(() => undefined);
    if (destinationStat && !destinationStat.isDirectory())
        throw new Error(`Destination is not a directory: ${destination}`);
    if (destinationStat && (await readdir(destination)).length !== 0) {
        throw new Error(`Destination is not empty: ${destination}`);
    }
}

async function copyWit(source: string, destination: string): Promise<void> {
    const sourceStat = await lstat(source);
    if (sourceStat.isSymbolicLink()) throw new Error("Symbolic WIT inputs are not supported");
    if (sourceStat.isFile()) {
        await mkdir(destination, { recursive: true });
        await cp(source, join(destination, basename(source)));
    } else {
        await cp(source, destination, {
            recursive: true,
            filter: async (path) => {
                const rel = relative(source, path);
                if (rel.split(sep).some((part) => ["node_modules", "target", ".git", ".DS_Store"].includes(part)))
                    return false;
                return !(await lstat(path)).isSymbolicLink();
            },
        });
    }
}

function normalizeLanguage(language: NewProjectOptions["language"]): NewLanguage {
    if (language === undefined || language === "typescript" || language === "ts") return "typescript";
    if (language === "javascript" || language === "js") return "javascript";
    throw new Error(`Unknown language: ${language}`);
}

function normalizeTargets(targets: NewTarget[] | undefined): NewTarget[] {
    if (!targets?.length) return ["nodejs", "web"];
    return ["nodejs", "web"].filter((target): target is NewTarget => targets.includes(target as NewTarget));
}

function npmPackageName(name: string): string {
    const normalized = name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[._-]+|[._-]+$/g, "");
    if (!normalized) throw new Error(`Cannot derive an npm package name from ${JSON.stringify(name)}`);
    return normalized;
}

function packageManagerVersion(manager: NewPackageManager): string {
    return { pnpm: "pnpm@11.0.0", npm: "npm@11.0.0", yarn: "yarn@4.9.2" }[manager];
}

function shellArgument(value: string): string {
    if (!/^[a-zA-Z0-9:@/._-]+$/.test(value)) throw new Error(`Unsupported world name: ${value}`);
    return value;
}

function json(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
}

async function exists(path: string): Promise<boolean> {
    return stat(path).then(
        () => true,
        () => false,
    );
}
