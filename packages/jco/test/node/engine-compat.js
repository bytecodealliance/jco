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
    test.concurrent("rewrites a property inside a character class", () => {
        const source = matchesAgree("/^[$_\\p{ID_Start}]$/u", SAMPLE);
        expect(source).not.toContain("\\p{");
    });

    test.concurrent("rewrites a property outside a character class", () => {
        const source = matchesAgree("/^\\p{ID_Continue}$/u", SAMPLE);
        expect(source).not.toContain("\\p{");
    });

    test.concurrent("rewrites a negated property outside a character class", () => {
        matchesAgree("/^\\P{ID_Start}$/u", SAMPLE);
    });

    test.concurrent("rewrites a negated property inside a character class", () => {
        matchesAgree("/^[\\P{ID_Start}]$/u", SAMPLE);
    });

    test.concurrent("rewrites the shape path-to-regexp uses", () => {
        matchesAgree("/^[$_\\p{ID_Start}][$\\u200c\\u200d\\p{ID_Continue}]*$/u", ["a", "a1", "$x", "9a"]);
    });

    test.concurrent("leaves an expression that is not in unicode mode alone", () => {
        // Without `u` this is a literal `p` repeated, not a property escape at all.
        expect(rewriteUnicodePropertyEscapes("const pattern = /\\p{2}/;")).toBeUndefined();
        expect(rewriteUnicodePropertyEscapes("const pattern = /\\p{ID_Start}/;")).toBeUndefined();
    });

    test.concurrent("leaves a string that merely spells one alone", () => {
        // The source here is a backslash-escaped backslash followed by `p`, which is text.
        expect(rewriteUnicodePropertyEscapes('const text = "\\\\p{ID_Start}";')).toBeUndefined();
    });

    test.concurrent("reports an unknown Unicode property while bundling", () => {
        expect(() => rewriteUnicodePropertyEscapes("const pattern = /\\p{Not_A_Real_Property}/u;")).toThrow(
            "Unknown property",
        );
    });

    test.concurrent("leaves source without any property escape alone", () => {
        expect(rewriteUnicodePropertyEscapes("const pattern = /^[a-z]+$/u;")).toBeUndefined();
    });
});

test.concurrent("does not rewrite text, comments, or dynamic constructors next to regex literals", () => {
    const source = [
        'const text = "\\p{ASCII}/u"; // /\\p{ASCII}/u',
        "const template = `/\\p{ASCII}/u`;",
        'const dynamic = new RegExp("\\\\p{ASCII}", "u");',
        "const actual = /\\p{ASCII}/u;",
    ].join("\n");
    const result = rewriteUnicodePropertyEscapes(source);
    expect(result.slice(0, result.indexOf("const actual"))).toBe(source.slice(0, source.indexOf("const actual")));
});
test.concurrent("preserves lone surrogates and Unicode set semantics", () => {
    matchesAgree("/^\\p{Any}$/u", ["a", "🚀", "\ud800", "\udfff"]);
    matchesAgree("/^[\\p{ASCII}&&\\p{Letter}]$/v", ["a", "1", "é", "🚀"]);
});
