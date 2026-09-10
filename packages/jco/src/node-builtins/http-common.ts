import { wasiSocketsProviderSource, requireWasiHttpVersion } from "./wasi-sockets.js";
import { type NodejsHttpVia } from "./types.js";
import {
    type NodeWitRequirement,
    HTTPS_WIT_REQUIREMENT,
    TLS_WIT_REQUIREMENT,
    HTTP_WIT_REQUIREMENT,
    HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS,
    HTTP_WASI_SOCKETS_WIT_REQUIREMENTS,
    HTTPS_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS,
    HTTP_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS,
    HTTPS_WASI_HTTP_WIT_REQUIREMENTS,
    HTTP_WASI_HTTP_WIT_REQUIREMENTS,
} from "../node-wit.js";
import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";

const HTTP_EXPORTS = [
    "Agent",
    "ClientRequest",
    "CloseEvent",
    "IncomingMessage",
    "METHODS",
    "MessageEvent",
    "OutgoingMessage",
    "STATUS_CODES",
    "Server",
    "ServerResponse",
    "WebSocket",
    "_connectionListener",
    "createServer",
    "get",
    "globalAgent",
    "maxHeaderSize",
    "request",
    "setGlobalProxyFromEnv",
    "setMaxIdleHTTPParsers",
    "validateHeaderName",
    "validateHeaderValue",
] as const;

/** `node:https` at the pinned release: six exports, no deprecated members. */
const HTTPS_EXPORTS = ["Agent", "Server", "createServer", "get", "globalAgent", "request"] as const;

/** The two protocol modules share one core, one implementation set, and one host interface. */
type HttpProtocol = "http" | "https";

const PROTOCOL_EXPORTS: Record<HttpProtocol, readonly string[]> = {
    http: HTTP_EXPORTS,
    https: HTTPS_EXPORTS,
};

/** Factory exported by the protocol's core module (`createHttp` / `createHttps`). */
const PROTOCOL_FACTORY: Record<HttpProtocol, string> = { http: "createHttp", https: "createHttps" };

function protocolExports(protocol: HttpProtocol, moduleExpression: string): string {
    return `
const ${protocol} = ${moduleExpression};
export default ${protocol};
export const { ${PROTOCOL_EXPORTS[protocol].join(", ")} } = ${protocol};
`;
}

function protocolDirectAdapter(protocol: HttpProtocol, entryModule: string): string {
    return `
import direct from ${JSON.stringify(entryModule)};
${protocolExports(protocol, "direct")}
`;
}

function protocolWasiSocketsAdapter(
    protocol: HttpProtocol,
    coreModule: string,
    implementationModule: string,
    version: string,
): string {
    const factory = PROTOCOL_FACTORY[protocol];
    const provider = wasiSocketsProviderSource(version);
    const tlsImports = protocol === "https" ? 'import * as tls from "jco:node/tls@0.1.0";' : "";
    const providerValue = protocol === "https" ? `{ ...${provider.value}, tls }` : provider.value;
    return `
${provider.imports}
${tlsImports}
import { ${factory} } from ${JSON.stringify(coreModule)};
import { createWasiSocketsHttpImplementation } from ${JSON.stringify(implementationModule)};
${protocolExports(protocol, `${factory}(createWasiSocketsHttpImplementation(${providerValue}))`)}
`;
}

function protocolWasiHttpAdapter(protocol: HttpProtocol, coreModule: string, implementationModule: string): string {
    const factory = PROTOCOL_FACTORY[protocol];
    return `
import * as outgoingHandler from "wasi:http/outgoing-handler@0.2.12";
import * as types from "wasi:http/types@0.2.12";
import { ${factory} } from ${JSON.stringify(coreModule)};
import { createWasiHttpImplementation } from ${JSON.stringify(implementationModule)};
${protocolExports(protocol, `${factory}(createWasiHttpImplementation({ outgoingHandler, types }))`)}
`;
}

/** WIT requirements for one protocol module under one `--with-nodejs-http-via` selection. */
function protocolWitRequirements(
    protocol: HttpProtocol,
    via: NodejsHttpVia,
    wasiSocketsVersion: string,
): readonly NodeWitRequirement[] {
    const https = protocol === "https";
    if (via === "direct") {
        return https
            ? [HTTPS_WIT_REQUIREMENT, { ...TLS_WIT_REQUIREMENT, nodeSpecifier: "node:https", guestExports: [] }]
            : [HTTP_WIT_REQUIREMENT];
    }
    if (via === "wasi-sockets") {
        if (wasiSocketsVersion === "0.2.12") {
            return https ? HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS : HTTP_WASI_SOCKETS_WIT_REQUIREMENTS;
        }
        return https ? HTTPS_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS : HTTP_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS;
    }
    return https ? HTTPS_WASI_HTTP_WIT_REQUIREMENTS : HTTP_WASI_HTTP_WIT_REQUIREMENTS;
}

export function createProtocolBuiltin(
    { options, worldMetadata }: BuiltinContext,
    protocol: HttpProtocol,
): BuiltinAdapter {
    const via = options.nodejsHttpVia ?? "direct";
    const socketsVersion = options.wasiSocketsVersion ?? "0.2.12";
    return builtin(
        "node:" + protocol,
        () => {
            if (via === "direct") {
                return protocolDirectAdapter(
                    protocol,
                    protocol === "http"
                        ? stdModule(options.httpModule, "http")
                        : stdModule(options.httpsModule, "https"),
                );
            }
            const core =
                protocol === "http"
                    ? stdModule(options.httpCoreModule, "http/core")
                    : stdModule(options.httpsCoreModule, "https/core");
            return via === "wasi-sockets"
                ? protocolWasiSocketsAdapter(
                      protocol,
                      core,
                      stdModule(options.httpWasiSocketsImplementationModule, "http/impl/wasi-sockets"),
                      socketsVersion,
                  )
                : protocolWasiHttpAdapter(
                      protocol,
                      core,
                      stdModule(options.httpWasiHttpImplementationModule, "http/impl/wasi-http"),
                  );
        },
        (specifier) => {
            if (via !== "direct") {
                requireWasiHttpVersion(
                    worldMetadata,
                    specifier,
                    via,
                    via === "wasi-sockets" ? socketsVersion : "0.2.12",
                );
            }
            for (const requirement of protocolWitRequirements(protocol, via, socketsVersion)) {
                options.onWitRequirement?.(requirement);
            }
        },
    );
}
