import { suite, test, assert } from "vitest";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

suite("Browser I/O", () => {
    test("pollList throws on empty list", async () => {
        const { poll } = await import("../../src/browser/io.js");
        assert.throws(() => poll.poll([]), /empty/);
    });

    test("pollList throws on list exceeding u32 range", async () => {
        const { poll } = await import("../../src/browser/io.js");
        const fakeList = { length: 0x100000000 } as any;
        assert.throws(() => poll.poll(fakeList), /u32/);
    });

    test("pollables can be reused across readiness generations", async () => {
        const { pollableCreate } = await import("../../src/browser/io.js");
        let ready = false;
        let waits = 0;
        let resolve!: () => void;
        const pollable = pollableCreate({
            ready: () => ready,
            wait: () => {
                waits++;
                return new Promise<void>((r) => (resolve = r));
            },
        });

        const first = pollable.block();
        const simultaneous = pollable.block();
        assert.strictEqual(waits, 1);
        ready = true;
        resolve();
        await Promise.all([first, simultaneous]);
        assert.strictEqual(pollable.ready(), true);

        ready = false;
        const second = pollable.block();
        assert.strictEqual(waits, 2);
        ready = true;
        resolve();
        await second;
    });

    test("poll reuses pollables and returns ready indices in input order", async () => {
        const { poll, pollableCreate } = await import("../../src/browser/io.js");
        let firstReady = false;
        let secondReady = true;
        let resolveFirst!: () => void;
        let resolveSecond!: () => void;
        const first = pollableCreate({
            ready: () => firstReady,
            wait: () => new Promise<void>((resolve) => (resolveFirst = resolve)),
        });
        const second = pollableCreate({
            ready: () => secondReady,
            wait: () => new Promise<void>((resolve) => (resolveSecond = resolve)),
        });

        assert.deepStrictEqual(await poll.poll([first, second, first]), new Uint32Array([1]));
        secondReady = false;
        const next = poll.poll([first, second, first]);
        firstReady = true;
        resolveFirst();
        assert.deepStrictEqual(await next, new Uint32Array([0, 2]));

        firstReady = false;
        const final = poll.poll([first, second]);
        secondReady = true;
        resolveSecond();
        assert.deepStrictEqual(await final, new Uint32Array([1]));
    });

    test("browser streams validate u64 lengths and write permits", async () => {
        const { inputStreamCreate, outputStreamCreate } = await import("../../src/browser/io.js");
        const input = inputStreamCreate({ blockingRead: () => new Uint8Array() });
        assert.throws(() => input.read(-1n), /valid u64/);
        assert.throws(() => input.read(BigInt(Number.MAX_SAFE_INTEGER) + 1n), /safe integer/);

        const output = outputStreamCreate({
            checkWrite: () => 2n,
            write() {},
        });
        assert.strictEqual(output.checkWrite(), 2n);
        assert.throws(() => output.write(new Uint8Array(3)), /exceeds the permit/);
        assert.throws(() => output.writeZeroes(3n), /exceeds the permit/);
        assert.throws(() => output.blockingWriteZeroesAndFlush(4097n), /at most 4096/);
    });

    test("browser blocking stream fallbacks flush and accept external pollables", async () => {
        const { inputStreamCreate, outputStreamCreate } = await import("../../src/browser/io.js");
        const events: string[] = [];
        const output = outputStreamCreate({
            write: () => events.push("write"),
            flush: () => events.push("flush"),
        });
        output.blockingWriteAndFlush(new Uint8Array([1]));
        output.blockingFlush();
        assert.deepStrictEqual(events, ["write", "flush", "flush"]);

        const externalPollable = { ready: () => true, block() {} };
        const input = inputStreamCreate({
            blockingRead: () => new Uint8Array(),
            subscribe: () => externalPollable as any,
        });
        assert.strictEqual(input.subscribe(), externalPollable);
        (input as any)[symbolDispose]();
    });

    test("dropping browser streams disposes handlers exactly once", async () => {
        const { outputStreamCreate } = await import("../../src/browser/io.js");
        let drops = 0;
        const output = outputStreamCreate({ write() {}, drop: () => drops++ });
        (output as any)[symbolDispose]();
        (output as any)[symbolDispose]();
        assert.strictEqual(drops, 1);
        try {
            output.checkWrite();
            assert.fail("closed output stream should reject checkWrite");
        } catch (error) {
            assert.deepStrictEqual(error, { tag: "closed" });
        }
    });

    test("dropping resources wakes blocked child pollables", async () => {
        const { inputStreamCreate, poll, pollableCreate } = await import("../../src/browser/io.js");
        const input = inputStreamCreate({
            blockingRead: () => new Uint8Array(),
            subscribe: () =>
                // The source intentionally never becomes ready on its own.
                pollableCreate({
                    ready: () => false,
                    wait: () => new Promise<void>(() => {}),
                }),
        });
        const child = input.subscribe();
        const blocked = child.block();
        const polled = poll.poll([child]) as Promise<Uint32Array>;

        (input as any)[symbolDispose]();

        const blockError = await blocked.then(
            () => undefined,
            (error) => error,
        );
        const pollError = await polled.then(
            () => undefined,
            (error) => error,
        );
        assert.match(blockError.message, /parent resource has been disposed/);
        assert.match(pollError.message, /parent resource has been disposed/);
    });
});
