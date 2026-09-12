import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule, starReexportAdapter } from "./shared.js";
import { VFS_WIT_REQUIREMENT, VFS_WASI_FILESYSTEM_WIT_REQUIREMENTS } from "../node-wit.js";

export function createVfsBuiltin({ options, worldMetadata }: BuiltinContext): BuiltinAdapter {
    const via = options.nodejsVfsVia ?? "direct";
    return builtin(
        "node:vfs",
        () => {
            if (via === "direct") {
                return starReexportAdapter(stdModule(options.vfsModule, "vfs", "26.x.x"), "vfs");
            }
            const implementation = stdModule(
                options.vfsWasiFilesystemImplementationModule,
                "vfs/impl/wasi-filesystem",
                "26.x.x",
            );
            const configImport = options.vfsWasiConfigModule
                ? `import { resolveRoot } from ${JSON.stringify(options.vfsWasiConfigModule)};`
                : "";
            const configValue = options.vfsWasiConfigModule ? ", resolveRoot" : "";
            return `
${configImport}
import * as preopens from "wasi:filesystem/preopens@0.2.12";
import { createWasiVfs } from ${JSON.stringify(implementation)};
const vfs = createWasiVfs({ preopens${configValue} });
export default vfs;
export const { create, VirtualFileSystem, VirtualProvider, MemoryProvider, RealFSProvider } = vfs;
`;
        },
        () => {
            if (options.vfsWasiConfigModule && via !== "wasi-filesystem") {
                throw new Error("VFS storage configuration requires --with-nodejs-vfs-via wasi-filesystem");
            }
            if (via === "wasi-filesystem") {
                for (const entry of worldMetadata.imports) {
                    if (entry.namespace !== "wasi" || entry.package !== "filesystem" || !entry.version) {
                        continue;
                    }
                    const { major, minor, patch } = entry.version;
                    if (major !== 0n || minor !== 2n || patch !== 12n) {
                        throw new Error(
                            "node:vfs via wasi-filesystem requires wasi:filesystem@0.2.12; remove conflicting imported versions",
                        );
                    }
                }
            }
            for (const requirement of via === "direct" ? [VFS_WIT_REQUIREMENT] : VFS_WASI_FILESYSTEM_WIT_REQUIREMENTS) {
                options.onWitRequirement?.(requirement);
            }
        },
    );
}
