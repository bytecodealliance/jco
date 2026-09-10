import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";

const ASSERT_SPECIFIERS = new Set(["node:assert", "node:assert/strict"]);

/** Source of a `node:assert` or `node:assert/strict` adapter */
function assertAdapter(specifier: string, assertModule: string): string {
    if (specifier === "node:assert") {
        return `
import assert from ${JSON.stringify(assertModule)};
export default assert;
export {
    Assert,
    AssertionError,
    CallTracker,
    deepEqual,
    deepStrictEqual,
    doesNotMatch,
    doesNotReject,
    doesNotThrow,
    equal,
    fail,
    ifError,
    match,
    notDeepEqual,
    notDeepStrictEqual,
    notEqual,
    notStrictEqual,
    ok,
    partialDeepStrictEqual,
    rejects,
    strict,
    strictEqual,
    throws,
} from ${JSON.stringify(assertModule)};
`;
    }
    return `
import { strict } from ${JSON.stringify(assertModule)};
export default strict;
export const Assert = strict.Assert;
export const AssertionError = strict.AssertionError;
export const CallTracker = strict.CallTracker;
export const deepEqual = strict.deepEqual;
export const deepStrictEqual = strict.deepStrictEqual;
export const doesNotMatch = strict.doesNotMatch;
export const doesNotReject = strict.doesNotReject;
export const doesNotThrow = strict.doesNotThrow;
export const equal = strict.equal;
export const fail = strict.fail;
export const ifError = strict.ifError;
export const match = strict.match;
export const notDeepEqual = strict.notDeepEqual;
export const notDeepStrictEqual = strict.notDeepStrictEqual;
export const notEqual = strict.notEqual;
export const notStrictEqual = strict.notStrictEqual;
export const ok = strict.ok;
export const partialDeepStrictEqual = strict.partialDeepStrictEqual;
export const rejects = strict.rejects;
export { strict };
export const strictEqual = strict.strictEqual;
export const throws = strict.throws;
`;
}

export function createAssertBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(ASSERT_SPECIFIERS, (specifier) =>
        assertAdapter(specifier, stdModule(options.assertModule, "assert")),
    );
}
