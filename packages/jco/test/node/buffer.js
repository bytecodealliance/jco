import assert from "node:assert/strict";
import { Buffer as NodeBuffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
    Buffer as UnenvBuffer,
    INSPECT_MAX_BYTES as UNENV_INSPECT_MAX_BYTES,
    kMaxLength as UNENV_K_MAX_LENGTH,
} from "unenv/node/internal/buffer/buffer";
import { suite, test } from "vitest";
import { exec, getTmpDir, jcoPath, materializeUnenvAdapter, componentizeFixture } from "../helpers.js";

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

    test.concurrent("exposes the audited base64url compatibility gap", () => {
        assert.throws(() => UnenvBuffer.from("SGVsbG8", "base64url"), /Unknown encoding: base64url/);
    });

    test.concurrent("matches allocation, filling, concatenation, and comparison", () => {
        assert.deepEqual(bytes(UnenvBuffer.alloc(5, "ab")), bytes(NodeBuffer.alloc(5, "ab")));
        assert.deepEqual(
            bytes(UnenvBuffer.concat([UnenvBuffer.from("one"), UnenvBuffer.from("two")], 5)),
            bytes(NodeBuffer.concat([NodeBuffer.from("one"), NodeBuffer.from("two")], 5)),
        );
        assert.strictEqual(UnenvBuffer.compare(UnenvBuffer.from("a"), UnenvBuffer.from("b")), -1);
        assert.strictEqual(UnenvBuffer.byteLength("snowman ☃"), NodeBuffer.byteLength("snowman ☃"));
        assert.strictEqual(UnenvBuffer.isBuffer(UnenvBuffer.alloc(0)), true);
    });

    test.concurrent("matches integer and floating-point reads and writes", () => {
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

    test.concurrent("matches searching, slicing, copying, swapping, and JSON output", () => {
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

    // Sequential on purpose: importing the generated core installs the guarded class as the global
    // `Buffer` (as Node does), which this test restores when it is done.
    test("executes the adapter Jco generates, not just its source", async () => {
        const previousGlobalBuffer = globalThis.Buffer;
        try {
            const { module } = await materializeUnenvAdapter("node:buffer");
            const { Buffer, SlowBuffer, default: namespace } = module;

            // The public class is unenv's Buffer behind a guard that refuses the deprecated
            // constructor while leaving every static and TypedArray-derived path intact.
            assert.strictEqual(namespace.Buffer, Buffer);
            assert.strictEqual(Buffer.from("hi").toString(), "hi");
            assert.strictEqual(Buffer.isBuffer(Buffer.alloc(1)), true);
            assert.strictEqual(Buffer.prototype.constructor, Buffer);
            assert.strictEqual(Buffer[Symbol.species], UnenvBuffer);
            assert.strictEqual(Buffer.isBuffer(Buffer.from("abc").subarray(1)), true);
            const deprecated = {
                code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
                message:
                    "The deprecated Buffer() constructor is not supported; use Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() instead",
            };
            assert.throws(() => new Buffer(1), deprecated);
            assert.throws(() => Buffer(1), deprecated);
            assert.throws(() => new SlowBuffer(1), deprecated);
            assert.throws(() => SlowBuffer(1), deprecated);

            // Jco-controlled exports: refusals, constants, and runtime-dependent members.
            assert.equal(module.isAscii(Buffer.from("ascii")), true);
            assert.equal(module.isAscii(Buffer.from("é")), false);
            assert.equal(module.isUtf8(Buffer.from("é😀")), true);
            assert.equal(module.isUtf8(Buffer.from([0xc0, 0x80])), false);
            for (const api of ["resolveObjectURL", "transcode"]) {
                assert.throws(() => module[api](), {
                    code: "ERR_JCO_UNSUPPORTED_NODE_API",
                    message: `buffer.${api} is not supported by the Jco component runtime`,
                });
            }
            assert.strictEqual(module.kStringMaxLength, 536870888);
            assert.deepEqual(module.constants, {
                MAX_LENGTH: Number.MAX_SAFE_INTEGER,
                MAX_STRING_LENGTH: 536870888,
            });
            assert.strictEqual(module.INSPECT_MAX_BYTES, UNENV_INSPECT_MAX_BYTES);
            assert.strictEqual(module.kMaxLength, UNENV_K_MAX_LENGTH);
            assert.strictEqual(module.atob("SGVsbG8="), "Hello");
            assert.strictEqual(module.btoa("Hello"), "SGVsbG8=");
            assert.strictEqual(module.Blob, globalThis.Blob);
            assert.strictEqual(module.File, globalThis.File);
            assert.deepEqual(Object.keys(namespace).sort(), [
                "Blob",
                "Buffer",
                "File",
                "INSPECT_MAX_BYTES",
                "SlowBuffer",
                "atob",
                "btoa",
                "constants",
                "isAscii",
                "isUtf8",
                "kMaxLength",
                "kStringMaxLength",
                "resolveObjectURL",
                "transcode",
            ]);

            // The adapter supplies base64url while preserving the guarded global class.
            assert.strictEqual(globalThis.Buffer, Buffer);
            assert.equal(Buffer.from("SGVsbG8", "base64url").toString(), "Hello");
            assert.equal(Buffer.from([255, 239]).toString("base64url"), "_-8");
        } finally {
            globalThis.Buffer = previousGlobalBuffer;
        }
    });

    test("bundles and executes APIs guest-side", async () => {
        const outputDir = await getTmpDir();
        const transpiledDir = join(outputDir, "transpiled");

        const { componentPath } = await componentizeFixture({
            fixture: "node-buffer",
            entry: "source.js",
            wit: ".",
            bundle: true,
            copy: true,
            outputDir,
            extraArgs: ["--backend", "qjs", "--backend-qjs-disable-async"],
        });
        const consoleHost = new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/console-host.js", import.meta.url)
            .href;
        await exec(
            jcoPath,
            "transpile",
            componentPath,
            "-o",
            transpiledDir,
            "--name",
            "node-buffer",
            "--map",
            `jco:node/console@0.1.0=${consoleHost}`,
        );
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
