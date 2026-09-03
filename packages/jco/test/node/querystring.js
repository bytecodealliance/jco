import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as nodeQuerystring from "node:querystring";
import { pathToFileURL } from "node:url";

import unenvDefault, * as unenvQuerystring from "unenv/node/querystring";
import { suite, test } from "vitest";
import { COMPONENT_JS_FIXTURES_DIR } from "../common.js";
import { exec, getTmpDir, jcoPath, materializeUnenvAdapter } from "../helpers.js";

suite("node:querystring", () => {
    test.concurrent("matches the Node 24 module and alias contract", () => {
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

    test.concurrent("matches custom parsing options and null-prototype results", () => {
        const input = "first:one;second:two;third:three";
        const options = { maxKeys: 2, decodeURIComponent: (value) => `decoded(${value})` };
        const actual = unenvQuerystring.parse(input, ";", ":", options);
        const expected = nodeQuerystring.parse(input, ";", ":", options);

        assert.deepEqual(actual, expected);
        assert.strictEqual(Object.getPrototypeOf(actual), null);
    });

    test.concurrent("falls back compatibly when a custom decoder throws", () => {
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

    test.concurrent("matches custom separators and encoders", () => {
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

    test.concurrent("matches Node errors for invalid UTF-16 input", () => {
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

    // Sequential on purpose: the adapter imports the generated buffer core for its side effects,
    // which installs the guarded class as the global `Buffer`; this test restores it when done.
    test("executes the adapter Jco generates, not just its source", async () => {
        const previousGlobalBuffer = globalThis.Buffer;
        try {
            const { module } = await materializeUnenvAdapter("node:querystring");

            // The adapter forwards unenv's whole named surface plus the default namespace, so the
            // module a component sees matches Node's export and alias contract.
            assert.deepEqual(Object.keys(module).sort(), Object.keys(nodeQuerystring).sort());
            assert.strictEqual(module.default.parse, module.parse);
            assert.strictEqual(module.decode, module.parse);
            assert.strictEqual(module.encode, module.stringify);

            const query = "value=one&value=two+words&empty=&flag";
            assert.deepEqual(module.parse(query), nodeQuerystring.parse(query));
            const record = { value: ["one", "two words"], empty: "" };
            assert.strictEqual(module.stringify(record), nodeQuerystring.stringify(record));
            assert.strictEqual(module.escape("snowman ☃"), nodeQuerystring.escape("snowman ☃"));
            assert.strictEqual(module.unescape("%E2%98%83"), nodeQuerystring.unescape("%E2%98%83"));
        } finally {
            globalThis.Buffer = previousGlobalBuffer;
        }
    });

    // TODO(unskip): global Error injection resolves jco-std's versioned Errors module, which is
    // not published yet. Unskip once a release carrying that export is available to Jco's tests.
    test.skip("bundles and executes APIs guest-side", async () => {
        const fixtureDir = join(COMPONENT_JS_FIXTURES_DIR, "node-querystring");
        const outputDir = await getTmpDir();
        const componentPath = join(outputDir, "component.wasm");
        const transpiledDir = join(outputDir, "transpiled");

        await exec(
            jcoPath,
            "componentize",
            join(fixtureDir, "source.js"),
            "--bundle",
            "--backend",
            "qjs",
            "-w",
            join(fixtureDir, "source.wit"),
            "-o",
            componentPath,
        );
        await exec(jcoPath, "transpile", componentPath, "-o", transpiledDir, "--name", "node-querystring");
        await writeFile(join(transpiledDir, "package.json"), JSON.stringify({ type: "module" }));

        const component = await import(`${pathToFileURL(transpiledDir)}/node-querystring.js`);
        assert.deepEqual(component.run(), {
            repeated: ["one", "two words"],
            empty: "",
            flag: "",
            malformedFallback: true,
            customFirst: "one",
            customSecond: "two words",
            limitedKeys: 2,
            encoded: "value=one&value=two%20words&empty=&enabled=true&nil=",
            customEncoded: "[first]:[one];[second]:[two words]",
            escaped: "a%20b%2Bc%2F%E2%9C%93",
            unescaped: "a+b+c/✓",
            bufferBytes: new Uint8Array([65, 32, 66]),
            nullPrototype: true,
            namespaceChecks: 4,
        });
    });
});
