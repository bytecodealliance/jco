import assert from "node:assert/strict";
import { expect, test } from "vitest";
import {
    callExtension,
    futureSubscribe,
    futureTakeValue,
    futureDispose,
    outputStreamCreate,
} from "../dist/nodejs/io-worker.js";

const module = new URL("./fixtures/io-worker.ts", import.meta.url);

test("host extensions survive operation errors and retain their worker state", (): void => {
    expect(callExtension(module, "count", [])).toBe(1);
    expect(() => callExtension(module, "fail", [])).toThrow("host extension failed");
    expect(callExtension(module, "count", [])).toBe(2);
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
