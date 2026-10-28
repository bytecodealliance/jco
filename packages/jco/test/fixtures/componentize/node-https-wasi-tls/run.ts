import { createWasiTlsBridge } from "../../../../../jco-std/dist/wasi/0.2.x/node/24.x.x/tls/wasi.js";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as tls from "../../../../../jco-std/dist/wasi/0.2.x/node/24.x.x/tls-host-node.js";
import * as denied from "../../../../../jco-std/dist/wasi/0.2.x/node/24.x.x/tls-host.js";

// Resolve every shim import from the TLS provider so streams share its class
// identity and IO worker even when jco and jco-std depend on different versions.
const providerRequire = createRequire(
    new URL("../../../../../jco-std/dist/wasi/0.2.x/node/24.x.x/tls-host-node.js", import.meta.url),
);
function shimUrl(name: string): string {
    return pathToFileURL(providerRequire.resolve(`@bytecodealliance/preview2-shim/${name}`)).href;
}
const sockets: typeof import("@bytecodealliance/preview2-shim/sockets") = await import(shimUrl("sockets"));

const root = resolve(process.argv[2]);
const url = process.argv[3];
const policy = process.argv[4] ?? "trusted";
const body = process.argv[5] === "large" ? "a".repeat(150_000) : "";
const servername = process.argv[6] ?? "";
const ca = policy === "trusted" ? [await readFile(new URL("./certs/ca.crt", import.meta.url), "utf8")] : undefined;
let handshakes = 0;
let connections = 0;
const provider = tls.createTlsProvider({ ca, handshakeTimeoutMs: 1500 });
class CountedHandshake extends provider.ClientHandshake {
    constructor(...args: ConstructorParameters<typeof provider.ClientHandshake>) {
        super(...args);
        handshakes++;
    }
}
const imports: Record<string, unknown> = {};
for (const name of ["cli", "clocks", "filesystem", "http", "io", "random"]) {
    imports[name] = await import(shimUrl(name));
}
imports.sockets = {
    ...sockets,
    tcpCreateSocket: {
        createTcpSocket: (family: "ipv4" | "ipv6"): ReturnType<typeof sockets.tcpCreateSocket.createTcpSocket> => {
            connections++;
            return sockets.tcpCreateSocket.createTcpSocket(family);
        },
    },
};
imports.tls = policy === "denied" ? denied : { ...provider, ClientHandshake: CountedHandshake };
imports["node-tls"] = createWasiTlsBridge(
    policy === "denied" ? denied : { ...provider, ClientHandshake: CountedHandshake },
);
interface Report {
    status: number;
    body: string;
    error: string;
}
interface Guest {
    run(url: string, body: string, servername: string): Report | Promise<Report>;
}
const {
    instantiate,
}: {
    instantiate: (
        load: (path: string) => Promise<WebAssembly.Module>,
        imports: Record<string, unknown>,
    ) => Promise<Guest>;
} = await import(pathToFileURL(join(root, "guest.js")).href);
const guest = await instantiate(
    async (path: string): Promise<WebAssembly.Module> =>
        WebAssembly.compile(new Uint8Array(await readFile(join(root, path)))),
    imports,
);
const before = tls._resourceCounts();
const report = await guest.run(url, body, servername);
const after = tls._resourceCounts();
console.log(JSON.stringify({ report, handshakes, connections, before, after }));
