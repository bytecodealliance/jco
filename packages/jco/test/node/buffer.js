import assert from "node:assert/strict";
import { Buffer as NodeBuffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Buffer as UnenvBuffer } from "unenv/node/internal/buffer/buffer";
import { suite, test } from "vitest";
import { COMPONENT_JS_FIXTURES_DIR } from "../common.js";
import { exec, getTmpDir, jcoPath } from "../helpers.js";

function bytes(value) {
    return [...value];
}

suite("node:buffer", () => {
    test.each(["utf8", "utf16le", "latin1", "ascii", "base64", "hex"])(
        "matches Node string conversion for %s",
        (encoding) => {
            const input = encoding === "hex" ? "00ff1020" : encoding.startsWith("base64") ? "SGVsbG8=" : "Héllo";
            const actual = UnenvBuffer.from(input, encoding);
            const expected = NodeBuffer.from(input, encoding);
            assert.deepEqual(bytes(actual), bytes(expected));
            assert.strictEqual(actual.toString(encoding), expected.toString(encoding));
        },
    );

    test("exposes the audited base64url compatibility gap", () => {
        assert.throws(() => UnenvBuffer.from("SGVsbG8", "base64url"), /Unknown encoding: base64url/);
    });

    test("matches allocation, filling, concatenation, and comparison", () => {
        assert.deepEqual(bytes(UnenvBuffer.alloc(5, "ab")), bytes(NodeBuffer.alloc(5, "ab")));
        assert.deepEqual(
            bytes(UnenvBuffer.concat([UnenvBuffer.from("one"), UnenvBuffer.from("two")], 5)),
            bytes(NodeBuffer.concat([NodeBuffer.from("one"), NodeBuffer.from("two")], 5)),
        );
        assert.strictEqual(UnenvBuffer.compare(UnenvBuffer.from("a"), UnenvBuffer.from("b")), -1);
        assert.strictEqual(UnenvBuffer.byteLength("snowman ☃"), NodeBuffer.byteLength("snowman ☃"));
        assert.strictEqual(UnenvBuffer.isBuffer(UnenvBuffer.alloc(0)), true);
    });

    test("matches integer and floating-point reads and writes", () => {
        const actual = UnenvBuffer.alloc(24);
        const expected = NodeBuffer.alloc(24);

        actual.writeUInt32LE(0x89abcdef, 0);
        expected.writeUInt32LE(0x89abcdef, 0);
        actual.writeInt32BE(-1234567, 4);
        expected.writeInt32BE(-1234567, 4);
        actual.writeFloatLE(Math.PI, 8);
        expected.writeFloatLE(Math.PI, 8);
        actual.writeDoubleBE(-Math.E, 12);
        expected.writeDoubleBE(-Math.E, 12);

        assert.deepEqual(bytes(actual), bytes(expected));
        assert.strictEqual(actual.readUInt32LE(0), expected.readUInt32LE(0));
        assert.strictEqual(actual.readInt32BE(4), expected.readInt32BE(4));
        assert.strictEqual(actual.readFloatLE(8), expected.readFloatLE(8));
        assert.strictEqual(actual.readDoubleBE(12), expected.readDoubleBE(12));
    });

    test("matches searching, slicing, copying, swapping, and JSON output", () => {
        const actual = UnenvBuffer.from("001122334455", "hex");
        const expected = NodeBuffer.from("001122334455", "hex");

        actual.swap16();
        expected.swap16();
        assert.deepEqual(bytes(actual), bytes(expected));
        assert.deepEqual(bytes(actual.subarray(1, 4)), bytes(expected.subarray(1, 4)));
        assert.strictEqual(actual.indexOf(0x11), expected.indexOf(0x11));
        assert.deepEqual(actual.toJSON(), expected.toJSON());

        const actualTarget = UnenvBuffer.alloc(4);
        const expectedTarget = NodeBuffer.alloc(4);
        assert.strictEqual(actual.copy(actualTarget, 0, 1, 5), expected.copy(expectedTarget, 0, 1, 5));
        assert.deepEqual(bytes(actualTarget), bytes(expectedTarget));
    });

    test("bundles and executes APIs guest-side", async () => {
        const fixtureDir = join(COMPONENT_JS_FIXTURES_DIR, "node-buffer");
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
        await exec(jcoPath, "transpile", componentPath, "-o", transpiledDir, "--name", "node-buffer");
        await writeFile(join(transpiledDir, "package.json"), JSON.stringify({ type: "module" }));

        const component = await import(`${pathToFileURL(transpiledDir)}/node-buffer.js`);
        assert.deepEqual(component.run(), {
            text: "component ✓",
            hex: "636f6d706f6e656e7420e29c93",
            base64: "Y29tcG9uZW50IOKckw==",
            byteLength: 13,
            combined: "onetwo",
            numericBytes: new Uint8Array([239, 205, 171, 137, 255, 237, 41, 121, 219, 15, 73, 64]),
            swappedBytes: new Uint8Array([17, 0, 51, 34]),
            searchIndex: 3,
            moduleIdentity: true,
            instanceIdentity: true,
            callCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
            constructCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
            slowCode: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
        });
    });
});
