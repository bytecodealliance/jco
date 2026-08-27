import assert, {
    Assert,
    AssertionError,
    CallTracker,
    deepStrictEqual,
    doesNotMatch,
    doesNotThrow,
    equal,
    fail,
    ifError,
    match,
    notDeepStrictEqual,
    notEqual,
    notStrictEqual,
    ok,
    partialDeepStrictEqual,
    rejects,
    doesNotReject,
    strictEqual,
    throws,
} from "node:assert";
import * as assertNamespace from "node:assert";
import strictAssert from "node:assert/strict";

function passed(run) {
    run();
    return 1;
}

function assertionFailure(run, operator) {
    try {
        run();
    } catch (error) {
        assert(error instanceof AssertionError);
        strictEqual(error.code, "ERR_ASSERTION");
        if (operator !== undefined) {
            strictEqual(error.operator, operator);
        }
        return 1;
    }
    fail("Expected an AssertionError");
}

export function run() {
    let scalarChecks = 0;
    for (const value of [true, 1, -1, "value", [], {}, Symbol("value"), 1n]) {
        scalarChecks += passed(() => assert(value));
    }
    scalarChecks += passed(() => ok({}));
    for (const [actual, expected] of [
        [1, "1"],
        [0, false],
        [null, undefined],
        [NaN, NaN],
    ]) {
        scalarChecks += passed(() => equal(actual, expected));
    }
    scalarChecks += passed(() => notEqual(1, 2));
    scalarChecks += passed(() => strictEqual(NaN, NaN));
    scalarChecks += passed(() => notStrictEqual(0, -0));
    scalarChecks += assertionFailure(() => assert(false), "==");
    scalarChecks += assertionFailure(() => strictEqual(0, -0), "strictEqual");
    scalarChecks += assertionFailure(() => notStrictEqual(NaN, NaN), "notStrictEqual");

    let deepChecks = 0;
    for (const [actual, expected] of [
        [{ nested: [1, { value: true }] }, { nested: [1, { value: true }] }],
        [new Set([1, 2]), new Set([2, 1])],
        [new Map([[{ key: 1 }, { value: 2 }]]), new Map([[{ key: 1 }, { value: 2 }]])],
        [new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])],
        [new Date(1234), new Date(1234)],
        [/component/gi, /component/gi],
        [new Number(1), new Number(1)],
    ]) {
        deepChecks += passed(() => deepStrictEqual(actual, expected));
    }
    const leftCycle = { name: "cycle" };
    const rightCycle = { name: "cycle" };
    leftCycle.self = leftCycle;
    rightCycle.self = rightCycle;
    deepChecks += passed(() => deepStrictEqual(leftCycle, rightCycle));
    deepChecks += passed(() => assertNamespace.deepEqual({ value: 1 }, { value: "1" }));
    deepChecks += passed(() => notDeepStrictEqual({ value: 1 }, { value: 2 }));
    deepChecks += passed(() =>
        partialDeepStrictEqual({ value: 1, nested: { kept: true }, extra: 2 }, { nested: { kept: true } }),
    );
    deepChecks += assertionFailure(() => deepStrictEqual({ value: 1 }, { value: 2 }), "deepStrictEqual");
    deepChecks += assertionFailure(() => notDeepStrictEqual({ value: 1 }, { value: 1 }), "notDeepStrictEqual");
    class Left {
        constructor() {
            this.value = 1;
        }
    }
    class Right {
        constructor() {
            this.value = 1;
        }
    }
    deepChecks += passed(() => new Assert({ skipPrototype: true }).deepStrictEqual(new Left(), new Right()));

    let matcherChecks = 0;
    matcherChecks += passed(() => match("component", /^comp/));
    matcherChecks += passed(() => doesNotMatch("component", /node$/));
    matcherChecks += passed(() =>
        throws(() => {
            throw new TypeError("expected");
        }, TypeError),
    );
    matcherChecks += passed(() =>
        throws(() => {
            throw new Error("needle");
        }, /needle/),
    );
    matcherChecks += passed(() =>
        throws(
            () => {
                throw { code: "EXPECTED" };
            },
            { code: "EXPECTED" },
        ),
    );
    matcherChecks += passed(() =>
        throws(
            () => {
                throw 42;
            },
            (value) => value === 42,
        ),
    );
    matcherChecks += passed(() => doesNotThrow(() => 42));
    matcherChecks += passed(() => ifError(null));
    matcherChecks += passed(() => ifError(undefined));
    matcherChecks += assertionFailure(() => match("component", /node/), "match");
    matcherChecks += assertionFailure(() => throws(() => 42), "throws");
    matcherChecks += assertionFailure(() => ifError(new Error("unexpected")), "ifError");

    let moduleChecks = 0;
    moduleChecks += passed(() => strictEqual(assert, ok));
    moduleChecks += passed(() => strictEqual(assert.ok, ok));
    moduleChecks += passed(() => strictEqual(assertNamespace.default, assert));
    moduleChecks += passed(() => strictEqual(assertNamespace.strictEqual, strictEqual));
    moduleChecks += passed(() => strictEqual(assert.strict, strictAssert));
    moduleChecks += passed(() => strictEqual(strictAssert.equal, strictAssert.strictEqual));
    moduleChecks += passed(() => strictEqual(strictAssert.deepEqual, strictAssert.deepStrictEqual));

    let promiseChecks = 0;
    promiseChecks += passed(() =>
        assert(rejects(Promise.reject(new TypeError("expected")), TypeError) instanceof Promise),
    );
    promiseChecks += passed(() => assert(doesNotReject(Promise.resolve(42)) instanceof Promise));

    let failureCode = "";
    let failureOperator = "";
    try {
        strictEqual(1, 2);
    } catch (error) {
        if (!(error instanceof AssertionError)) {
            throw error;
        }
        failureCode = error.code;
        failureOperator = error.operator;
    }

    let strictSubpath = false;
    try {
        strictAssert.equal(1, "1");
    } catch (error) {
        strictSubpath = error instanceof AssertionError;
    }

    let deprecatedCode = "";
    let deprecatedChecks = 0;
    try {
        fail(1, 2);
    } catch (error) {
        if (!(error instanceof Error) || !("code" in error)) {
            throw error;
        }
        deprecatedCode = error.code;
        deprecatedChecks++;
    }
    try {
        new CallTracker();
    } catch (error) {
        if (!(error instanceof Error) || !("code" in error)) {
            throw error;
        }
        strictEqual(error.code, "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API");
        deprecatedChecks++;
    }

    return {
        scalarChecks,
        deepChecks,
        matcherChecks,
        moduleChecks,
        promiseChecks,
        deprecatedChecks,
        failureCode,
        failureOperator,
        strictSubpath,
        deprecatedCode,
    };
}
