import { suite, test, assert, vi } from "vitest";

suite("Browser CLI", () => {
    test.each([
        ["stdout", "log"],
        ["stderr", "error"],
    ] as const)(
        "dropping %s flushes pending output without writing to a closed stream",
        async (streamName, method) => {
            const { createCli } = await import("../../src/browser/cli.js");
            const writeLine = vi.spyOn(console, method).mockImplementation(() => {});
            try {
                const cli = createCli();
                const stream =
                    streamName === "stdout" ? cli.stdout.getStdout() : cli.stderr.getStderr();
                stream.checkWrite();
                stream.write(new TextEncoder().encode("pending output"));
                assert.doesNotThrow(() => stream[Symbol.dispose]());
                assert.deepStrictEqual(writeLine.mock.calls, [["pending output"]]);
                stream[Symbol.dispose]();
                assert.strictEqual(writeLine.mock.calls.length, 1);
            } finally {
                writeLine.mockRestore();
            }
        },
    );

    test("browser CLI factories isolate configuration and streams", async () => {
        const { createCli } = await import("../../src/browser/cli.js");
        const firstWrites: number[] = [];
        const secondWrites: number[] = [];
        const first = createCli({
            environment: { INSTANCE: "first" },
            arguments: ["one"],
            stdout: { write: (bytes) => firstWrites.push(...bytes) },
        });
        const second = createCli({
            environment: { INSTANCE: "second" },
            arguments: ["two"],
            stdout: { write: (bytes) => secondWrites.push(...bytes) },
        });

        assert.deepStrictEqual(first.environment.getEnvironment(), [["INSTANCE", "first"]]);
        assert.deepStrictEqual(second.environment.getEnvironment(), [["INSTANCE", "second"]]);
        const firstStdout = first.stdout.getStdout();
        firstStdout.checkWrite();
        firstStdout.write(new Uint8Array([1, 2]));
        assert.deepStrictEqual(firstWrites, [1, 2]);
        assert.deepStrictEqual(secondWrites, []);
        assert.strictEqual(first.terminalStdout.getTerminalStdout(), undefined);
    });

    test("exit() throws an exported ComponentExit and reports the code via onExit", async () => {
        const { createCli, ComponentExit } = await import("../../src/browser/cli.js");
        const codes: number[] = [];
        const cli = createCli({ onExit: (code) => codes.push(code) });

        let caught: unknown;
        try {
            cli.exit.exit({ tag: "ok", val: undefined });
        } catch (err) {
            caught = err;
        }
        assert.instanceOf(caught, ComponentExit);
        assert.strictEqual((caught as InstanceType<typeof ComponentExit>).code, 0);
        assert.deepStrictEqual(codes, [0]);

        caught = undefined;
        try {
            cli.exit.exit({ tag: "err", val: undefined });
        } catch (err) {
            caught = err;
        }
        assert.instanceOf(caught, ComponentExit);
        assert.strictEqual((caught as InstanceType<typeof ComponentExit>).code, 1);
        assert.deepStrictEqual(codes, [0, 1]);
    });

    test("exitWithCode() reports the code via onExit before throwing", async () => {
        const { createCli, ComponentExit } = await import("../../src/browser/cli.js");
        const codes: number[] = [];
        const cli = createCli({ onExit: (code) => codes.push(code) });

        let caught: unknown;
        try {
            // @ts-expect-error - Available only wasi-cli v0.2.12
            cli.exit.exitWithCode(42);
        } catch (err) {
            caught = err;
        }
        assert.instanceOf(caught, ComponentExit);
        assert.strictEqual((caught as InstanceType<typeof ComponentExit>).code, 42);
        assert.deepStrictEqual(codes, [42]);
    });
});
