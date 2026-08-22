import { env } from "node:process";

import { suite, test, assert } from "vitest";

import { createRequestIsolatedHandler, getSandboxSetup } from "../src/cmd/run.js";

suite("Run sandbox", () => {
    test("preserves legacy behavior unless sandboxing is requested", () => {
        assert.strictEqual(getSandboxSetup({}), "");
    });

    test("requires sandbox mode for capability grants", () => {
        assert.throws(() => getSandboxSetup({ sandboxEnvSet: ["EXAMPLE=value"] }), /sandbox grants require --sandbox/);
    });

    test("starts sandbox mode without host capabilities", () => {
        const setup = getSandboxSetup({ sandbox: true });
        assert.include(setup, "_setEnv({})");
        assert.include(setup, "_setCwd(undefined)");
        assert.include(setup, "_setPreopens({})");
        assert.include(setup, "_denyDnsLookup(); _denyTcp(); _denyUdp();");
    });

    test("configures explicit environment, filesystem, and network grants", () => {
        const previous = env.JCO_RUN_SANDBOX_TEST;
        env.JCO_RUN_SANDBOX_TEST = "inherited";
        try {
            const setup = getSandboxSetup({
                sandbox: true,
                sandboxEnvSet: ["JCO_RUN_SANDBOX_TEST", "EXPLICIT=value=with=equals"],
                sandboxFsPreopen: ["first::/workspace", "second::/cache", "third::/workspace"],
                sandboxNetInherit: true,
            });
            assert.include(setup, '"JCO_RUN_SANDBOX_TEST":"inherited"');
            assert.include(setup, '"EXPLICIT":"value=with=equals"');
            const first = setup.indexOf('_addPreopen("/workspace", "');
            const second = setup.indexOf('_addPreopen("/cache", "');
            const duplicate = setup.indexOf('_addPreopen("/workspace", "', first + 1);
            assert.isAtLeast(first, 0);
            assert.isAbove(second, first);
            assert.isAbove(duplicate, second);
            assert.notInclude(setup, "_denyDnsLookup()");
        } finally {
            if (previous === undefined) {
                delete env.JCO_RUN_SANDBOX_TEST;
            } else {
                env.JCO_RUN_SANDBOX_TEST = previous;
            }
        }
    });
});

suite("Serve request isolation", () => {
    test("creates a fresh component instance for every request", () => {
        let instantiations = 0;
        const handler = createRequestIsolatedHandler(
            () => {
                instantiations++;
                let requests = 0;
                return {
                    incomingHandler: {
                        handle() {
                            return ++requests;
                        },
                    },
                };
            },
            () => {
                throw new Error("unused test module loader");
            },
            () => ({}),
        );

        assert.strictEqual(handler.handle({}, {}), 1);
        assert.strictEqual(handler.handle({}, {}), 1);
        assert.strictEqual(instantiations, 2);
    });

    test("rejects instances without an incoming handler", () => {
        const handler = createRequestIsolatedHandler(
            () => ({}),
            () => {
                throw new Error("unused test module loader");
            },
            () => ({}),
        );
        assert.throws(() => handler.handle({}, {}), /Not a valid HTTP server component/);
    });
});
