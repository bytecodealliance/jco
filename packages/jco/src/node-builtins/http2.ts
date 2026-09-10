import {
    VIRTUAL_PREFIX,
    type BuiltinContext,
    type BuiltinAdapter,
    composeBuiltins,
    virtualBuiltin,
    stdModule,
    builtin,
} from "./shared.js";
import { type NodejsHttp2Via } from "./types.js";
import { wasiSocketsProviderSource, requireWasiHttpVersion } from "./wasi-sockets.js";
import {
    HTTP2_WIT_REQUIREMENT,
    HTTP_WASI_SOCKETS_WIT_REQUIREMENTS,
    HTTP_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS,
} from "../node-wit.js";

const HTTP2_SPECIFIER = "node:http2";

export const HTTP2_CALLBACKS_SPECIFIER = "jco:node-http2-callbacks";

const HTTP2_CALLBACKS_MODULE = `${VIRTUAL_PREFIX}http2-callbacks`;

const HTTP2_EXPORTS = [
    "Http2ServerRequest",
    "Http2ServerResponse",
    "connect",
    "constants",
    "createSecureServer",
    "createServer",
    "getDefaultSettings",
    "getPackedSettings",
    "getUnpackedSettings",
    "performServerHandshake",
    "sensitiveHeaders",
] as const;

function http2Exports(moduleExpression: string): string {
    return `
const http2 = ${moduleExpression};
export default http2;
export const { ${HTTP2_EXPORTS.join(", ")} } = http2;
`;
}

function http2DirectAdapter(http2Module: string): string {
    return `
import directHttp2 from ${JSON.stringify(http2Module)};
${http2Exports("directHttp2")}
`;
}

/** Source for the guest-exported HTTP/2 callback interface used by the component entry wrapper. */
function http2CallbacksAdapter(http2Module: string): string {
    return `export { http2Callbacks } from ${JSON.stringify(http2Module)};`;
}

function http2PortableAdapter(
    coreModule: string,
    implementationModule: string,
    via: Exclude<NodejsHttp2Via, "direct">,
    version: string,
): string {
    const factory =
        via === "wasi-sockets" ? "createWasiSocketsHttp2Implementation" : "createWasiHttpHttp2Implementation";
    const provider = via === "wasi-sockets" ? wasiSocketsProviderSource(version) : undefined;
    return `
${provider?.imports ?? ""}
import { createHttp2 } from ${JSON.stringify(coreModule)};
import { ${factory} } from ${JSON.stringify(implementationModule)};
${http2Exports(`createHttp2(${factory}(${provider?.value ?? ""}))`)}
`;
}

export function createHttp2Builtin({ options, worldMetadata }: BuiltinContext): BuiltinAdapter {
    const via = options.nodejsHttp2Via ?? "direct";
    const socketsVersion = options.wasiSocketsVersion ?? "0.2.12";
    return composeBuiltins([
        virtualBuiltin(HTTP2_CALLBACKS_SPECIFIER, HTTP2_CALLBACKS_MODULE, () =>
            http2CallbacksAdapter(stdModule(options.http2Module, "http2")),
        ),
        builtin(
            HTTP2_SPECIFIER,
            () => {
                if (via === "direct") {
                    return http2DirectAdapter(stdModule(options.http2Module, "http2"));
                }
                return http2PortableAdapter(
                    stdModule(options.http2CoreModule, "http2/core"),
                    via === "wasi-sockets"
                        ? stdModule(options.http2WasiSocketsImplementationModule, "http2/impl/wasi-sockets")
                        : stdModule(options.http2WasiHttpImplementationModule, "http2/impl/wasi-http"),
                    via,
                    socketsVersion,
                );
            },
            () => {
                if (via === "direct") {
                    options.onWitRequirement?.(HTTP2_WIT_REQUIREMENT);
                } else if (via === "wasi-sockets") {
                    requireWasiHttpVersion(worldMetadata, HTTP2_SPECIFIER, via, socketsVersion);
                    for (const requirement of socketsVersion === "0.2.12"
                        ? HTTP_WASI_SOCKETS_WIT_REQUIREMENTS
                        : HTTP_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS) {
                        options.onWitRequirement?.(requirement);
                    }
                }
            },
        ),
    ]);
}
