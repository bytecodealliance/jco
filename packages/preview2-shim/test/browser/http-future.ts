import { rejects } from "node:assert";

import { afterEach, assert, suite, test, vi } from "vitest";

import { outgoingHandler, types } from "../../src/browser/http.js";

function request() {
    const req = new types.OutgoingRequest(new types.Fields());
    req.setMethod({ tag: "get" });
    req.setScheme({ tag: "HTTPS" });
    req.setAuthority("example.com");
    req.setPathWithQuery("/");
    return req;
}

function dispose(resource: unknown) {
    (resource as Disposable)[Symbol.dispose]();
}

suite("browser HTTP future disposal", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    for (const consumeResult of [false, true]) {
        test(`settled response survives disposal ${consumeResult ? "after" : "before"} get`, async () => {
            vi.useFakeTimers();
            let signal!: AbortSignal;
            let body!: ReadableStreamDefaultController<Uint8Array>;
            const abort = vi.fn();
            vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
                signal = init!.signal!;
                const stream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        body = controller;
                        controller.enqueue(new TextEncoder().encode("first "));
                        signal.addEventListener("abort", () => {
                            abort();
                            controller.error(signal.reason);
                        });
                    },
                });
                return new Response(stream);
            });
            const options = new types.RequestOptions();
            options.setFirstByteTimeout(10_000_000n);
            const future = outgoingHandler.handle(request(), options);
            const ready = future.subscribe();
            await ready.block();
            dispose(ready);

            const result = consumeResult ? future.get() : undefined;
            dispose(future);
            dispose(future);
            await vi.advanceTimersByTimeAsync(20);
            assert.strictEqual(signal.aborted, false);
            assert.strictEqual(abort.mock.calls.length, 0);
            assert.strictEqual(vi.getTimerCount(), 0);

            if (consumeResult) {
                assert.ok(result?.tag === "ok" && result.val.tag === "ok");
                if (result?.tag !== "ok" || result.val.tag !== "ok") {
                    throw new Error("expected a successful response");
                }
                const response = result.val.val;
                assert.strictEqual(response.status(), 200);
                const incomingBody = response.consume();
                const stream = incomingBody.stream();
                assert.strictEqual(
                    new TextDecoder().decode(await stream.blockingRead(64n)),
                    "first ",
                );
                body.enqueue(new TextEncoder().encode("second"));
                body.close();
                assert.strictEqual(
                    new TextDecoder().decode(await stream.blockingRead(64n)),
                    "second",
                );
                await rejects(
                    Promise.resolve().then(() => stream.blockingRead(64n)),
                    (error: { tag: string }) => error.tag === "closed",
                );
                dispose(stream);
                dispose(incomingBody);
                dispose(response);
            } else {
                body.close();
            }
        });
    }

    test("get consumes a settled result once without cancelling it", async () => {
        let signal!: AbortSignal;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
            signal = init!.signal!;
            return new Response(null, { status: 204 });
        });
        const future = outgoingHandler.handle(request(), undefined);
        assert.strictEqual(future.get(), undefined);
        const ready = future.subscribe();
        await ready.block();
        dispose(ready);
        assert.strictEqual(future.get()?.tag, "ok");
        assert.strictEqual(future.get()?.tag, "err");
        dispose(future);
        assert.strictEqual(signal.aborted, false);
    });

    test("disposing a pending fetch aborts it once", async () => {
        let signal!: AbortSignal;
        const abort = vi.fn();
        vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
            signal = init!.signal!;
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => {
                    abort();
                    reject(signal.reason);
                });
            });
        });
        const future = outgoingHandler.handle(request(), undefined);
        await Promise.resolve();
        assert.strictEqual(future.get(), undefined);
        assert.strictEqual(signal.aborted, false);
        dispose(future);
        dispose(future);
        assert.strictEqual(signal.aborted, true);
        assert.strictEqual(abort.mock.calls.length, 1);
        // Drain the rejection handler; dropping a future must not leak a rejection.
        await Promise.resolve();
    });

    test("disposing before buffered request completion cancels the eventual fetch", async () => {
        let signal!: AbortSignal;
        const started = Promise.withResolvers<void>();
        const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
            signal = init!.signal!;
            started.resolve();
            signal.throwIfAborted();
            throw new Error("a disposed request must not reach the network");
        });
        const req = request();
        req.setMethod({ tag: "post" });
        const body = req.body();
        const future = outgoingHandler.handle(req, undefined);
        dispose(future);
        assert.strictEqual(fetch.mock.calls.length, 0);
        types.OutgoingBody.finish(body, undefined);
        await started.promise;
        assert.strictEqual(fetch.mock.calls.length, 1);
        assert.strictEqual(signal.aborted, true);
    });

    test("failed settlement clears the timeout and does not abort on disposal", async () => {
        vi.useFakeTimers();
        let signal!: AbortSignal;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
            signal = init!.signal!;
            throw new TypeError("network failed");
        });
        const options = new types.RequestOptions();
        options.setFirstByteTimeout(10_000_000n);
        const future = outgoingHandler.handle(request(), options);
        const ready = future.subscribe();
        await ready.block();
        dispose(ready);
        assert.deepStrictEqual(future.get(), {
            tag: "ok",
            val: { tag: "err", val: { tag: "internal-error", val: "network failed" } },
        });
        dispose(future);
        await vi.advanceTimersByTimeAsync(20);
        assert.strictEqual(signal.aborted, false);
        assert.strictEqual(vi.getTimerCount(), 0);
    });

    test("a pending request still times out", async () => {
        vi.useFakeTimers();
        let signal!: AbortSignal;
        vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
            signal = init!.signal!;
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(signal.reason));
            });
        });
        const options = new types.RequestOptions();
        options.setFirstByteTimeout(10_000_000n);
        const future = outgoingHandler.handle(request(), options);
        const ready = future.subscribe();
        await vi.advanceTimersByTimeAsync(10);
        await ready.block();
        dispose(ready);
        assert.strictEqual(signal.aborted, true);
        assert.deepStrictEqual(future.get(), {
            tag: "ok",
            val: { tag: "err", val: { tag: "connection-timeout" } },
        });
        dispose(future);
        assert.strictEqual(vi.getTimerCount(), 0);
    });
});
