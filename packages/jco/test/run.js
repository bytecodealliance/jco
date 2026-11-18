import { env } from "node:process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, expect } from "vitest";

import { createRequestIsolatedHandler, getPerformanceSetup, getSandboxSetup, run } from "../src/cmd/run.js";
import { exec, getTmpDir, jcoPath } from "./helpers.js";

suite("Run output lifecycle", () => {
    test.concurrent("runs Preview 2 commands when the optional Preview 3 import is unmapped", async () => {
        const directory = await getTmpDir();
        try {
            const component = fileURLToPath(
                new URL("./fixtures/components/hello_stdout.component.wasm", import.meta.url),
            );
            const expected = await exec(jcoPath, "run", "--jco-dir", directory, component);
            const runner = join(directory, "_run.js");
            const source = await readFile(runner, "utf8");
            const lookup = "import.meta.resolve('@bytecodealliance/preview3-shim/cli')";
            assert.include(source, lookup);
            await writeFile(
                runner,
                source.replace(lookup, "(() => { throw new TypeError('unmapped optional import'); })()"),
            );
            assert.deepEqual(await exec(runner), expected);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    test.concurrent("reports initialization failures in a resolved Preview 3 provider", async () => {
        const directory = await getTmpDir();
        try {
            const provider = join(directory, "node_modules/@bytecodealliance/preview3-shim");
            await mkdir(provider, { recursive: true });
            await writeFile(
                join(provider, "package.json"),
                JSON.stringify({
                    name: "@bytecodealliance/preview3-shim",
                    type: "module",
                    exports: { "./cli": "./cli.js" },
                }),
            );
            await writeFile(join(provider, "cli.js"), "throw new Error('provider initialization failed');");
            const component = fileURLToPath(
                new URL("./fixtures/components/hello_stdout.component.wasm", import.meta.url),
            );
            await expect(exec(jcoPath, "run", "--jco-dir", directory, component)).rejects.toThrow(
                /provider initialization failed/,
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});

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
        assert.include(setup, "_denyDnsLookup(); _denyTcp(); _denyUdp(); _denyHttp();");
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
            assert.notInclude(setup, "_denyHttp()");
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

suite("Run performance options", () => {
    test("emits no setup unless a --perf flag is given", () => {
        assert.strictEqual(getPerformanceSetup({}), "");
        assert.strictEqual(getPerformanceSetup({ perfMainThreadFilesystem: false }), "");
    });

    test("sets the requested preview2-shim performance options", () => {
        const setup = getPerformanceSetup({ perfMainThreadFilesystem: true });
        assert.include(setup, '_setPerformance({"mainThreadFilesystem":true})');
    });

    const componentPath = fileURLToPath(new URL("./fixtures/components/hello_stdout.component.wasm", import.meta.url));
    const MISSING_OPTION = "that has filesystem performance options";

    /**
     * Run the component with a module that reports where the shim opened a file.
     *
     * @param {string[]} flags - extra `jco run` flags
     * @param {object} [options]
     * @param {number} [options.expectedExitCode] - the exit code `jco run` is expected to end with
     * @returns {Promise<{ mainThread?: boolean, stdout: string, stderr: string }>} what the run observed
     */
    async function runProbe(flags, { expectedExitCode = 0 } = {}) {
        const directory = await getTmpDir();
        const importPath = join(directory, "probe.mjs");
        const resultPath = join(directory, "result.json");
        const probed = join(directory, "probe.txt").replace(/^[\\/]+/, "");
        await writeFile(join(directory, "probe.txt"), "probe");
        // A stream of the I/O worker has an id there; one served on the main thread has none.
        await writeFile(
            importPath,
            `
                import { writeFileSync } from "node:fs";
                import { preopens } from "@bytecodealliance/preview2-shim/filesystem";
                import { inputStreamId } from "@bytecodealliance/preview2-shim/io-worker";
                const [[root]] = preopens.getDirectories();
                const file = root.openAt({}, ${JSON.stringify(probed)}, {}, { read: true });
                const stream = file.readViaStream(0n);
                writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({
                    mainThread: inputStreamId(stream) === undefined,
                }));
                stream[Symbol.dispose]();
                file[Symbol.dispose]();
            `,
        );

        try {
            const args = ["run", "--jco-dir", directory, ...flags, "--jco-import", importPath];
            const output = await exec(jcoPath, ...args, componentPath, { expectedExitCode });
            const result = await readFile(resultPath, "utf8").catch((error) => {
                if (error.code !== "ENOENT") {
                    throw error;
                }
                return "{}";
            });
            return { ...JSON.parse(result), ...output };
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }

    // TODO(unskip): remove this test once packages/jco depends on a preview2-shim
    // release that has filesystem performance options, together with the
    // compatibility error in getPerformanceSetup.
    test("jco run reports a preview2-shim that predates the performance options", async () => {
        const { mainThread, stderr } = await runProbe(["--perf-main-thread-filesystem"], { expectedExitCode: 1 });
        assert.isUndefined(mainThread);
        assert.include(stderr, MISSING_OPTION);
    });

    // TODO(unskip): change `test.skip` to `test` once packages/jco depends on the
    // first preview2-shim release with filesystem performance options (after 0.31.1).
    // Verified locally with packages/jco linked to the workspace preview2-shim.
    test.skip("jco run --perf-main-thread-filesystem serves files on the main thread", async () => {
        assert.isFalse((await runProbe([])).mainThread);
        const { mainThread, stdout } = await runProbe(["--perf-main-thread-filesystem"]);
        assert.isTrue(mainThread);
        assert.include(stdout, "writing to stdout: hello, world");
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
