import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

import { typesComponent } from "./types.js";
import { copyBuiltinWit, resolveBuiltinWit } from "./new/builtin-wit.js";
import { declarationModel, validateComponentSource } from "./new/declarations.js";
import { packageManagerAdapter } from "./new/package-manager.js";
import { renderComponent, renderComponentTest, renderHostPlugin, renderHostPluginTest } from "./new/render.js";

export type NewLanguage = "typescript" | "javascript";
export type NewPackageManager = "pnpm" | "npm" | "yarn";
export type NewTarget = "nodejs" | "web";

export interface NewProjectOptions {
    wit: string;
    world?: string;
    language?: NewLanguage | "ts" | "js";
    packageManager?: NewPackageManager;
    targets?: NewTarget[];
    host?: boolean;
}

/** Create a JS project to match a given WIT */
export async function createProject(projectDirectory: string, options: NewProjectOptions): Promise<string> {
    const destination = resolve(projectDirectory);
    const builtinWit = resolveBuiltinWit(options.wit);
    const witSource = builtinWit ? undefined : resolve(options.wit);
    const language = normalizeLanguage(options.language);
    const packageManager = options.packageManager ?? "pnpm";
    const targets = normalizeTargets(options.targets);
    await validatePaths(destination, witSource);
    if (builtinWit && options.world) {
        throw new Error("--world cannot be used with a builtin WIT starting point");
    }

    const temporary = await mkdtemp(join(dirname(destination), `.${basename(destination)}-jco-new-`));
    try {
        const projectWit = join(temporary, "wit");
        if (builtinWit) {
            await copyBuiltinWit(builtinWit, projectWit);
        } else {
            await copyWit(witSource!, projectWit);
        }

        // TypeScript 7's native compiler does not yet expose the stable JS
        // Program/factory/printer API. Keep this compatibility dependency isolated
        // so it can be removed when the native API stabilizes.
        const typescript = (await import("typescript-compiler-api")).default;
        const host = options.host ?? false;
        const generatedTypes = await typesComponent(projectWit, {
            guest: !host,
            worldName: builtinWit?.world ?? options.world,
            strict: true,
        });

        const model = declarationModel(typescript, generatedTypes, host);
        const source = host
            ? renderHostPlugin(typescript, model, language)
            : renderComponent(typescript, model, language);
        const testSource = host
            ? renderHostPluginTest(typescript, model, language)
            : renderComponentTest(typescript, model, language);

        validateComponentSource(typescript, generatedTypes, source, language);

        const files = await scaffoldFiles({
            projectName: npmPackageName(basename(destination)),
            language,
            packageManager,
            targets,
            world: model.world,
            source,
            testSource,
            generatedTypes,
            host,
        });

        for (const [name, contents] of Object.entries(files)) {
            const output = join(temporary, name);
            await mkdir(dirname(output), { recursive: true });
            await writeFile(output, contents);
        }
        if (await exists(destination)) {
            await rm(destination, { recursive: false });
        }
        await rename(temporary, destination);
    } catch (error) {
        await rm(temporary, { recursive: true, force: true });
        throw error;
    }

    console.error(`Created ${destination}`);

    return destination;
}

interface ScaffoldFilesArgs {
    projectName: string;
    language: NewLanguage;
    packageManager: NewPackageManager;
    targets: NewTarget[];
    world: string;
    source: string;
    testSource: string;
    generatedTypes: Record<string, Uint8Array>;
    host: boolean;
}

async function scaffoldFiles(args: ScaffoldFilesArgs): Promise<Record<string, string | Uint8Array>> {
    const extension = args.language === "typescript" ? "ts" : "js";
    const files: Record<string, string | Uint8Array> = {
        ".gitignore": "node_modules/\ndist/\n",
        [`src/${args.host ? "plugin" : "component"}.${extension}`]: args.source,
        [`test/${args.host ? "plugin" : "component"}.test.${extension}`]: args.testSource,
    };
    for (const [name, contents] of Object.entries(args.generatedTypes)) {
        files[`types/generated/${name}`] = contents;
    }
    const packageJson = await generatedPackageJson(args);
    files["package.json"] = `${JSON.stringify(packageJson, null, 2)}\n`;
    files["README.md"] = readme(args, extension);
    Object.assign(files, configurations(args.language, args.host ? [] : args.targets));
    return files;
}

interface GeneratePackageJsonArgs {
    projectName: string;
    language: NewLanguage;
    packageManager: NewPackageManager;
    targets: NewTarget[];
    world: string;
    host: boolean;
}

/** Generate package.json for the new project */
async function generatedPackageJson(args: GeneratePackageJsonArgs) {
    const ownPackage = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
    const extension = args.language === "typescript" ? "ts" : "js";
    const world = shellArgument(args.world);
    const manager = packageManagerAdapter(args.packageManager);
    const wit = "wit";
    const source = `src/${args.host ? "plugin" : "component"}.${extension}`;
    const types = `jco ${args.host ? "types" : "guest-types"} ${wit} --world-name ${world} --strict -o types/generated`;
    const scripts: Record<string, string> = { types };
    if (args.host) {
        scripts["check:types"] = "tsc -p tsconfig.json";
        scripts.check = manager.run("check:types");
    } else if (args.targets.length === 2) {
        scripts["check:types:nodejs"] = "tsc -p tsconfig.nodejs.json";
        scripts["check:types:web"] = "tsc -p tsconfig.web.json";
        scripts.check = `${manager.run("check:types:nodejs")} && ${manager.run("check:types:web")}`;
        scripts["build:nodejs"] = buildCommand(
            source,
            wit,
            world,
            "rolldown.nodejs.config.mjs",
            "dist/nodejs/component.wasm",
        );
        scripts["build:web"] = buildCommand(source, wit, world, "rolldown.web.config.mjs", "dist/web/component.wasm");
        scripts.build = `${manager.run("build:nodejs")} && ${manager.run("build:web")}`;
    } else {
        scripts["check:types"] = "tsc -p tsconfig.json";
        scripts.check = manager.run("check:types");
        scripts.build = buildCommand(source, wit, world, "rolldown.config.mjs", "dist/component.wasm");
    }
    scripts.test = "vitest run";
    scripts.prebuild = manager.run("types");

    return {
        name: args.projectName,
        version: "0.1.0",
        private: true,
        type: "module",
        packageManager: manager.packageManager,
        scripts,
        devDependencies: {
            "@bytecodealliance/jco": `^${ownPackage.version}`,
            ...(args.targets.includes("nodejs") ? { "@types/node": "^24.0.0" } : {}),
            rolldown: "^1.2.4",
            typescript: "7.0.2",
            vitest: "^4.1.10",
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
    if (targets.length === 0) {
        return { "tsconfig.json": json({ compilerOptions: { ...shared, lib: ["ES2022"], types: ["node"] }, include }) };
    }
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
            "rolldown.config.mjs": `export default {\n  tsconfig: "../tsconfig.json",\n};\n`,
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
        "rolldown.nodejs.config.mjs": `export default {\n  tsconfig: "../tsconfig.nodejs.json",\n};\n`,
        "rolldown.web.config.mjs": `export default {\n  tsconfig: "../tsconfig.web.json",\n};\n`,
    };
}

function readme(
    input: { packageManager: NewPackageManager; targets: NewTarget[]; world: string; host: boolean },
    extension: string,
): string {
    const manager = packageManagerAdapter(input.packageManager);
    if (input.host) {
        return `# JavaScript host plugin\n\nThis project provides the imports required by the \`${input.world}\` WIT world. Edit \`src/plugin.${extension}\` and replace the generated TODO bodies, then pass its default export to \`instantiate\`.\n\n## Develop\n\n\`\`\`console\n${manager.install}\n${manager.run("types")}\n${manager.run("check")}\n${manager.run("test")}\n\`\`\`\n\nThe WIT package is copied into \`wit/\`; generated host declarations live in \`types/generated/\`. Run \`${manager.run("types")}\` after changing WIT.\n`;
    }
    const builds =
        input.targets.length === 2
            ? `\`${manager.run("build:nodejs")}\` and \`${manager.run("build:web")}\``
            : `\`${manager.run("build")}\``;
    return `# JavaScript component\n\nThis project implements the \`${input.world}\` WIT world. Edit \`src/component.${extension}\` and replace the generated TODO bodies.\n\n## Develop\n\n\`\`\`console\n${manager.install}\n${manager.run("types")}\n${manager.run("check")}\n${manager.run("test")}\n${manager.run("build")}\n\`\`\`\n\nThe WIT package is copied into \`wit/\`; generated guest declarations live in \`types/generated/\`. Run \`${manager.run("types")}\` after changing WIT. Build individual targets with ${builds}.\n\nThe scripts are standard package scripts, so npm, pnpm, or Yarn can be used with their equivalent \`install\` and \`run\` commands. Rolldown settings are in the generated configuration file${input.targets.length === 2 ? "s" : ""}.\n`;
}

async function validatePaths(destination: string, witSource: string | undefined): Promise<void> {
    if (witSource) {
        const witStat = await stat(witSource).catch(() => undefined);
        if (!witStat || (!witStat.isFile() && !witStat.isDirectory())) {
            throw new Error(`WIT path does not exist: ${witSource}`);
        }
        if (witStat.isFile() && extname(witSource) !== ".wit") {
            throw new Error("--wit must name a .wit file or directory");
        }
        if (destination === witSource || witSource.startsWith(destination + sep)) {
            throw new Error("The project destination cannot contain the WIT source");
        }
    }
    const destinationStat = await stat(destination).catch(() => undefined);
    if (destinationStat && !destinationStat.isDirectory()) {
        throw new Error(`Destination is not a directory: ${destination}`);
    }
    if (destinationStat && (await readdir(destination)).length !== 0) {
        throw new Error(`Destination is not empty: ${destination}`);
    }
}

async function copyWit(source: string, destination: string): Promise<void> {
    const sourceStat = await lstat(source);
    if (sourceStat.isSymbolicLink()) {
        throw new Error("Symbolic WIT inputs are not supported");
    }
    if (sourceStat.isFile()) {
        await mkdir(destination, { recursive: true });
        await cp(source, join(destination, basename(source)));
    } else {
        await cp(source, destination, {
            recursive: true,
            filter: async (path) => {
                const rel = relative(source, path);
                if (rel.split(sep).some((part) => ["node_modules", "target", ".git", ".DS_Store"].includes(part))) {
                    return false;
                }
                return !(await lstat(path)).isSymbolicLink();
            },
        });
    }
}

function normalizeLanguage(language: NewProjectOptions["language"]): NewLanguage {
    if (language === undefined || language === "typescript" || language === "ts") {
        return "typescript";
    }
    if (language === "javascript" || language === "js") {
        return "javascript";
    }
    throw new Error(`Unknown language: ${language}`);
}

function normalizeTargets(targets: NewTarget[] | undefined): NewTarget[] {
    if (!targets?.length) {
        return ["nodejs", "web"];
    }
    return ["nodejs", "web"].filter((target): target is NewTarget => targets.includes(target as NewTarget));
}

function npmPackageName(name: string): string {
    const normalized = name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[._-]+|[._-]+$/g, "");
    if (!normalized) {
        throw new Error(`Cannot derive an npm package name from ${JSON.stringify(name)}`);
    }
    return normalized;
}

function shellArgument(value: string): string {
    if (!/^[a-zA-Z0-9:@/._-]+$/.test(value)) {
        throw new Error(`Unsupported world name: ${value}`);
    }
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
