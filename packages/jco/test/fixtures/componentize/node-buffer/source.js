import bufferModule, { Buffer, SlowBuffer } from "node:buffer";

function deprecatedCode(run) {
    try {
        run();
    } catch (error) {
        return error instanceof Error && "code" in error ? error.code : "unexpected-error";
    }
    return "did-not-throw";
}

export function run() {
    const text = Buffer.from("component ✓", "utf8");
    const numeric = Buffer.alloc(12);
    numeric.writeUInt32LE(0x89abcdef, 0);
    numeric.writeInt32BE(-1234567, 4);
    numeric.writeFloatLE(Math.PI, 8);
    const combined = Buffer.concat([Buffer.from("one"), Buffer.from("two")]);
    const swapped = Buffer.from("00112233", "hex").swap16();

    return {
        text: text.toString("utf8"),
        hex: text.toString("hex"),
        base64: text.toString("base64"),
        byteLength: Buffer.byteLength("component ✓"),
        combined: combined.toString(),
        numericBytes: [...numeric],
        swappedBytes: [...swapped],
        searchIndex: combined.indexOf("two"),
        moduleIdentity: bufferModule.Buffer === Buffer && globalThis.Buffer === Buffer,
        instanceIdentity: Buffer.from("value").constructor === Buffer && Buffer.isBuffer(Buffer.alloc(0)),
        callCode: deprecatedCode(() => Buffer(4)),
        constructCode: deprecatedCode(() => new Buffer(4)),
        slowCode: deprecatedCode(() => SlowBuffer(4)),
    };
}
