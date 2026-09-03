import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface NodeWitRequirement {
    nodeSpecifier: string;
    witImport: string;
    /**
     * A WIT interface the bundled source must export, retained for requirements with one
     * companion callback interface.
     *
     * Host-backed builtins whose host calls *back* into the component (`node:inspector` and
     * `node:http` today) declare a guest-exported callbacks interface, because a component cannot
     * implement a resource on an imported interface. Jco pairs the export injection here with a
     * two-pass bundle that adds the matching JS export. Prefer `guestExports`, which carries the
     * same interface together with the JS export that implements it.
     */
    witExport?: string;
    /** JavaScript exports that implement companion guest callback interfaces. */
    guestExports?: NodeGuestExport[];
    dependencyDirectory: string;
    /**
     * WIT files installed for this requirement.
     *
     * The interfaces live in one file each, sharing a package directory, so a world only gains the
     * interface it uses. Anything an interface `use`s must be installed with it.
     */
    dependencySources: string[];
    /** Additional WIT dependency packages installed alongside the primary package. */
    dependencyPackages?: WitDependencyPackage[];
}

export interface NodeGuestExport {
    witExport: string;
    jsExport: string;
    moduleSpecifier: string;
}

export interface WitDependencyPackage {
    dependencyDirectory: string;
    dependencySources: string[];
}

/** Types the Node API interfaces share; every interface file depends on it. */
const SHARED_TYPES_SOURCE = fileURLToPath(new URL("../lib/wit/builtin/jco-node-0.1.0/types.wit", import.meta.url));

/**
 * Build the requirement for one `jco:node/<interface>@0.1.0` import.
 *
 * Every Node API interface lives in `jco-node-0.1.0/<interface>.wit`; those that `use` the shared
 * `types` interface also install `types.wit` beside it. Mirrors `wasiRequirement` below for the
 * WASI side.
 */
function nodeRequirement(
    nodeSpecifier: string,
    witInterface: string,
    extra: Partial<Pick<NodeWitRequirement, "witExport" | "guestExports">> & { sharedTypes?: boolean } = {},
): NodeWitRequirement {
    const { sharedTypes = false, ...rest } = extra;
    const source = fileURLToPath(new URL(`../lib/wit/builtin/jco-node-0.1.0/${witInterface}.wit`, import.meta.url));
    return {
        nodeSpecifier,
        witImport: `jco:node/${witInterface}@0.1.0`,
        ...rest,
        dependencyDirectory: "jco-node-0.1.0",
        dependencySources: sharedTypes ? [SHARED_TYPES_SOURCE, source] : [source],
    };
}

export const CHILD_PROCESS_WIT_REQUIREMENT = nodeRequirement("node:child_process", "child-process", {
    sharedTypes: true,
});

export const CLUSTER_WIT_REQUIREMENT = nodeRequirement("node:cluster", "cluster", { sharedTypes: true });

export const CONSOLE_WIT_REQUIREMENT = nodeRequirement("node:console", "console");

export const DNS_WIT_REQUIREMENT = nodeRequirement("node:dns", "dns");

export const DNS_PROMISES_WIT_REQUIREMENT: NodeWitRequirement = {
    ...DNS_WIT_REQUIREMENT,
    nodeSpecifier: "node:dns/promises",
};

export const FS_WIT_REQUIREMENT = nodeRequirement("node:fs", "fs");

export const OS_WIT_REQUIREMENT = nodeRequirement("node:os", "os");

export const FFI_WIT_REQUIREMENT = nodeRequirement("node:ffi", "ffi");

export const INSPECTOR_WIT_REQUIREMENT = nodeRequirement("node:inspector", "inspector", {
    witExport: "jco:node/inspector-callbacks@0.1.0",
    guestExports: [
        {
            witExport: "jco:node/inspector-callbacks@0.1.0",
            jsExport: "inspectorCallbacks",
            moduleSpecifier: "jco:node-inspector-callbacks",
        },
    ],
});

export const INSPECTOR_PROMISES_WIT_REQUIREMENT: NodeWitRequirement = {
    ...INSPECTOR_WIT_REQUIREMENT,
    nodeSpecifier: "node:inspector/promises",
};

export const HTTP_WIT_REQUIREMENT = nodeRequirement("node:http", "http", {
    guestExports: [
        {
            witExport: "jco:node/http-callbacks@0.1.0",
            jsExport: "httpCallbacks",
            moduleSpecifier: "jco:node-http-callbacks",
        },
    ],
});

const WASI_0_2_12_ROOT = new URL("../lib/wit/builtin/0.2.12/", import.meta.url);

function wasiDependency(name: string): WitDependencyPackage {
    return {
        dependencyDirectory: `${name}-0.2.12`,
        dependencySources: [fileURLToPath(new URL(`${name}/package.wit`, WASI_0_2_12_ROOT))],
    };
}

const WASI_IO_DEPENDENCY = wasiDependency("wasi-io");
const WASI_CLOCKS_DEPENDENCY = wasiDependency("wasi-clocks");
const WASI_SOCKETS_DEPENDENCIES = [WASI_IO_DEPENDENCY, WASI_CLOCKS_DEPENDENCY, wasiDependency("wasi-sockets")];
const WASI_HTTP_DEPENDENCIES = [
    WASI_IO_DEPENDENCY,
    WASI_CLOCKS_DEPENDENCY,
    wasiDependency("wasi-random"),
    wasiDependency("wasi-filesystem"),
    wasiDependency("wasi-sockets"),
    wasiDependency("wasi-cli"),
    wasiDependency("wasi-http"),
];

function wasiRequirement(witImport: string, dependencies: WitDependencyPackage[]): NodeWitRequirement {
    const [primary, ...additional] = dependencies;
    return {
        nodeSpecifier: "node:http",
        witImport,
        dependencyDirectory: primary.dependencyDirectory,
        dependencySources: primary.dependencySources,
        dependencyPackages: additional,
    };
}

export const HTTP_WASI_SOCKETS_WIT_REQUIREMENTS = [
    wasiRequirement("wasi:sockets/instance-network@0.2.12", WASI_SOCKETS_DEPENDENCIES),
    wasiRequirement("wasi:sockets/ip-name-lookup@0.2.12", WASI_SOCKETS_DEPENDENCIES),
    wasiRequirement("wasi:sockets/tcp-create-socket@0.2.12", WASI_SOCKETS_DEPENDENCIES),
] as const;

export const HTTP_WASI_HTTP_WIT_REQUIREMENTS = [
    wasiRequirement("wasi:http/outgoing-handler@0.2.12", WASI_HTTP_DEPENDENCIES),
    wasiRequirement("wasi:http/types@0.2.12", WASI_HTTP_DEPENDENCIES),
] as const;

export interface WitInjectionResult {
    witPath: string;
    worldFile: string;
    dependencyFiles: string[];
    imports: string[];
    exports: string[];
}

export function witInjectionWarnings(result: WitInjectionResult): string[] {
    const messages: string[] = [];
    if (result.imports.length > 0) {
        messages.push(
            `Jco added generated WIT import${result.imports.length === 1 ? "" : "s"} ${result.imports.join(", ")} to ${result.worldFile} because bundled source uses a host-backed Node API. Review and commit this change.`,
        );
    }
    if (result.exports.length > 0) {
        messages.push(
            `Jco added generated WIT export${result.exports.length === 1 ? "" : "s"} ${result.exports.join(", ")} to ${result.worldFile} because bundled source uses a host-backed Node API. Review and commit this change.`,
        );
    }
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

function worldHasDeclaration(world: WorldDeclaration, declaration: "import" | "export", witName: string): boolean {
    const body = withoutComments(world.source.slice(world.openBrace + 1, world.closeBrace));
    const escaped = witName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${declaration}\\s+(?:%?[A-Za-z][A-Za-z0-9-]*\\s*:\\s*)?${escaped}\\s*;`).test(body);
}

function insertionFor(
    imports: NodeWitRequirement[],
    exports: Array<{ nodeSpecifier: string; witExport: string }>,
    newline: string,
): string {
    return [
        ...imports.map(
            ({ nodeSpecifier, witImport }) =>
                `${newline}  // Added by Jco because bundled source imports ${nodeSpecifier}.${newline}  import ${witImport};`,
        ),
        ...exports.map(
            ({ nodeSpecifier, witExport }) =>
                `${newline}  // Added by Jco so the ${nodeSpecifier} host can invoke guest callbacks.${newline}  export ${witExport};`,
        ),
    ].join("");
}

function requirementWitExports(requirement: NodeWitRequirement): string[] {
    return [
        ...new Set([
            ...(requirement.witExport ? [requirement.witExport] : []),
            ...(requirement.guestExports ?? []).map(({ witExport }) => witExport),
        ]),
    ];
}

/**
 * Add Node capability imports and companion callback exports to the selected user world in place.
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
    const missingImports = uniqueRequirements.filter(
        ({ witImport }) => !worldHasDeclaration(world, "import", witImport),
    );
    const missingExports = uniqueRequirements.flatMap((requirement) =>
        requirementWitExports(requirement)
            .filter((witExport) => !worldHasDeclaration(world, "export", witExport))
            .map((witExport) => ({ nodeSpecifier: requirement.nodeSpecifier, witExport })),
    );
    if (missingImports.length === 0 && missingExports.length === 0) {
        return undefined;
    }

    const newline = world.source.includes("\r\n") ? "\r\n" : "\n";
    const root = (await stat(resolve(witPath))).isFile() ? dirname(resolve(witPath)) : resolve(witPath);
    const dependencyFiles: string[] = [];
    const dependencies = new Map<string, WitDependencyPackage>();
    const changedRequirements = uniqueRequirements.filter(
        (requirement) =>
            missingImports.includes(requirement) ||
            requirementWitExports(requirement).some((witExport) =>
                missingExports.some((missing) => missing.witExport === witExport),
            ),
    );
    for (const requirement of changedRequirements) {
        const packages = [
            {
                dependencyDirectory: requirement.dependencyDirectory,
                dependencySources: requirement.dependencySources,
            },
            ...(requirement.dependencyPackages ?? []),
        ];
        for (const dependency of packages) {
            dependencies.set(dependency.dependencyDirectory, dependency);
        }
    }
    for (const dependency of dependencies.values()) {
        const dependencyDir = join(root, "deps", dependency.dependencyDirectory);
        await mkdir(dependencyDir, { recursive: true });
        for (const source of dependency.dependencySources) {
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
        insertionFor(missingImports, missingExports, newline) +
        world.source.slice(world.openBrace + 1);
    await writeFile(world.file, updated);

    return {
        witPath: root,
        worldFile: world.file,
        dependencyFiles,
        imports: missingImports.map(({ witImport }) => witImport),
        exports: missingExports.map(({ witExport }) => witExport),
    };
}
