import { env } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert } from "vitest";

import { createRequestIsolatedHandler, getSandboxSetup, run } from "../src/cmd/run.js";
import { exec, getTmpDir, jcoPath } from "./helpers.js";

suite("Run sandbox", () => {
    test("preserves legacy behavior unless sandboxing is requested", () => {
        const setup = getSandboxSetup({});
        assert.include(setup, "import { _setPreopens }");
        assert.include(setup, '_setPreopens({ "/":');
        assert.notInclude(setup, "_setEnv");
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

    test("preserves custom preopens for unsandboxed runs and removes them in sandbox mode", async () => {
        const testDir = await getTmpDir();
        const importPath = join(testDir, "virtualenv.mjs");
        const resultPath = join(testDir, "preopens.json");
        const componentPath = fileURLToPath(
            new URL("./fixtures/components/hello_stdout.component.wasm", import.meta.url),
        );
        await writeFile(
            importPath,
            `
                import { writeFileSync } from "node:fs";
                import { _setPreopens, preopens } from ${JSON.stringify(import.meta.resolve("@bytecodealliance/preview2-shim/filesystem"))};
                const initial = preopens.getDirectories().length;
                _setPreopens({ "/": ${JSON.stringify(testDir)} });
                const [[configured]] = preopens.getDirectories();
                process.on("exit", () => {
                    const current = preopens.getDirectories();
                    writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({
                        initial,
                        count: current.length,
                        preserved: current.length === 1 && current[0][0] === configured,
                    }));
                });
            `,
        );

        await exec(jcoPath, "run", "--jco-import", importPath, componentPath);
        assert.deepEqual(JSON.parse(await readFile(resultPath, "utf8")), {
            initial: 1,
            count: 1,
            preserved: true,
        });

        await run(componentPath, [], { sandbox: true, jcoImport: importPath });
        const sandboxResult = JSON.parse(await readFile(resultPath, "utf8"));
        assert.strictEqual(sandboxResult.count, 0);
        assert.isFalse(sandboxResult.preserved);
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
