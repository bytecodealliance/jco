import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { preopens } from "../../dist/nodejs/filesystem.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

Deno.test("filesystem descriptors remain valid in the I/O worker", () => {
    const directory = mkdtempSync(join(tmpdir(), "preview2-shim-deno-"));
    const file = join(directory, "worker-resource.txt");

    try {
        writeFileSync(file, "abcdef");
        const [[root]] = preopens.getDirectories();
        const relativeFile = file.slice(1);

        const readDescriptor = root.openAt({}, relativeFile, {}, { read: true });
        const input = readDescriptor.readViaStream(1n);

        // The worker stream owns a reference to the open file resource.
        readDescriptor[symbolDispose]();

        const inputPoll = input.subscribe();
        inputPoll.block();
        assert.equal(new TextDecoder().decode(input.read(10n)), "bcdef");
        inputPoll[symbolDispose]();
        input[symbolDispose]();

        const writeDescriptor = root.openAt({}, relativeFile, {}, { write: true });
        const output = writeDescriptor.writeViaStream(2n);

        // Exercise the same parent-before-child disposal order for writes.
        writeDescriptor[symbolDispose]();
        output.write(new TextEncoder().encode("XYZ"));
        output[symbolDispose]();

        assert.equal(readFileSync(file, "utf8"), "abXYZf");

        const directDescriptor = root.openAt({}, relativeFile, {}, { read: true, write: true });
        assert.equal(directDescriptor.stat().size, 6n);
        assert.equal(new TextDecoder().decode(directDescriptor.read(2n, 1n)[0]), "bX");
        assert.equal(directDescriptor.write(new TextEncoder().encode("Q"), 0n), 1n);
        directDescriptor[symbolDispose]();
        assert.equal(readFileSync(file, "utf8"), "QbXYZf");

        const unlinkedFile = join(directory, "unlinked.txt");
        writeFileSync(unlinkedFile, "still open");
        const unlinkedDescriptor = root.openAt({}, unlinkedFile.slice(1), {}, { read: true });
        const unlinkedInput = unlinkedDescriptor.readViaStream(0n);
        unlinkSync(unlinkedFile);

        const unlinkedPoll = unlinkedInput.subscribe();
        unlinkedPoll.block();
        assert.equal(new TextDecoder().decode(unlinkedInput.read(20n)), "still open");
        unlinkedPoll[symbolDispose]();
        unlinkedInput[symbolDispose]();
        unlinkedDescriptor[symbolDispose]();
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
