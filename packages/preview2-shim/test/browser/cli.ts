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

    test("bufferedInputStream serves bytes across reads then reports closed", async () => {
        const { bufferedInputStream } = await import("../../src/browser/cli.js");
        const handler = bufferedInputStream(new Uint8Array([1, 2, 3, 4, 5]));

        assert.deepStrictEqual(handler.blockingRead(3n), new Uint8Array([1, 2, 3]));
        assert.deepStrictEqual(handler.blockingRead(10n), new Uint8Array([4, 5]));
        let caught: unknown;
        try {
            handler.blockingRead(1n);
        } catch (err) {
            caught = err;
        }
        assert.deepStrictEqual(caught, { tag: "closed" });
    });

    test("bufferedInputStream accepts a string and encodes it as UTF-8", async () => {
        const { bufferedInputStream } = await import("../../src/browser/cli.js");
        const handler = bufferedInputStream("hi");

        assert.deepStrictEqual(handler.blockingRead(10n), new TextEncoder().encode("hi"));
        assert.throws(() => handler.blockingRead(1n));
    });

    test("bufferedInputStream reports closed immediately for empty input", async () => {
        const { bufferedInputStream } = await import("../../src/browser/cli.js");
        const handler = bufferedInputStream(new Uint8Array(0));

        assert.throws(() => handler.blockingRead(1n));
    });

    test("bufferedInputStream wires into createCli's stdin", async () => {
        const { createCli, bufferedInputStream } = await import("../../src/browser/cli.js");
        const cli = createCli({ stdin: bufferedInputStream("hello") });
        const stdin = cli.stdin.getStdin();

        assert.deepStrictEqual(stdin.blockingRead(5n), new TextEncoder().encode("hello"));
    });
});
