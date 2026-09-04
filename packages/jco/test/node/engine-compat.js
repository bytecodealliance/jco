import { describe, expect, test } from "vitest";

import { rewriteUnicodePropertyEscapes } from "../../src/engine-compat.js";

/**
 * The rewrite has to produce an expression that matches exactly what the original matched,
 * so every case checks the two against each other over a spread of characters rather than
 * checking the text it produced.
 */
function matchesAgree(original, sample) {
    const rewritten = rewriteUnicodePropertyEscapes(`const pattern = ${original};`);
    expect(rewritten, `expected ${original} to be rewritten`).toBeDefined();
    const source = /const pattern = (.*);/.exec(rewritten)[1];
    const before = eval(original); // eslint-disable-line no-eval
    const after = eval(source); // eslint-disable-line no-eval
    for (const character of sample) {
        expect(after.test(character), `${JSON.stringify(character)} in ${original}`).toBe(before.test(character));
    }
    return source;
}

const SAMPLE = [..."abcXYZ019_$-. \t\n", "é", "ß", "你", "‌", "‍", "🚀", "µ", "́"];

describe("unicode property escapes", () => {
    test("rewrites a property inside a character class", () => {
        const source = matchesAgree("/^[$_\\p{ID_Start}]$/u", SAMPLE);
        expect(source).not.toContain("\\p{");
    });

    test("rewrites a property outside a character class", () => {
        const source = matchesAgree("/^\\p{ID_Continue}$/u", SAMPLE);
        expect(source).not.toContain("\\p{");
    });

    test("rewrites a negated property outside a character class", () => {
        matchesAgree("/^\\P{ID_Start}$/u", SAMPLE);
    });

    test("rewrites a negated property inside a character class", () => {
        matchesAgree("/^[\\P{ID_Start}]$/u", SAMPLE);
    });

    test("rewrites the shape path-to-regexp uses", () => {
        matchesAgree("/^[$_\\p{ID_Start}][$\\u200c\\u200d\\p{ID_Continue}]*$/u", ["a", "a1", "$x", "9a"]);
    });

    test("leaves an expression that is not in unicode mode alone", () => {
        // Without `u` this is a literal `p` repeated, not a property escape at all.
        expect(rewriteUnicodePropertyEscapes("const pattern = /\\p{2}/;")).toBeUndefined();
        expect(rewriteUnicodePropertyEscapes("const pattern = /\\p{ID_Start}/;")).toBeUndefined();
    });

    test("leaves a string that merely spells one alone", () => {
        // The source here is a backslash-escaped backslash followed by `p`, which is text.
        expect(rewriteUnicodePropertyEscapes('const text = "\\\\p{ID_Start}";')).toBeUndefined();
    });

    test("leaves a property the building runtime does not know alone", () => {
        expect(rewriteUnicodePropertyEscapes("const pattern = /\\p{Not_A_Real_Property}/u;")).toBeUndefined();
    });

    test("leaves source without any property escape alone", () => {
        expect(rewriteUnicodePropertyEscapes("const pattern = /^[a-z]+$/u;")).toBeUndefined();
    });
});
