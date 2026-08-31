import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface NodeWitRequirement {
    nodeSpecifier: string;
    witImport: string;
    dependencyDirectory: string;
    /**
     * WIT files installed for this requirement.
     *
     * The interfaces live in one file each, sharing a package directory, so a world only gains the
     * interface it uses. Anything an interface `use`s must be installed with it.
     */
    dependencySources: string[];
}

/** Types the Node API interfaces share; every interface file depends on it. */
const SHARED_TYPES_SOURCE = fileURLToPath(new URL("../lib/wit/builtin/jco-node-0.1.0/types.wit", import.meta.url));

export const CHILD_PROCESS_WIT_REQUIREMENT: NodeWitRequirement = {
    nodeSpecifier: "node:child_process",
    witImport: "jco:node/child-process@0.1.0",
    dependencyDirectory: "jco-node-0.1.0",
    dependencySources: [
        SHARED_TYPES_SOURCE,
        fileURLToPath(new URL("../lib/wit/builtin/jco-node-0.1.0/child-process.wit", import.meta.url)),
    ],
};

export const CLUSTER_WIT_REQUIREMENT: NodeWitRequirement = {
    nodeSpecifier: "node:cluster",
    witImport: "jco:node/cluster@0.1.0",
    dependencyDirectory: "jco-node-0.1.0",
    dependencySources: [
        SHARED_TYPES_SOURCE,
        fileURLToPath(new URL("../lib/wit/builtin/jco-node-0.1.0/cluster.wit", import.meta.url)),
    ],
};

export interface WitInjectionResult {
    witPath: string;
    worldFile: string;
    dependencyFiles: string[];
    imports: string[];
}

export function witInjectionWarnings(result: WitInjectionResult): string[] {
    const messages = [
        `Jco added generated WIT import${result.imports.length === 1 ? "" : "s"} ${result.imports.join(", ")} to ${result.worldFile} because bundled source uses a host-backed Node API. Review and commit this change.`,
    ];
    for (const dependencyFile of result.dependencyFiles) {
        messages.push(`Jco added the required WIT dependency at ${dependencyFile}.`);
    }
    return messages;
}

interface WorldDeclaration {
    name: string;
    file: string;
    source: string;
    openBrace: number;
    closeBrace: number;
}

function withoutComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length))
        .replace(/\/\/[^\r\n]*/g, (comment) => " ".repeat(comment.length));
}

function matchingBrace(source: string, openBrace: number): number {
    let depth = 0;
    let lineComment = false;
    let blockComment = false;
    let quote: string | undefined;
    for (let index = openBrace; index < source.length; index++) {
        const char = source[index];
        const next = source[index + 1];
        if (lineComment) {
            if (char === "\n") {
                lineComment = false;
            }
            continue;
        }
        if (blockComment) {
            if (char === "*" && next === "/") {
                blockComment = false;
                index++;
            }
            continue;
        }
        if (quote) {
            if (char === "\\") {
                index++;
            } else if (char === quote) {
                quote = undefined;
            }
            continue;
        }
        if (char === "/" && next === "/") {
            lineComment = true;
            index++;
        } else if (char === "/" && next === "*") {
            blockComment = true;
            index++;
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === "{") {
            depth++;
        } else if (char === "}" && --depth === 0) {
            return index;
        }
    }
    throw new Error("unterminated WIT world declaration");
}

function worldsIn(file: string, source: string): WorldDeclaration[] {
    const visible = withoutComments(source);
    const worlds: WorldDeclaration[] = [];
    const pattern = /\bworld\s+(%?[A-Za-z][A-Za-z0-9-]*)\s*\{/g;
    for (let match = pattern.exec(visible); match; match = pattern.exec(visible)) {
        const openBrace = visible.indexOf("{", match.index);
        worlds.push({
            name: match[1],
            file,
            source,
            openBrace,
            closeBrace: matchingBrace(source, openBrace),
        });
    }
    return worlds;
}

function selectedWorldName(worldName: string | undefined): string | undefined {
    if (!worldName) {
        return undefined;
    }
    return worldName
        .split("/")
        .pop()!
        .replace(/@\d+(?:\.\d+)*(?:-[A-Za-z0-9.-]+)?$/, "");
}

async function rootWitFiles(witPath: string): Promise<string[]> {
    const path = resolve(witPath);
    if ((await stat(path)).isFile()) {
        return [path];
    }
    const entries = await readdir(path, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".wit"))
        .map((entry) => join(path, entry.name));
}

async function findWorld(witPath: string, worldName: string | undefined): Promise<WorldDeclaration> {
    const declarations = (
        await Promise.all(
            (await rootWitFiles(witPath)).map(async (file) => worldsIn(file, await readFile(file, "utf8"))),
        )
    ).flat();
    const selected = selectedWorldName(worldName);
    if (selected) {
        const matches = declarations.filter(({ name }) => name === selected);
        if (matches.length !== 1) {
            throw new Error(
                `unable to inject Node WIT imports: selected world ${worldName} was ${matches.length ? "ambiguous" : "not found"}`,
            );
        }
        return matches[0];
    }
    if (declarations.length !== 1) {
        throw new Error(
            `unable to inject Node WIT imports: specify --world because the WIT package defines ${declarations.length} worlds`,
        );
    }
    return declarations[0];
}

function worldHasImport(world: WorldDeclaration, witImport: string): boolean {
    const body = withoutComments(world.source.slice(world.openBrace + 1, world.closeBrace));
    const escaped = witImport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\bimport\\s+(?:%?[A-Za-z][A-Za-z0-9-]*\\s*:\\s*)?${escaped}\\s*;`).test(body);
}

function insertionFor(requirements: NodeWitRequirement[], newline: string): string {
    return requirements
        .map(
            ({ nodeSpecifier, witImport }) =>
                `${newline}  // Added by Jco because bundled source imports ${nodeSpecifier}.${newline}  import ${witImport};`,
        )
        .join("");
}

/**
 * Add Node capability imports to the selected user world in place.
 *
 * This is intentionally visible in source control. Repeated calls are no-ops,
 * and dependency packages supplied by the user are never overwritten.
 */
export async function injectNodeWitImports(
    witPath: string,
    worldName: string | undefined,
    requirements: NodeWitRequirement[],
): Promise<WitInjectionResult | undefined> {
    if (requirements.length === 0) {
        return undefined;
    }
    const world = await findWorld(witPath, worldName);
    const uniqueRequirements = [
        ...new Map(requirements.map((requirement) => [requirement.witImport, requirement])).values(),
    ];
    const missing = uniqueRequirements.filter(({ witImport }) => !worldHasImport(world, witImport));
    if (missing.length === 0) {
        return undefined;
    }

    const newline = world.source.includes("\r\n") ? "\r\n" : "\n";
    const root = (await stat(resolve(witPath))).isFile() ? dirname(resolve(witPath)) : resolve(witPath);
    const dependencyFiles: string[] = [];
    for (const requirement of missing) {
        const dependencyDir = join(root, "deps", requirement.dependencyDirectory);
        await mkdir(dependencyDir, { recursive: true });
        for (const source of requirement.dependencySources) {
            const destination = join(dependencyDir, basename(source));
            try {
                await writeFile(destination, await readFile(source), { flag: "wx" });
                dependencyFiles.push(destination);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                    throw error;
                }
            }
        }
    }

    const updated =
        world.source.slice(0, world.openBrace + 1) +
        insertionFor(missing, newline) +
        world.source.slice(world.openBrace + 1);
    await writeFile(world.file, updated);

    return {
        witPath: root,
        worldFile: world.file,
        dependencyFiles,
        imports: missing.map(({ witImport }) => witImport),
    };
}
