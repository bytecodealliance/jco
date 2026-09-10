import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { bundleNodeGuestExportsWrapper } from "../../src/cmd/componentize.js";
import { TLS_WIT_REQUIREMENT, HTTP_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { exec, getTmpDir, jcoPath, setupAsyncTest } from "../helpers.js";
import { hasJspi } from "../common.js";
import { withDefaultNodeCapabilities } from "../../src/cmd/transpile.js";

const fixture = fileURLToPath(new URL("../fixtures/componentize/node-tls/", import.meta.url));
const std = fileURLToPath(new URL("../../../jco-std/", import.meta.url));
const impl = join(std, "dist/wasi/0.2.x/node/24.x.x");
const certificate = join(std, "test/wasi/0.2.x/node/24.x.x/https/helpers/tls/localhost");

test.concurrent("node:tls declares its primary capability and opt-in callback binding mode", () => {
    const requirements = [];
    const plugin = nodeBuiltinPlugin(
        { imports: [], exports: [] },
        {
            tlsModule: "/tls.js",
            onWitRequirement: (requirement) => requirements.push(requirement),
        },
    );
    const id = plugin.resolveId("node:tls");
    expect(plugin.load(id)).toContain('export * from "/tls.js"');
    expect(plugin.resolveId("tls")).toBeNull();
    expect(requirements).toEqual([TLS_WIT_REQUIREMENT]);
    expect(withDefaultNodeCapabilities({ map: { "jco:node/tls@0.1.0": "/my-tls.js" } })).toMatchObject({
        asyncMode: "jspi",
        asyncExports: ["*"],
        map: { "jco:node/tls@0.1.0": "/my-tls.js" },
    });
});

test.concurrent("documentation echo fixture also runs unchanged on native Node", async () => {
    const { run } = await import("../fixtures/componentize/node-tls/source.js");
    const [key, cert] = await Promise.all([
        readFile(certificate + ".key", "utf8"),
        readFile(certificate + ".crt", "utf8"),
    ]);
    const report = JSON.parse(await run(key, cert));
    expect(report.echo).toBe("welcome!\nhello from a component\n");
    expect(report.inspection).toMatchObject({ authorized: true, issuerCycle: true, buffer: true, alpn: "echo" });
});

test.concurrent.each([true, false])(
    "retains TLS callbacks and shared WIT dependencies (TLS first: %s)",
    async (tlsFirst) => {
        const dir = await getTmpDir();
        await writeFile(join(dir, "world.wit"), "package test:tls; world component {}\n");
        const configOnly = { ...TLS_WIT_REQUIREMENT, nodeSpecifier: "node:https", guestExports: [] };
        const requirements = tlsFirst
            ? [TLS_WIT_REQUIREMENT, HTTP_WIT_REQUIREMENT, configOnly]
            : [configOnly, HTTP_WIT_REQUIREMENT, TLS_WIT_REQUIREMENT];
        const result = await injectNodeWitImports(dir, undefined, requirements);
        expect(result.exports).toEqual(
            expect.arrayContaining(["jco:node/tls-callbacks@0.1.0", "jco:node/http-callbacks@0.1.0"]),
        );
        expect(await readFile(join(dir, "deps/jco-node-0.1.0/http.wit"), "utf8")).toContain("context-id: u32");
        expect(await readFile(join(dir, "deps/jco-node-0.1.0/tls.wit"), "utf8")).toContain("use wasi:tls/types");
        expect(await injectNodeWitImports(dir, undefined, requirements)).toBeUndefined();
    },
);

async function documentationExample(backend) {
    const dir = await getTmpDir();
    const source = await bundleNodeGuestExportsWrapper(
        join(fixture, "source.js"),
        [...TLS_WIT_REQUIREMENT.guestExports, ...HTTP_WIT_REQUIREMENT.guestExports],
        {
            external: [/^jco:node\//],
            plugins: [
                nodeBuiltinPlugin(
                    { imports: [], exports: [] },
                    {
                        tlsModule: join(impl, "tls.js"),
                        streamSchedulerModule: join(impl, "stream/scheduler.js"),
                        streamEmitterModule: join(impl, "stream/emitter.js"),
                        httpsModule: join(impl, "https.js"),
                        httpModule: join(impl, "http.js"),
                    },
                ),
            ],
        },
    );
    await writeFile(join(dir, "source.js"), source);
    await writeFile(
        join(dir, "world.wit"),
        `package test:tls;\nworld component { import wasi:io/streams@0.2.12; import wasi:io/poll@0.2.12; import wasi:io/error@0.2.12; import wasi:tls/types@0.2.0-draft; export start: func(key: string, cert: string); export status: func() -> string; export denied: func() -> string; export start-https: func(key: string, cert: string) -> u32; export stop-https: func(); export fetch-https: func(port: u32, cert: string) -> string; }\n`,
    );
    await injectNodeWitImports(dir, undefined, [TLS_WIT_REQUIREMENT, HTTP_WIT_REQUIREMENT]);
    const path = join(dir, "component.wasm");
    await exec(jcoPath, "componentize", join(dir, "source.js"), "-w", dir, "-o", path, "--backend", backend, {
        closeStdin: true,
    });
    const { esModuleOutputPath, cleanup } = await setupAsyncTest({
        component: { path, name: `tls-${backend}`, skipInstantiation: true },
        jco: {
            transpile: {
                extraArgs: {
                    asyncMode: "jspi",
                    asyncExports: ["*"],
                    asyncImports: [
                        "request",
                        "[method]server.listen",
                        "[method]server.close",
                        "[method]server.get-connections",
                    ].map((name) => `jco:node/http@0.1.0#${name}`),
                },
            },
        },
    });
    try {
        const { stdout } = await exec(
            join(fixture, "run.js"),
            esModuleOutputPath,
            join(impl, "tls/host-node.js"),
            certificate + ".key",
            certificate + ".crt",
        );
        const report = JSON.parse(stdout);
        expect(report.echo).toBe("welcome!\nhello from a component\n");
        expect(report.inspection).toMatchObject({
            authorized: true,
            alpn: "echo",
            encrypted: true,
            cipher: true,
            certificate: true,
            issuerCycle: true,
            verified: true,
            mismatch: "ERR_TLS_CERT_ALTNAME_INVALID",
            keyingMaterial: 32,
            maxFragment: true,
            localPort: true,
            remotePort: true,
        });
        expect(report.identities).toBe(true);
        expect(report.ticketKeys).toBe(48);
        expect(report.https).toEqual({ client: "native HTTPS", server: "component HTTPS" });
    } finally {
        await cleanup();
    }
}

test.skipIf(!hasJspi).concurrent(
    "TLS documentation echo examples execute in StarlingMonkey",
    () => documentationExample("starlingmonkey"),
    60_000,
);
// TODO(unskip): componentize-qjs cannot link the TLS interface's shared WASI IO resource types.
test.skip("TLS documentation echo examples execute in QuickJS", () => documentationExample("quickjs"), 60_000);
