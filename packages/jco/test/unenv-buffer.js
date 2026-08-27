import assert from "node:assert/strict";
import { Buffer as NodeBuffer } from "node:buffer";

import { Buffer as UnenvBuffer } from "unenv/node/internal/buffer/buffer";
import { suite, test } from "vitest";

function bytes(value) {
    return [...value];
}

suite("unenv node:buffer compatibility", () => {
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
});
