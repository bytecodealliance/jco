import test, {
    suite,
    it,
    before,
    after,
    beforeEach,
    afterEach,
    mock,
    run as runTests,
    getTestContext,
} from "node:test";
import * as namespace from "node:test";
import reporters, { dot, tap, junit, spec, lcov } from "node:test/reporters";
import assert from "node:assert/strict";

const report = {
    identity:
        test === it &&
        test === namespace.test &&
        suite === namespace.describe &&
        test.mock === mock &&
        reporters.tap === tap &&
        reporters.spec === spec &&
        reporters.lcov === lcov,
    lifecycle: [],
    passed: [],
    errors: [],
};
const object = { value: () => 1 };
if (typeof AbortController === "function") {
    suite("suite", (s) => {
        report.suiteName = s.name;
        before(() => report.lifecycle.push("before"));
        after(() => report.lifecycle.push("after"));
        beforeEach((t) => report.lifecycle.push(`beforeEach:${t.name}`));
        afterEach((t) => {
            report.lifecycle.push(`afterEach:${t.name}`);
            report.passed.push([t.name, t.passed]);
        });
        test("sync", (t) => {
            t.plan(4);
            t.assert.strictEqual(1 + 1, 2);
            t.assert.deepStrictEqual({ list: [1] }, { list: [1] });
            t.assert.strictEqual(getTestContext(), t);
            t.mock.method(object, "value", () => 3);
            t.assert.strictEqual(object.value(), 3);
        });
        it("async", async (t) => {
            await Promise.resolve();
            assert.equal(object.value(), 1);
            await t.test("nested", (child) => {
                assert.equal(child.fullName, "suite > async > nested");
                const fn = child.mock.fn((a, b) => a + b);
                assert.equal(fn(2, 3), 5);
                report.mockArgs = fn.mock.calls[0].arguments;
            });
        });
        test("callback", (_t, done) => {
            done();
        });
        test.skip("skipped", () => {
            throw new Error("must not execute");
        });
        test.expectFailure("failure", () => {
            throw new Error("expected");
        });
    });
    // A following top-level test waits for the preceding suite in the serial queue.
    await test("sentinel", (t) => {
        t.after(() => {
            report.sentinel = t.passed;
        });
        for (const operation of [
            () => runTests(),
            () => mock.module("node:fs"),
            () => mock.timers.enable(),
            () => t.assert.snapshot({}),
        ]) {
            try {
                operation();
            } catch (error) {
                report.errors.push(error.code);
            }
        }
    });
} else {
    try {
        test("unsupported engine");
    } catch (error) {
        report.runner = error.code;
    }
}
const property = mock.property({ value: 1 }, "value", 2);
report.property = property.value;
property.mock.restore();
report.restored = property.value;
mock.reset();
const events = [
    {
        type: "test:pass",
        data: { name: "reporter", nesting: 0, testNumber: 1, details: { type: "test", duration_ms: 0 } },
    },
];
let dots = "",
    taps = "",
    xml = "";
for await (const chunk of dot(events)) {
    dots += chunk;
}
for await (const chunk of tap(events)) {
    taps += chunk;
}
for await (const chunk of junit(events)) {
    xml += chunk;
}
report.reporters = dots === ".\n" && taps.includes("ok 1 - reporter") && xml.includes("testcase");
export function run() {
    return JSON.stringify(report);
}
