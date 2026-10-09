import { suite, test, assert } from "vitest";

suite("Browser CLI helpers", () => {
    test("bufferedInputStream serves bytes across reads then reports closed", async () => {
        const { bufferedInputStream } = await import("../../../src/browser/helpers/cli.js");
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
        const { bufferedInputStream } = await import("../../../src/browser/helpers/cli.js");
        const handler = bufferedInputStream("hi");

        assert.deepStrictEqual(handler.blockingRead(10n), new TextEncoder().encode("hi"));
        assert.throws(() => handler.blockingRead(1n));
    });

    test("bufferedInputStream reports closed immediately for empty input", async () => {
        const { bufferedInputStream } = await import("../../../src/browser/helpers/cli.js");
        const handler = bufferedInputStream(new Uint8Array(0));

        assert.throws(() => handler.blockingRead(1n));
    });

    test("bufferedInputStream wires into createCli's stdin", async () => {
        const { createCli } = await import("../../../src/browser/cli.js");
        const { bufferedInputStream } = await import("../../../src/browser/helpers/cli.js");
        const cli = createCli({ stdin: bufferedInputStream("hello") });
        const stdin = cli.stdin.getStdin();

        assert.deepStrictEqual(stdin.blockingRead(5n), new TextEncoder().encode("hello"));
    });
});
