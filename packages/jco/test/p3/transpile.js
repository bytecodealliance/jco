import { env } from "node:process";
import { join, basename } from "node:path";
import { readFile } from "node:fs/promises";

import { suite, test, assert } from "vitest";

import { transpile } from "../../src/api";

import { P3_COMPONENT_FIXTURES_DIR } from "../common.js";

const P3_FIXTURE_COMPONENTS = [
    "backpressure/async-backpressure-callee.wasm",
    "backpressure/async-backpressure-caller.wasm",

    "sockets/p3-sockets-ip-name-lookup.wasm",
    "sockets/tcp/p3-sockets-tcp-bind.wasm",
    "sockets/tcp/p3-sockets-tcp-connect.wasm",
    "sockets/tcp/p3-sockets-tcp-sample-application.wasm",
    "sockets/tcp/p3-sockets-tcp-sockopts.wasm",
    "sockets/tcp/p3-sockets-tcp-states.wasm",
    "sockets/tcp/p3-sockets-tcp-streams.wasm",
    "sockets/udp/p3-sockets-udp-bind.wasm",
    "sockets/udp/p3-sockets-udp-connect.wasm",
    "sockets/udp/p3-sockets-udp-sample-application.wasm",
    "sockets/udp/p3-sockets-udp-sockopts.wasm",
    "sockets/udp/p3-sockets-udp-states.wasm",

    "fs/p3-filesystem-file-read-write.wasm",

    "yield/async-yield-callee-stackless.wasm",
    "yield/async-yield-callee-synchronous.wasm",
    "yield/async-yield-caller-cancel.wasm",
    "yield/async-yield-caller.wasm",

    "cli/p3-cli.wasm",

    "general/async-post-return-callee.wasm",
    "general/async-post-return-caller.wasm",

    "general/async-sleep-post-return-callee.wasm",
    "general/async-sleep-post-return-caller.wasm",

    "general/async-borrowing-callee.wasm",
    "general/async-borrowing-caller.wasm",
    "general/async-intertask-communication.wasm",
    "general/async-transmit-callee.wasm",
    "general/async-transmit-caller.wasm",

    "round-trip/async-round-trip-direct-stackless.wasm",
    "round-trip/async-round-trip-many-stackful.wasm",
    "round-trip/async-round-trip-many-stackless.wasm",
    "round-trip/async-round-trip-many-synchronous.wasm",
    "round-trip/async-round-trip-many-wait.wasm",
    "round-trip/async-round-trip-stackful.wasm",
    "round-trip/async-round-trip-stackless-sync-import.wasm",
    "round-trip/async-round-trip-stackless.wasm",
    "round-trip/async-round-trip-synchronous.wasm",
    "round-trip/async-round-trip-wait.wasm",

    "backpressure/async-backpressure-caller.wasm",
    "backpressure/async-backpressure-callee.wasm",

    "http/p3-api-proxy.wasm",
    "http/p3-http-echo.wasm",
    "http/p3-http-middleware-with-chain.wasm",
    "http/p3-http-middleware.wasm",
    "http/p3-http-outbound-request-content-length.wasm",
    "http/p3-http-outbound-request-get.wasm",
    "http/p3-http-outbound-request-invalid-dnsname.wasm",
    "http/p3-http-outbound-request-invalid-header.wasm",
    "http/p3-http-outbound-request-invalid-port.wasm",
    "http/p3-http-outbound-request-invalid-version.wasm",
    "http/p3-http-outbound-request-large-post.wasm",
    "http/p3-http-outbound-request-missing-path-and-query.wasm",
    "http/p3-http-outbound-request-post.wasm",
    "http/p3-http-outbound-request-put.wasm",
    "http/p3-http-outbound-request-response-build.wasm",
    "http/p3-http-outbound-request-timeout.wasm",
    "http/p3-http-outbound-request-unknown-method.wasm",
    "http/p3-http-outbound-request-unsupported-scheme.wasm",

    "streams/async-closed-streams.wasm",
    "streams/async-read-resource-stream.wasm",
    "streams/async-unit-stream-callee.wasm",
    "streams/async-unit-stream-caller.wasm",

    "cancellation/async-cancel-caller.wasm",
    "cancellation/async-cancel-callee.wasm",

    "poll/async-poll-stackless.wasm",
    "poll/async-poll-synchronous.wasm",

    "random/p3-random-imports.wasm",

    "clocks/p3-clocks-sleep.wasm",

    "error-context/async-error-context.wasm",
    "error-context/async-error-context-callee.wasm",
    "error-context/async-error-context-caller.wasm",
];

suite("Transpile (WASI P3)", () => {
    if (env.TEST_P3_FIXTURE_TARGET) {
        console.error(
            `TEST_P3_FIXTURE_TARGET specified, only running components that match [${env.TEST_P3_FIXTURE_TARGET}]`,
        );
    }
    for (const componentRelPath of P3_FIXTURE_COMPONENTS) {
        const componentPath = join(P3_COMPONENT_FIXTURES_DIR, componentRelPath);
        const componentName = basename(componentPath);

        // Limit to a specific fixture if specified
        if (env.TEST_P3_FIXTURE_TARGET && env.TEST_P3_FIXTURE_TARGET !== componentName) {
            continue;
        }

        test.concurrent(`transpile [${componentName}]`, async () => {
            const { files } = await transpile(await readFile(componentPath));
            assert.isNotEmpty(files);
        });
    }
});
