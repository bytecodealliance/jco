import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { P3_COMPONENT_FIXTURES_DIR } from "../../common.js";
import { setupAsyncTest } from "../../helpers.js";

const CHAIN_HTTP_HELPER_MODULE = new URL("./chain-http.js", import.meta.url).href;
const P3_CLI_FIXTURE_OUTPUT_DIR = fileURLToPath(new URL("../../output/p3-cli-fixtures", import.meta.url));
const P3_HANDLER_FIXTURE_OUTPUT_DIR = fileURLToPath(new URL("../../output/p3-handler-fixtures", import.meta.url));

export const P3_CLI_RUN_FIXTURES = [
    { path: "cli/p3-cli-hello-stdout-post-return.wasm" },
    { path: "cli/p3-cli-hello-stdout.wasm" },
    { path: "cli/p3-cli-much-stdout.wasm", args: ["p3_cli_much_stdout.component", "hello, world\n", "1"] },
    { path: "cli/p3-cli.wasm", args: ["p3_cli.component", "."] },
    { path: "clocks/p3-clocks-sleep.wasm" },
    { path: "fs/p3-file-write.wasm" },
    { path: "fs/p3-filesystem-file-read-write.wasm" },
    { path: "fs/p3-readdir.wasm" },
    { path: "http/p3-http-outbound-request-get.wasm" },
    { path: "http/p3-http-outbound-request-invalid-dnsname.wasm" },
    { path: "http/p3-http-outbound-request-invalid-header.wasm" },
    { path: "http/p3-http-outbound-request-invalid-port.wasm" },
    { path: "http/p3-http-outbound-request-invalid-version.wasm" },
    { path: "http/p3-http-outbound-request-missing-path-and-query.wasm" },
    { path: "http/p3-http-outbound-request-post.wasm" },
    { path: "http/p3-http-outbound-request-put.wasm" },
    { path: "http/p3-http-outbound-request-timeout.wasm" },
    { path: "http/p3-http-outbound-request-unknown-method.wasm" },
    { path: "http/p3-http-outbound-request-unsupported-scheme.wasm" },
    { path: "random/p3-random-imports.wasm" },
    { path: "sockets/p3-sockets-ip-name-lookup.wasm" },
    { path: "sockets/p3-sockets-tcp-bind.wasm" },
    { path: "sockets/p3-sockets-tcp-connect.wasm" },
    { path: "sockets/p3-sockets-tcp-listen.wasm" },
    { path: "sockets/p3-sockets-tcp-sample-application.wasm" },
    { path: "sockets/p3-sockets-tcp-sockopts.wasm" },
    { path: "sockets/p3-sockets-tcp-states.wasm" },
    { path: "sockets/p3-sockets-tcp-streams.wasm" },
    { path: "sockets/p3-sockets-udp-bind.wasm" },
    { path: "sockets/p3-sockets-udp-connect.wasm" },
    { path: "sockets/p3-sockets-udp-receive.wasm" },
    { path: "sockets/p3-sockets-udp-sample-application.wasm" },
    { path: "sockets/p3-sockets-udp-send.wasm" },
    { path: "sockets/p3-sockets-udp-sockopts.wasm" },
    { path: "sockets/p3-sockets-udp-states.wasm" },
    // currently failing
    { path: "http/p3-http-outbound-request-content-length.wasm", failing: true },
    { path: "http/p3-http-outbound-request-large-post.wasm", failing: true },
    { path: "http/p3-http-outbound-request-response-build.wasm" },
];

function withExtraHeaders(payload, headers) {
    return { ...payload, headers: { ...payload.headers, ...headers } };
}

const REQUEST = {
    headers: { foo: "bar" },
    body: "And the mome raths outgrabe",
    trailers: { fizz: "buzz" },
};

const POST_REQUEST = {
    ...REQUEST,
    method: "POST",
    pathWithQuery: "/post",
    headers: { ...REQUEST.headers, "content-length": String(Buffer.byteLength(REQUEST.body)) },
};

export const P3_HANDLER_RUN_FIXTURES = [
    {
        path: "http/p3-http-echo.wasm",
        outbound: REQUEST,
        expect: REQUEST,
    },
    {
        path: "http/p3-http-echo.wasm",
        title: "host-to-host",
        outbound: withExtraHeaders(REQUEST, { "x-host-to-host": "true" }),
        expect: REQUEST,
    },
    {
        path: "http/p3-api-proxy.wasm",
        expect: { body: "hello, world!" },
    },
    {
        path: "cli/p3-cli-serve-hello-world.wasm",
        expect: { body: "Hello, WASI!" },
    },
    {
        path: "http/p3-http-middleware.wasm",
        outbound: REQUEST,
        expect: REQUEST,
    },
    {
        path: "http/p3-http-middleware-with-chain.wasm",
        outbound: REQUEST,
        expect: REQUEST,
        map: { "local:local/chain-http": CHAIN_HTTP_HELPER_MODULE },
    },
    {
        path: "http/p3-http-proxy.wasm",
        outbound: ({ server }) =>
            withExtraHeaders(POST_REQUEST, {
                url: `http://${server.address}/proxy`,
            }),
        expect: {
            body: REQUEST.body,
            headers: {
                "x-wasmtime-test-method": "POST",
                "x-wasmtime-test-uri": "/proxy",
            },
        },
    },
];

export function fixtureTestName(fixture) {
    const label = fixture.title
        ? `${basename(fixture.path, ".wasm")} (${fixture.title})`
        : basename(fixture.path, ".wasm");
    return fixture.failing ? `${label} (currently failing)` : label;
}

function outputDirFor(fixture) {
    const base = fixture.path.replace(/[/\\]/g, "__").replace(/\.wasm$/, "");
    return fixture.title ? `${base}__${fixture.title.replace(/[^A-Za-z0-9_-]/g, "-")}` : base;
}

async function setupP3Fixture({ fixture, outputRootDir, asyncExports, preopen = false }) {
    const outputDir = join(outputRootDir, outputDirFor(fixture));
    const preopenDir = preopen ? join(outputDir, "preopen") : null;
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(preopenDir ?? outputDir, { recursive: true });

    let cleanup;
    try {
        const setup = await setupAsyncTest({
            asyncMode: "jspi",
            component: {
                path: join(P3_COMPONENT_FIXTURES_DIR, fixture.path),
                outputDir,
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        instantiation: null,
                        asyncExports,
                        map: fixture.map,
                    },
                },
            },
        });
        cleanup = setup.cleanup;
        return { setup, cleanup, preopenDir };
    } catch (err) {
        await cleanup?.();
        throw err;
    }
}

export async function setupP3CliFixture(fixture) {
    const { setup, cleanup, preopenDir } = await setupP3Fixture({
        fixture,
        outputRootDir: P3_CLI_FIXTURE_OUTPUT_DIR,
        asyncExports: ["wasi:cli/run#run"],
        preopen: true,
    });

    return {
        esModuleHref: setup.esModuleSourcePathURL.href,
        preopenDir,
        runnerArgs: fixture.args ?? [basename(fixture.path, ".wasm")],
        cleanup,
    };
}

export async function setupP3HandlerFixture(fixture) {
    const { setup, cleanup } = await setupP3Fixture({
        fixture,
        outputRootDir: P3_HANDLER_FIXTURE_OUTPUT_DIR,
        asyncExports: ["wasi:http/handler#handle"],
    });

    return { esModule: setup.esModule, cleanup };
}
