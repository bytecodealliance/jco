import { wasiSocketsProviderSource, requireWasiHttpVersion } from "./wasi-sockets.js";
import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { NET_WASI_SOCKETS_WIT_REQUIREMENTS, NET_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS } from "../node-wit.js";

const NET_SPECIFIER = "node:net";

const NET_EXPORTS = [
    "BlockList",
    "BoundSocket",
    "Server",
    "Socket",
    "SocketAddress",
    "Stream",
    "_createServerHandle",
    "_normalizeArgs",
    "connect",
    "createConnection",
    "createServer",
    "getDefaultAutoSelectFamily",
    "getDefaultAutoSelectFamilyAttemptTimeout",
    "isIP",
    "isIPv4",
    "isIPv6",
    "setDefaultAutoSelectFamily",
    "setDefaultAutoSelectFamilyAttemptTimeout",
] as const;

function netAdapter(coreModule: string, version: string): string {
    const provider = wasiSocketsProviderSource(version);
    return `
${provider.imports}
import { createNet } from ${JSON.stringify(coreModule)};
const net = createNet(${provider.value});
export default net;
export const { ${NET_EXPORTS.join(", ")} } = net;
`;
}

export function createNetBuiltin({ options, worldMetadata }: BuiltinContext): BuiltinAdapter {
    const socketsVersion = options.wasiSocketsVersion ?? "0.2.12";
    return builtin(
        NET_SPECIFIER,
        () => netAdapter(stdModule(options.netCoreModule, "net/core"), socketsVersion),
        () => {
            requireWasiHttpVersion(worldMetadata, NET_SPECIFIER, "wasi-sockets", socketsVersion);
            for (const requirement of socketsVersion === "0.2.12"
                ? NET_WASI_SOCKETS_WIT_REQUIREMENTS
                : NET_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS) {
                options.onWitRequirement?.(requirement);
            }
        },
    );
}
