import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export type BuiltinWitName = "wasi-command" | "wasi-proxy" | "wasi-reactor";
export type BuiltinWitVersion = "0.3.0" | "0.2.12";

export interface BuiltinWit {
    name: BuiltinWitName;
    version: BuiltinWitVersion;
    world: string;
    rootPackage: "wasi-cli" | "wasi-http";
}

const DEFAULT_VERSION: BuiltinWitVersion = "0.3.0";
const VERSION_ALIASES = new Map<string, BuiltinWitVersion>([
    ["0.3.x", "0.3.0"],
    ["0.3.0", "0.3.0"],
    ["0.2.x", "0.2.12"],
    ["0.2.12", "0.2.12"],
]);
const PACKAGE_NAMES: Record<BuiltinWitVersion, string[]> = {
    "0.3.0": ["wasi-cli", "wasi-clocks", "wasi-filesystem", "wasi-http", "wasi-random", "wasi-sockets"],
    "0.2.12": ["wasi-cli", "wasi-clocks", "wasi-filesystem", "wasi-http", "wasi-io", "wasi-random", "wasi-sockets"],
};
const BUNDLED_WIT_ROOT = new URL("../../../lib/wit/builtin/", import.meta.url);

/** Parse a builtin WIT starting point, returning undefined for regular filesystem paths. */
export function resolveBuiltinWit(input: string): BuiltinWit | undefined {
    if (!input.startsWith("builtin:")) {
        return undefined;
    }

    const match = /^builtin:(wasi-command|wasi-proxy|wasi-reactor)(?:@(.+))?$/.exec(input);
    if (!match) {
        throw new Error(
            `Unknown builtin WIT ${JSON.stringify(input)}. Expected builtin:wasi-command, builtin:wasi-proxy, or builtin:wasi-reactor`,
        );
    }

    const name = match[1] as BuiltinWitName;
    const requestedVersion = match[2];
    const version = requestedVersion === undefined ? DEFAULT_VERSION : VERSION_ALIASES.get(requestedVersion);
    if (!version) {
        throw new Error(
            `Unsupported builtin WASI version ${JSON.stringify(requestedVersion)}. Supported versions are 0.3.x and 0.2.x`,
        );
    }

    const rootPackage = name === "wasi-proxy" ? "wasi-http" : "wasi-cli";
    const world =
        name === "wasi-command"
            ? `wasi:cli/command@${version}`
            : name === "wasi-reactor"
              ? `wasi:cli/imports@${version}`
              : version === "0.3.0"
                ? "wasi:http/service@0.3.0"
                : "wasi:http/proxy@0.2.12";

    return { name, version, world, rootPackage };
}

/** Copy a bundled snapshot into the conventional root-package-plus-deps WIT layout. */
export async function copyBuiltinWit(builtin: BuiltinWit, destination: string): Promise<void> {
    await mkdir(destination, { recursive: true });
    for (const packageName of PACKAGE_NAMES[builtin.version]) {
        const source = fileURLToPath(new URL(`${builtin.version}/${packageName}/package.wit`, BUNDLED_WIT_ROOT));
        const output =
            packageName === builtin.rootPackage
                ? join(destination, "package.wit")
                : join(destination, "deps", `${packageName}-${builtin.version}`, "package.wit");
        await mkdir(dirname(output), { recursive: true });
        await copyFile(source, output);
    }
}
