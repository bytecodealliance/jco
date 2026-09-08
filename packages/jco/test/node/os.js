import { readFile, writeFile } from "node:fs/promises";
import nativeOs from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { assert, expect, suite, test } from "vitest";

import { OS_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { componentizeFixture, exec, getTmpDir, setupAsyncTest } from "../helpers.js";

const NODE_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os/host/node");
const DENY_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os/host");

suite("node:os in a component", () => {
    test.concurrent("installs the typed OS WIT dependency idempotently", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:os;\nworld component {}\n");

        const result = await injectNodeWitImports(root, undefined, [OS_WIT_REQUIREMENT]);
        expect(result?.imports).toEqual(["jco:node/os@0.1.0"]);
        const osWit = await readFile(join(root, "deps/jco-node-0.1.0/os.wit"), "utf8");
        expect(osWit).toContain("interface os");
        expect(osWit).toContain("record cpu-info");
        expect(osWit).toContain("network-interfaces: func(");
        expect(osWit).toEqual(
            await readFile(new URL("../../../jco-std/wit/node-0.1.0/os.wit", import.meta.url), "utf8"),
        );
        expect(await injectNodeWitImports(root, undefined, [OS_WIT_REQUIREMENT])).toBeUndefined();
        expect((await readFile(world, "utf8")).match(/import jco:node\/os@0\.1\.0;/g)).toHaveLength(1);
    });

    test.each(["node", "denied"])(
        "componentizes and runs with the %s OS adapter",
        async (adapter) => {
            const hostSpecifier = adapter === "node" ? NODE_HOST : DENY_HOST;
            const { componentPath, stderr } = await componentizeFixture({
                fixture: "node-os",
                bundle: true,
                copy: true,
            });
            assert.include(stderr, "Jco added generated WIT import jco:node/os@0.1.0");

            const { esModuleOutputPath, cleanup } = await setupAsyncTest({
                component: { name: "node-os", path: componentPath, skipInstantiation: true },
                jco: {
                    transpile: {
                        extraArgs: {
                            map: {
                                "jco:node/os@0.1.0": hostSpecifier,
                            },
                        },
                    },
                },
            });

            try {
                const runner = fileURLToPath(new URL("../fixtures/componentize/node-os/run.js", import.meta.url));
                const output = await exec(runner, esModuleOutputPath, hostSpecifier, adapter);
                const report = JSON.parse(output.stdout);
                assert.strictEqual(report.eol, "\n");
                assert.strictEqual(report.devNull, "/dev/null");
                assert.strictEqual(report.invalidArgument, 22);
                if (adapter === "denied") {
                    expect(report.errors).toEqual(
                        Array(6).fill({ name: "Error", code: "ERR_JCO_OS_ADAPTER_REQUIRED" }),
                    );
                    return;
                }
                assert.strictEqual(report.namespaceIdentity, true);
                assert.strictEqual(report.arch, nativeOs.arch());
                assert.strictEqual(report.platform, nativeOs.platform());
                assert.isAbove(report.parallelism, 0);
                assert.strictEqual(report.username, nativeOs.userInfo().username);
                assert.strictEqual(report.homedir, nativeOs.homedir());
                assert.strictEqual(report.type, nativeOs.type());
                assert.strictEqual(report.bufferedUsername, nativeOs.userInfo().username);
                assert.lengthOf(report.loadavg, 3);
                assert.isTrue(report.loadavg.every(Number.isFinite));
                assert.isAbove(report.uptime, 0);
                let nativeError;
                try {
                    nativeOs.getPriority(2147483647);
                } catch (error) {
                    nativeError = { name: error.name, code: error.code, syscall: error.syscall, info: error.info };
                }
                assert.isDefined(nativeError, "the nonexistent PID should fail");
                assert.deepEqual(report.priorityError, nativeError);
            } finally {
                await cleanup();
            }
        },
        600_000,
    );
});
