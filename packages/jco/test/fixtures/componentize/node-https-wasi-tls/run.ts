import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as sockets from "../../../../../preview2-shim/dist/nodejs/sockets.js";
import * as tls from "../../../../../preview2-shim/dist/nodejs/tls.js";
import * as denied from "../../../../../jco-std/dist/wasi/0.2.x/node/24.x.x/tls-host.js";

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
    imports[name] = await import(new URL(`../../../../../preview2-shim/dist/nodejs/${name}.js`, import.meta.url).href);
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
imports.tls =
    policy === "denied"
        ? denied
        : { ...provider, ClientHandshake: CountedHandshake, adapt: tls.adapt, isAvailable: tls.isAvailable };
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
