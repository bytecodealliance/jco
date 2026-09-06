import assert from "node:assert/strict";

import { afterEach, suite, test, vi } from "vitest";

import { outgoingHandler, types } from "../../src/browser/http.js";
import type { InputStream } from "../../types/interfaces/wasi-io-streams.js";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const turn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function dispose(resource: object): void {
    const method: unknown = Reflect.get(resource, Symbol.dispose || Symbol.for("dispose"));
    assert.ok(typeof method === "function");
    method.call(resource);
}

async function openBody(response: Response): Promise<InputStream> {
    vi.stubGlobal("fetch", async (): Promise<Response> => response);
    const request = new types.OutgoingRequest(new types.Fields());
    request.setMethod({ tag: "get" });
    request.setScheme({ tag: "HTTPS" });
    request.setAuthority("example.com");
    request.setPathWithQuery("/");
    const future = outgoingHandler.handle(request, undefined);
    const pollable = future.subscribe();
    await pollable.block();
    dispose(pollable);
    const result = future.get();
    assert.ok(result?.tag === "ok" && result.val.tag === "ok");
    return result.val.val.consume().stream();
}

async function controlledBody(cancel?: () => void | Promise<void>): Promise<{
    stream: InputStream;
    controller: ReadableStreamDefaultController<Uint8Array>;
    source: ReadableStream<Uint8Array>;
}> {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>(
        {
            start: (value) => {
                controller = value;
            },
            cancel,
        },
        { highWaterMark: 0 },
    );
    return { stream: await openBody(new Response(source)), controller, source };
}

afterEach(() => vi.unstubAllGlobals());

suite("Browser HTTP input stream", () => {
    test.each([true, false])(
        "only unconsumed response futures abort Fetch on drop (consumed=%s)",
        async (consumed) => {
            let signal: AbortSignal | null | undefined;
            vi.stubGlobal(
                "fetch",
                async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
                    signal = init?.signal;
                    return new Response(null);
                },
            );
            const request = new types.OutgoingRequest(new types.Fields());
            request.setMethod({ tag: "get" });
            request.setScheme({ tag: "HTTPS" });
            request.setAuthority("example.com");
            request.setPathWithQuery("/");
            const future = outgoingHandler.handle(request, undefined);
            const pollable = future.subscribe();
            await pollable.block();
            dispose(pollable);
            assert.ok(signal);
            assert.strictEqual(signal.aborted, false);
            if (consumed) {
                assert.ok(future.get());
            }
            dispose(future);
            assert.strictEqual(signal.aborted, !consumed);
        },
    );

    test("read and skip return empty across gaps and pollables remain level-triggered", async () => {
        const { stream, controller } = await controlledBody();
        const first = stream.subscribe();
        const second = stream.subscribe();
        assert.deepStrictEqual(stream.read(4n), new Uint8Array(0));
        assert.strictEqual(stream.skip(4n), 0n);
        assert.strictEqual(first.ready(), false);
        controller.enqueue(encode("abcd"));
        await Promise.all([first.block(), second.block()]);
        assert.strictEqual(first.ready(), true);
        assert.strictEqual(second.ready(), true);
        assert.deepStrictEqual(stream.read(1n), encode("a"));
        assert.strictEqual(first.ready(), true);
        assert.strictEqual(stream.skip(2n), 2n);
        assert.deepStrictEqual(stream.read(10n), encode("d"));
        assert.strictEqual(first.ready(), false);
        assert.strictEqual(second.ready(), false);
        assert.deepStrictEqual(stream.read(10n), new Uint8Array(0));
        controller.enqueue(encode("ef"));
        await first.block();
        assert.deepStrictEqual(stream.read(10n), encode("ef"));
        controller.close();
        await second.block();
        assert.throws(() => stream.read(1n), { tag: "closed" });
        assert.throws(() => stream.skip(1n), { tag: "closed" });
        dispose(first);
        dispose(second);
        dispose(stream);
    });

    test("zero-length operations complete synchronously without consuming data", async () => {
        const { stream, controller } = await controlledBody();
        assert.deepStrictEqual(stream.read(0n), new Uint8Array(0));
        assert.deepStrictEqual(stream.blockingRead(0n), new Uint8Array(0));
        assert.strictEqual(stream.skip(0n), 0n);
        assert.strictEqual(stream.blockingSkip(0n), 0n);
        controller.enqueue(encode("x"));
        const pollable = stream.subscribe();
        await pollable.block();
        assert.deepStrictEqual(stream.blockingRead(0n), new Uint8Array(0));
        assert.strictEqual(pollable.ready(), true);
        assert.deepStrictEqual(stream.read(1n), encode("x"));
        controller.close();
        await pollable.block();
        assert.throws(() => stream.read(0n), { tag: "closed" });
        assert.throws(() => stream.blockingRead(0n), { tag: "closed" });
        dispose(pollable);
        dispose(stream);
    });

    test("polling ignores empty Fetch chunks until bytes or EOF arrive", async () => {
        const { stream, controller } = await controlledBody();
        const pollable = stream.subscribe();
        let settled = false;
        const wait = Promise.resolve(pollable.block()).then(() => {
            settled = true;
        });
        controller.enqueue(new Uint8Array(0));
        controller.enqueue(new Uint8Array(0));
        await turn();
        assert.strictEqual(settled, false);
        assert.strictEqual(pollable.ready(), false);
        assert.deepStrictEqual(stream.read(2n), new Uint8Array(0));
        controller.enqueue(encode("ok"));
        await wait;
        assert.deepStrictEqual(stream.read(2n), encode("ok"));
        controller.enqueue(new Uint8Array(0));
        controller.close();
        await pollable.block();
        assert.throws(() => stream.read(1n), { tag: "closed" });
        dispose(pollable);
        dispose(stream);
    });

    test("blocking reads and skips wait across empty chunks", async () => {
        const { stream, controller } = await controlledBody();
        let settled = false;
        const read = Promise.resolve(stream.blockingRead(2n)).then((bytes) => {
            settled = true;
            return bytes;
        });
        controller.enqueue(new Uint8Array(0));
        await turn();
        assert.strictEqual(settled, false);
        controller.enqueue(encode("abc"));
        assert.deepStrictEqual(await read, encode("ab"));
        assert.strictEqual(stream.blockingSkip(1n), 1n);
        const skip = stream.blockingSkip(2n);
        controller.enqueue(new Uint8Array(0));
        controller.enqueue(encode("def"));
        assert.strictEqual(await skip, 2n);
        assert.deepStrictEqual(stream.read(10n), encode("f"));
        const closed = Promise.resolve(stream.blockingRead(1n));
        controller.close();
        await assert.rejects(closed, { tag: "closed" });
        dispose(stream);
    });

    test.each([null, new Uint8Array(0)])("empty response bodies reach EOF (%s)", async (body) => {
        const stream = await openBody(new Response(body));
        const pollable = stream.subscribe();
        await pollable.block();
        assert.strictEqual(pollable.ready(), true);
        assert.throws(() => stream.read(1n), { tag: "closed" });
        dispose(pollable);
        dispose(stream);
    });

    test("read errors wake pollers, expose an IO error once, and then close", async () => {
        const { stream, controller, source } = await controlledBody();
        const pollable = stream.subscribe();
        const wait = pollable.block();
        controller.error(new Error("body failed"));
        await wait;
        assert.strictEqual(pollable.ready(), true);
        assert.throws(
            () => stream.read(1n),
            (error: unknown): boolean => {
                assert.ok(
                    typeof error === "object" && error !== null && "tag" in error && "val" in error,
                );
                assert.strictEqual(error.tag, "last-operation-failed");
                assert.ok(error.val instanceof Error);
                assert.strictEqual(error.val.message, "body failed");
                return true;
            },
        );
        assert.throws(() => stream.blockingRead(1n), { tag: "closed" });
        assert.strictEqual(source.locked, false);
        dispose(pollable);
        dispose(stream);
    });

    test("pending blocking reads reject with a valid stream error", async () => {
        const { stream, controller } = await controlledBody();
        const read = Promise.resolve(stream.blockingRead(1n));
        controller.error("broken");
        await assert.rejects(read, { tag: "last-operation-failed" });
        assert.throws(() => stream.read(1n), { tag: "closed" });
        dispose(stream);
    });

    test("dropping a pending stream cancels once and handles cancellation rejection", async () => {
        const cancel = vi.fn(async (): Promise<void> => {
            throw new Error("cancel failed");
        });
        const { stream, source } = await controlledBody(cancel);
        const pollable = stream.subscribe();
        const wait = assert.rejects(Promise.resolve(pollable.block()), /disposed/);
        const read = assert.rejects(Promise.resolve(stream.blockingRead(1n)), { tag: "closed" });
        dispose(stream);
        dispose(stream);
        await Promise.all([wait, read]);
        await turn();
        assert.strictEqual(cancel.mock.calls.length, 1);
        assert.strictEqual(source.locked, false);
        dispose(pollable);
    });

    test("prefetch never overwrites partial data or buffers the complete response", async () => {
        let pulls = 0;
        const stream = await openBody(
            new Response(
                new ReadableStream<Uint8Array>(
                    {
                        pull(controller): void {
                            pulls++;
                            controller.enqueue(encode("abc"));
                        },
                    },
                    { highWaterMark: 0 },
                ),
            ),
        );
        const pollable = stream.subscribe();
        await pollable.block();
        await turn();
        assert.strictEqual(pulls, 1);
        assert.deepStrictEqual(stream.read(1n), encode("a"));
        await pollable.block();
        await turn();
        assert.strictEqual(pulls, 1);
        assert.deepStrictEqual(stream.read(2n), encode("bc"));
        await pollable.block();
        assert.strictEqual(pulls, 2);
        dispose(pollable);
        dispose(stream);
    });
});
