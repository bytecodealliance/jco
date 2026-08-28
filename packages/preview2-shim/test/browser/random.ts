import { suite, test, assert } from "vitest";

suite("Browser random", () => {
    test("browser random rejects invalid allocation lengths", async () => {
        const { random } = await import("../../src/browser/random.js");
        assert.throws(() => random.getRandomBytes(-1n), /valid u64/);
        assert.throws(
            () => random.getRandomBytes(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
            /safe integer/,
        );
    });
});
