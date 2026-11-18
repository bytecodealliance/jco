import assert from "node:assert/strict";
import { expect, test } from "vitest";
import {
    callExtension,
    futureSubscribe,
    futureTakeValue,
    futureDispose,
    outputStreamCreate,
    inputStreamCreate,
} from "../dist/nodejs/io-worker.js";

const module = new URL("./fixtures/io-worker.ts", import.meta.url);

test("host extensions survive operation errors and retain their worker state", (): void => {
    expect(callExtension(module, "count", [])).toBe(1);
    expect(() => callExtension(module, "fail", [])).toThrow("host extension failed");
    expect(callExtension(module, "count", [])).toBe(2);
});

test.each(["error", "close"])("input drains buffered data before reporting %s", (ending): void => {
    const ids = callExtension(module, `buffered-input-${ending}`, []);
    assert(ids !== null && typeof ids === "object" && "input" in ids && "output" in ids);
    assert(typeof ids.input === "number" && typeof ids.output === "number");
    const input = inputStreamCreate(ids.input);
    const output = outputStreamCreate(ids.output);
    const pollable = input.subscribe();
    const errorTag = ending === "error" ? "last-operation-failed" : "closed";
    try {
        assert.equal(pollable.ready(), true);
        assert.deepEqual(input.read(0n), new Uint8Array());
        assert.equal(new TextDecoder().decode(input.read(3n)), "buf");
        // The shared duplex's buffered input must not hide output errors.
        assert.throws(() => output.checkWrite(), { tag: errorTag });
        assert.equal(new TextDecoder().decode(input.blockingRead(1024n)), "fered response");
        assert.equal(pollable.ready(), true);
        assert.throws(() => input.read(1n), { tag: errorTag });
        assert.throws(() => input.blockingRead(1n), { tag: errorTag });
    } finally {
        assert(Symbol.dispose in pollable);
        const dispose = pollable[Symbol.dispose];
        assert(typeof dispose === "function");
        dispose.call(pollable);
        input[Symbol.dispose]();
        output[Symbol.dispose]();
    }
});

test("extension futures preserve rejection, polling and single-consumption ownership", (): void => {
    const before = callExtension(module, "resources", []);
    const id = callExtension(module, "rejected-future", []);
    assert(typeof id === "number");
    const pollable = futureSubscribe(id, {});
    expect(() => futureDispose(id)).toThrow(/child poll/);
    pollable.block();
    assert(Symbol.dispose in pollable);
    const dispose = pollable[Symbol.dispose];
    assert(typeof dispose === "function");
    dispose.call(pollable);
    expect(futureTakeValue<undefined, { message: string }>(id)).toEqual({
        tag: "ok",
        val: { tag: "err", val: { message: "handshake failed" } },
    });
    expect(futureTakeValue(id)).toEqual({ tag: "err", val: undefined });
    futureDispose(id);
    expect(callExtension(module, "resources", [])).toEqual(before);
});

test("blocking write flushes 4096 bytes even when Node's buffer is smaller", (): void => {
    const id = callExtension(module, "small-buffer-output", []);
    assert(typeof id === "number");
    const output = outputStreamCreate(id);
    const before = callExtension(module, "written-bytes", []);
    assert(typeof before === "number");
    output.blockingWriteAndFlush(new Uint8Array(4096));
    expect(callExtension(module, "written-bytes", [])).toBe(before + 4096);
    output[Symbol.dispose]();
});

/**
 * Create a source stream holding "abc" and a sink stream, both in the worker.
 *
 * @returns the streams and a function reading what the sink received
 */
function splicePair() {
    const ids = callExtension(module, "splice-pair", []);
    assert(ids !== null && typeof ids === "object" && "input" in ids && "output" in ids);
    assert(typeof ids.input === "number" && typeof ids.output === "number");
    const { input: inputId, output: outputId } = ids;
    return {
        inputId,
        input: inputStreamCreate(inputId),
        output: outputStreamCreate(outputId),
        received: () => callExtension(module, "splice-received", [outputId]),
    };
}

test("splice moves the bytes a source has buffered, up to the requested length", (): void => {
    const { inputId, input, output, received } = splicePair();
    try {
        expect(output.splice(input, 2n)).toBe(2n);
        // Fewer bytes are buffered than asked for, and the source is still open.
        expect(output.splice(input, 1024n)).toBe(1n);
        expect(output.splice(input, 1024n)).toBe(0n);
        output.blockingFlush();
        expect(received()).toBe("abc");
        callExtension(module, "splice-end", [inputId]);
        assert.throws(() => output.blockingSplice(input, 1024n), { tag: "closed" });
    } finally {
        input[Symbol.dispose]();
        output[Symbol.dispose]();
    }
});

test("blocking-splice waits for the source to have bytes", (): void => {
    const { inputId, input, output, received } = splicePair();
    try {
        expect(output.blockingSplice(input, 1024n)).toBe(3n);
        callExtension(module, "splice-feed-later", [inputId, "defg"]);
        expect(output.blockingSplice(input, 2n)).toBe(2n);
        expect(output.blockingSplice(input, 1024n)).toBe(2n);
        output.blockingFlush();
        expect(received()).toBe("abcdefg");
    } finally {
        input[Symbol.dispose]();
        output[Symbol.dispose]();
    }
});
