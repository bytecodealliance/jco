import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { FS_WIT_REQUIREMENT } from "../node-wit.js";

const FS_SPECIFIERS = new Set(["node:fs", "node:fs/promises"]);

/** Source of the `node:fs` and `node:fs/promises` ESM facades. */
function fsAdapter(specifier: string, fsModule: string, fsPromisesModule: string): string {
    const module = specifier === "node:fs" ? fsModule : fsPromisesModule;
    return `
import fs from ${JSON.stringify(module)};
export * from ${JSON.stringify(module)};
export default fs;
`;
}

export function createFsBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        FS_SPECIFIERS,
        (specifier) =>
            fsAdapter(specifier, stdModule(options.fsModule, "fs"), stdModule(options.fsPromisesModule, "fs/promises")),
        () => options.onWitRequirement?.(FS_WIT_REQUIREMENT),
    );
}
