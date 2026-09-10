import { type WorldMetadata, type NodejsHttpVia } from "./types.js";

interface WasiSocketsProviderSource {
    imports: string;
    value: string;
}

/** Shared Preview 2 provider source used by net, HTTP/1, HTTP/2, and HTTPS adapters. */
export function wasiSocketsProviderSource(version: string): WasiSocketsProviderSource {
    const u64 = version === "0.2.10" ? "BigInt(value)" : "value";
    const schedule = version === "0.2.10" ? ", schedule: task => setTimeout(task, 0)" : "";
    return {
        imports: `
import * as instanceNetwork from "wasi:sockets/instance-network@${version}";
import * as ipNameLookup from "wasi:sockets/ip-name-lookup@${version}";
import * as tcpCreateSocket from "wasi:sockets/tcp-create-socket@${version}";`,
        value: `{ instanceNetwork, ipNameLookup, tcpCreateSocket, u64: value => ${u64}${schedule} }`,
    };
}

export function requireWasiHttpVersion(
    worldMetadata: WorldMetadata,
    specifier: string,
    via: Exclude<NodejsHttpVia, "direct">,
    version = "0.2.12",
): void {
    const packageName = via === "wasi-http" ? "http" : "sockets";
    const incompatible = (worldMetadata.imports ?? []).find(
        (iface) =>
            iface.namespace === "wasi" &&
            iface.package === packageName &&
            iface.version !== null &&
            iface.version !== undefined &&
            `${iface.version.major}.${iface.version.minor}.${iface.version.patch}` !== version,
    );
    if (incompatible) {
        const { major, minor, patch } = incompatible.version!;
        throw new Error(
            `${specifier} via ${via} requires wasi:${packageName}@${version}, but the selected WIT world imports wasi:${packageName}@${major}.${minor}.${patch}`,
        );
    }
}
