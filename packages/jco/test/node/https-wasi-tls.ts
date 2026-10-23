import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createTlsServer } from "node:tls";
import { createServer as createTcpServer, type Socket } from "node:net";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { lt } from "semver";
import quickjsPackage from "componentize-qjs/package.json" with { type: "json" };
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const exec = promisify(execFile);
const fixture = new URL("../fixtures/componentize/node-https-wasi-tls/", import.meta.url);
const build = fileURLToPath(new URL("build.ts", fixture));
const runner = fileURLToPath(new URL("run.ts", fixture));
const cert = await readFile(new URL("certs/localhost.crt", fixture));
const key = await readFile(new URL("certs/localhost.key", fixture));

interface Resources {
    tls: number;
    streams: number;
    futures: number;
    polls: number;
    sockets: number;
}
interface RunResult {
    report: { status: number; body: string; error: string };
    handshakes: number;
    connections: number;
    before: Resources;
    after: Resources;
}
function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
function resources(value: unknown): value is Resources {
    return (
        record(value) &&
        ["tls", "streams", "futures", "polls", "sockets"].every((key) => typeof value[key] === "number")
    );
}
function parseResult(source: string): RunResult {
    const value: unknown = JSON.parse(source);
    if (
        !record(value) ||
        !record(value.report) ||
        typeof value.report.status !== "number" ||
        typeof value.report.body !== "string" ||
        typeof value.report.error !== "string" ||
        typeof value.handshakes !== "number" ||
        typeof value.connections !== "number" ||
        !resources(value.before) ||
        !resources(value.after)
    ) {
        throw new Error("Invalid guest report");
    }
    return {
        report: { status: value.report.status, body: value.report.body, error: value.report.error },
        handshakes: value.handshakes,
        connections: value.connections,
        before: value.before,
        after: value.after,
    };
}
function portOf(server: { address(): string | { port: number } | null }): number {
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Expected listening TCP server");
    }
    return address.port;
}
function expectVerifiedHttpsResponse(result: RunResult): void {
    expect(result.report.error, "Verified HTTPS request failed").toBe("");
    expect(result.report.status).toBeGreaterThanOrEqual(200);
    expect(result.report.status).toBeLessThan(600);
    expect(result.handshakes).toBe(1);
    expect(result.connections).toBeGreaterThanOrEqual(1);
    expect(result.after).toEqual(result.before);
}
function expectTlsImports(imports: string): void {
    expect(imports).toContain("import jco:node/tls@0.1.0");
    expect(imports).toContain("import wasi:tls/types@0.2.0-draft");
    expect(imports).toContain("import wasi:sockets/tcp@");
    expect(imports).toContain("import wasi:io/streams@0.2.12");
    expect(imports).not.toContain("wasi:io/streams@0.2.6");
    expect(imports).not.toContain("jco:tls-streams");
    expect(imports).not.toContain("import jco:node/http@");
    expect(imports).not.toContain("import wasi:http/outgoing-handler@");
}
async function run(root: string, url: string, policy = "trusted", body = "", servername = ""): Promise<RunResult> {
    try {
        const result = await exec(process.execPath, [runner, root, url, policy, body, servername], {
            timeout: 20_000,
            maxBuffer: 1_000_000,
        });
        return parseResult(result.stdout.trim());
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const stderr = record(error) && "stderr" in error ? String(error.stderr) : "";
        throw new Error(
            `HTTPS component execution failed for ${url}; check DNS/TCP access and TLS trust. ${message}\n${stderr}`,
            { cause: error },
        );
    }
}

for (const backend of ["starlingmonkey"]) {
    describe(`node:https over wasi:sockets + wasi:tls (${backend})`, () => {
        let root: string;
        beforeAll(async () => {
            root = await mkdtemp(join(tmpdir(), "jco-https-tls-"));
            await exec(process.execPath, [build, root, backend], { timeout: 180_000, maxBuffer: 2_000_000 });
            expectTlsImports(await readFile(join(root, "imports.wit"), "utf8"));
        }, 190_000);
        afterAll(async () => {
            if (root) {
                await rm(root, { recursive: true, force: true });
            }
        });

        test.concurrent("public network: verified GET https://example.com/", async () => {
            // Intentionally enabled: this case needs public DNS and outbound TCP/443.
            const result = await run(root, "https://example.com/", "public");
            // A valid HTTP error response still proves TLS transport succeeded.
            // The local cases below check exact status codes and response bodies.
            expectVerifiedHttpsResponse(result);
        }, 25_000);

        test.concurrent.each([
            ["verified custom host CA, SNI, ALPN, and fragmented response", "trusted", "localhost", "", true, 200],
            ["HTTP 503 is a verified HTTPS response", "trusted", "localhost", "", true, 503],
            ["fragmented large request writes", "trusted", "localhost", "large", true, 200],
            ["untrusted certificate", "public", "localhost", "", false, 200],
            ["hostname mismatch", "trusted", "wrong.example", "", false, 200],
            ["missing TLS capability without plaintext fallback", "denied", "localhost", "", false, 200],
        ])(
            "%s",
            async (_name, policy, servername, body, success, status) => {
                const peers = new Set<Socket>();
                let secureConnections = 0;
                let negotiated: { servername: string | false | null; alpn: string | false | null } | undefined;
                let received = 0;
                const responseBody = status === 503 ? "temporarily unavailable" : "hello verified TLS";
                const server = createTlsServer({ cert, key, ALPNProtocols: ["http/1.1"] }, (socket) => {
                    secureConnections++;
                    negotiated = { servername: socket.servername, alpn: socket.alpnProtocol };
                    let bytes = Buffer.alloc(0);
                    let responded = false;
                    socket.on("data", (chunk) => {
                        bytes = Buffer.concat([bytes, chunk]);
                        const end = bytes.indexOf("\r\n\r\n");
                        if (end < 0) {
                            return;
                        }
                        received = bytes.length - end - 4;
                        if (responded || (body === "large" && received < 150_000)) {
                            return;
                        }
                        responded = true;
                        const response = Buffer.from(
                            `HTTP/1.1 ${status} ${status === 503 ? "Service Unavailable" : "OK"}\r\nContent-Length: ${Buffer.byteLength(responseBody)}\r\nConnection: close\r\n\r\n${responseBody}`,
                        );
                        let offset = 0;
                        function fragment(): void {
                            if (socket.destroyed) {
                                return;
                            }
                            if (offset === response.length) {
                                socket.end();
                                return;
                            }
                            const next = Math.min(offset + 3, response.length);
                            socket.write(response.subarray(offset, next));
                            offset = next;
                            setImmediate(fragment);
                        }
                        fragment();
                    });
                });
                server.on("connection", (peer) => {
                    peers.add(peer);
                    peer.on("close", () => peers.delete(peer));
                });
                server.on("tlsClientError", () => {});
                server.listen(0, "127.0.0.1");
                await once(server, "listening");
                try {
                    const result = await run(root, `https://127.0.0.1:${portOf(server)}/`, policy, body, servername);
                    expect(result.after).toEqual(result.before);
                    if (success) {
                        expectVerifiedHttpsResponse(result);
                        expect(result.report).toEqual({ status, body: responseBody, error: "" });
                        expect(negotiated).toEqual({ servername: "localhost", alpn: "http/1.1" });
                        expect(secureConnections).toBe(1);
                        if (body) {
                            expect(received).toBe(150_000);
                        }
                    } else {
                        expect(result.report.status).toBe(0);
                        expect(result.report.error).toMatch(
                            policy === "denied" ? /jco:node\/tls.*TLS capability/ : /TLS handshake failed/,
                        );
                        if (policy === "public") {
                            expect(result.report.error).toMatch(/certificate/i);
                        }
                        if (servername === "wrong.example") {
                            expect(result.report.error).toMatch(/Hostname\/IP does not match|not in the cert/);
                        }
                        expect(secureConnections).toBe(0);
                        expect(result.handshakes).toBe(policy === "denied" ? 0 : 1);
                        if (policy === "denied") {
                            expect(result.connections).toBe(0);
                        }
                    }
                } finally {
                    for (const peer of peers) {
                        peer.destroy();
                    }
                    await new Promise<void>((resolve) => server.close(() => resolve()));
                }
            },
            25_000,
        );

        test.concurrent("plain HTTP keeps using TCP without a TLS handshake", async () => {
            const server = createHttpServer((_request, response) => response.end("plain HTTP"));
            server.listen(0, "127.0.0.1");
            await once(server, "listening");
            try {
                const result = await run(root, `http://127.0.0.1:${portOf(server)}/`, "denied");
                expect(result.report).toEqual({ status: 200, body: "plain HTTP", error: "" });
                expect(result.handshakes).toBe(0);
                expect(result.after).toEqual(result.before);
            } finally {
                await new Promise<void>((resolve) => server.close(() => resolve()));
            }
        });

        test.concurrent("connection refusal releases socket resources", async () => {
            const server = createTcpServer();
            server.listen(0, "127.0.0.1");
            await once(server, "listening");
            const port = portOf(server);
            await new Promise<void>((resolve) => server.close(() => resolve()));
            const result = await run(root, `https://127.0.0.1:${port}/`);
            expect(result.report.status).toBe(0);
            expect(result.report.error).toContain("ECONNREFUSED");
            expect(result.handshakes).toBe(0);
            expect(result.after).toEqual(result.before);
        });

        test.concurrent.each(["reset", "stalled handshake"])(
            "cleans up after %s",
            async (kind) => {
                const peers = new Set<Socket>();
                const server = createTcpServer((socket) => {
                    peers.add(socket);
                    socket.on("close", () => peers.delete(socket));
                    if (kind === "reset") {
                        socket.destroy();
                    }
                });
                server.listen(0, "127.0.0.1");
                await once(server, "listening");
                try {
                    const result = await run(root, `https://127.0.0.1:${portOf(server)}/`, "trusted", "", "localhost");
                    expect(result.report.status).toBe(0);
                    expect(result.report.error).toMatch(/TLS handshake failed/);
                    expect(result.after).toEqual(result.before);
                } finally {
                    for (const peer of peers) {
                        peer.destroy();
                    }
                    await new Promise<void>((resolve) => server.close(() => resolve()));
                }
            },
            25_000,
        );
    });
}

test.concurrent("QuickJS TLS componentization", async () => {
    const root = await mkdtemp(join(tmpdir(), "jco-https-tls-qjs-"));
    try {
        const buildResult = exec(process.execPath, [build, root, "quickjs"], {
            timeout: 180_000,
            maxBuffer: 2_000_000,
        });
        // Before 0.5.0, QuickJS cannot link the shared TLS/IO resources.
        if (lt(quickjsPackage.version, "0.5.0")) {
            await expect(buildResult).rejects.toThrow(/wasi:tls.*mismatched resource types/);
        } else {
            await buildResult;
            expectTlsImports(await readFile(join(root, "imports.wit"), "utf8"));
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}, 190_000);
