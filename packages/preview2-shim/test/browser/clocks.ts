import { suite, test, assert } from "vitest";

suite("Browser clocks", () => {
    test("browser clocks validate u64 subscriptions and make elapsed timers ready", async () => {
        const { monotonicClock, wallClock } = await import("../../src/browser/clocks.js");
        assert.strictEqual(typeof monotonicClock.resolution(), "bigint");
        assert.strictEqual(typeof wallClock.resolution().seconds, "bigint");
        assert.strictEqual(typeof wallClock.resolution().nanoseconds, "number");
        assert.strictEqual(monotonicClock.subscribeDuration(0n).ready(), true);
        assert.strictEqual(monotonicClock.subscribeInstant(monotonicClock.now()).ready(), true);
        assert.throws(() => monotonicClock.subscribeDuration(-1n), /valid u64/);
        assert.throws(() => monotonicClock.subscribeInstant(-1n), /valid u64/);
    });
});
