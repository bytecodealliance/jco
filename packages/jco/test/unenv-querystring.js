import assert from "node:assert/strict";
import * as nodeQuerystring from "node:querystring";

import unenvDefault, * as unenvQuerystring from "unenv/node/querystring";
import { suite, test } from "vitest";

suite("unenv node:querystring compatibility", () => {
    test("matches the Node 24 module and alias contract", () => {
        assert.deepEqual(Object.keys(unenvQuerystring).sort(), Object.keys(nodeQuerystring).sort());
        assert.strictEqual(unenvQuerystring.default, unenvDefault);
        assert.strictEqual(unenvQuerystring.decode, unenvQuerystring.parse);
        assert.strictEqual(unenvQuerystring.encode, unenvQuerystring.stringify);
        assert.strictEqual(unenvDefault.decode, unenvQuerystring.parse);
        assert.strictEqual(unenvDefault.encode, unenvQuerystring.stringify);
    });

    test.each([
        ["ordinary fields", "name=component&enabled=true"],
        ["repeated, empty, and valueless fields", "value=one&value=two+words&empty=&flag"],
        ["Unicode and encoded delimiters", "snowman=%E2%98%83&delimiter=a%26b%3Dc"],
        ["malformed percent input", "bad=%E0%A4%A&percent=%"],
    ])("matches Node parsing for %s", (_name, input) => {
        assert.deepEqual(unenvQuerystring.parse(input), nodeQuerystring.parse(input));
    });

    test("matches custom parsing options and null-prototype results", () => {
        const input = "first:one;second:two;third:three";
        const options = { maxKeys: 2, decodeURIComponent: (value) => `decoded(${value})` };
        const actual = unenvQuerystring.parse(input, ";", ":", options);
        const expected = nodeQuerystring.parse(input, ";", ":", options);

        assert.deepEqual(actual, expected);
        assert.strictEqual(Object.getPrototypeOf(actual), null);
    });

    test("falls back compatibly when a custom decoder throws", () => {
        const options = {
            decodeURIComponent() {
                throw new Error("decoder failed");
            },
        };
        assert.deepEqual(
            unenvQuerystring.parse("value=two+words&bad=%E0%A4%A", undefined, undefined, options),
            nodeQuerystring.parse("value=two+words&bad=%E0%A4%A", undefined, undefined, options),
        );
    });

    test.each([
        ["strings and arrays", { value: ["one", "two words"], empty: "" }],
        ["primitive values", { nil: null, missing: undefined, yes: true, no: false, count: 3.5, big: 4n }],
        ["non-finite and structured values", { nan: NaN, infinity: Infinity, object: {}, emptyArray: [] }],
    ])("matches Node stringification for %s", (_name, value) => {
        assert.strictEqual(unenvQuerystring.stringify(value), nodeQuerystring.stringify(value));
    });

    test("matches custom separators and encoders", () => {
        const value = { first: "one", second: "two words" };
        const options = { encodeURIComponent: (part) => `[${part}]` };
        assert.strictEqual(
            unenvQuerystring.stringify(value, ";", ":", options),
            nodeQuerystring.stringify(value, ";", ":", options),
        );
    });

    test.each(["plain", "two words", "a+b&c=d", "snowman ☃"])("matches Node escaping for %s", (value) => {
        assert.strictEqual(unenvQuerystring.escape(value), nodeQuerystring.escape(value));
    });

    test("matches Node errors for invalid UTF-16 input", () => {
        assert.throws(() => nodeQuerystring.escape("\ud800"), { name: "URIError", code: "ERR_INVALID_URI" });
        assert.throws(() => unenvQuerystring.escape("\ud800"), { name: "URIError", code: "ERR_INVALID_URI" });
    });

    test.each(["plain", "two+words", "a%2Bb%26c%3Dd", "%E2%98%83", "%E0%A4%A", "%"])(
        "matches Node unescaping for %s",
        (value) => {
            assert.strictEqual(unenvQuerystring.unescape(value), nodeQuerystring.unescape(value));
            assert.deepEqual(
                [...unenvQuerystring.unescapeBuffer(value, true)],
                [...nodeQuerystring.unescapeBuffer(value, true)],
            );
        },
    );
});
