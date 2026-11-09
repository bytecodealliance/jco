/** Exercise instance cleanup and task lifecycle through generated bindings and isolated processes. */
import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env, execArgv } from 'node:process';
import { pathToFileURL } from 'node:url';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { assert, expect, suite, test } from 'vitest';

import { parse } from '../src/wasm-tools.js';
import { $init, generate } from '../src/component.js';
import { getTmpDir } from './helpers.js';
import { hasJspi } from './common.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Locate components built from crates/test-components alongside the transpiler fixtures. */
function rustComponent(name) {
    return new URL(`./fixtures/generated/rust-test-components/${name}.wasm`, import.meta.url);
}

/** Transpile a Rust component, or a focused canonical ABI regression written in WAT. */
async function generated(componentUrl: URL | string, callTracking = false) {
    await $init;
    let component: Uint8Array;
    if (typeof componentUrl === 'string') {
        component = await parse(componentUrl);
    } else {
        const source = await readFile(componentUrl);
        component = componentUrl.pathname.endsWith('.wat') ? await parse(source.toString('utf8')) : source;
    }
    const { files } = generate(component, {
        name: 'component',
        callTracking,
        instantiation: { tag: 'async' },
        noTypescript: true,
        cmRuntimeEsModule:
            env.JCO_TEST_RUNTIME === 'external'
                ? new URL('../../jco-cm-runtime/dist/', import.meta.url).href
                : undefined,
        map: [],
    });
    return files;
}

/** `instantiate` for `wat`: each call makes a new instance of one transpiled module. */
async function transpiled(wat, callTracking = false) {
    let source;
    const modules = new Map();
    for (const [name, bytes] of await generated(wat, callTracking)) {
        if (name.endsWith('.wasm')) {
            modules.set(name, WebAssembly.compile(bytes));
        } else if (name.endsWith('.js')) {
            source = Buffer.from(bytes).toString('base64');
        }
    }
    const { instantiate } = await import(`data:text/javascript;base64,${source}`);
    return (imports, options, instantiateCore) =>
        instantiate(
            (name) => modules.get(name),
            { ...new WASIShim().getImportObject(), ...imports },
            instantiateCore,
            options,
        );
}

/**
 * Runs `body` in a process of its own, with `instantiate` and `sleep` in scope,
 * and `print` for what the test expects to read. Resolves once the process has
 * exited on its own, or has been killed for not doing so in time.
 */
async function ownProcess(wat, body) {
    const dir = await getTmpDir();
    try {
        for (const [name, bytes] of await generated(wat)) {
            await writeFile(join(dir, name.replace(/\.js$/, '.mjs')), bytes);
        }
        const script = join(dir, 'run.mjs');
        await writeFile(
            script,
            `
            import { WASIShim } from ${JSON.stringify(import.meta.resolve('@bytecodealliance/preview2-shim/instantiation'))};
            import { writeSync } from "node:fs";
            import { readFile } from "node:fs/promises";
            import { instantiate as generated } from ${JSON.stringify(pathToFileURL(join(dir, 'component.mjs')).href)};
            const dir = ${JSON.stringify(dir)};
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const print = (...args) => writeSync(1, args.join(" ") + "\\n");
            const instantiate = (imports, options) => generated(
                async (name) => WebAssembly.compile(await readFile(dir + "/" + name)),
                { ...new WASIShim().getImportObject(), ...imports },
                undefined,
                options,
            );
            ${body}
            `,
        );
        return await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [...execArgv.filter((arg) => arg.includes('wasm')), script], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let out = '';
            let err = '';
            child.stdout.on('data', (data) => (out += data));
            child.stderr.on('data', (data) => (err += data));
            const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
            child.on('error', reject);
            child.on('close', (code, signal) => {
                clearTimeout(timeout);
                resolve({ code, signal, out, err });
            });
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

/** A host object that counts how often it is disposed. */
function things() {
    const disposed = new Map();
    class Thing {
        [Symbol.dispose]() {
            disposed.set(this, (disposed.get(this) ?? 0) + 1);
        }
    }
    return { Thing, disposed };
}

/** No async at all: what a guest holds, drops or is lent is up to which export it is given to. */
const SYNC_THINGS = rustComponent('instance-stop-resources');

/**
 * `start` returns a stream, and its task writes to it for as long as it can, one
 * item at a time, calling a host import for each.
 */
const WRITES_FOREVER = new URL('./fixtures/components/p3/instance-stop-writes-forever.wat', import.meta.url);

/** `start` returns a stream and a future it never writes to, and its task waits. */
const NEVER_WRITES = rustComponent('instance-stop-unwritten');

/**
 * A write of `start`'s blocks, as nothing reads it. It then drops the object it is
 * given, and writes again, whose result only it sees if the host ends the instance
 * on being told of that drop. Memory has what its writes returned: the first at 96,
 * the second at 100.
 */
const WRITES_ACROSS_THE_END = new URL('./fixtures/components/p3/instance-stop-reentrant-write.wat', import.meta.url);

/** `feed` takes a stream from the host, reads it, and waits for the read. */
const READS_FROM_HOST = rustComponent('instance-stop-reader');

/**
 * Each `start` makes a call of a composed component, and returns before it ends.
 * `later`'s task then traps in a callback, by when no call of the host's is left to
 * fail. `first` traps as it starts.
 */
const TRAPS_IN_THE_BACKGROUND = new URL('./fixtures/components/p3/background-traps-composed.wat', import.meta.url);

/** `start` returns, and its own task traps in a callback. `stuck` waits on nothing that can happen. */
const TRAPS_AFTER_RETURNING = new URL('./fixtures/components/p3/background-traps-after-return.wat', import.meta.url);

suite('stopping an instance', () => {
    test.concurrent('each host object is disposed once, and what was only lent is not', async () => {
        const instantiate = await transpiled(SYNC_THINGS);
        const { Thing, disposed } = things();
        const instance = await instantiate({
            'jco:test-components/instance-stop-host': { Thing, stop() {}, destroyed() {} },
        });

        const held = new Thing();
        instance.hold(held);
        const dropped = new Thing();
        instance.drop(dropped);
        assert.strictEqual(disposed.get(dropped), 1, 'jco disposes what a guest drops');
        // A guest holds it twice, and drops it once: jco disposes it.
        const twice = new Thing();
        instance.hold(twice);
        instance.drop(twice);
        assert.strictEqual(disposed.get(twice), 1);
        const lent = new Thing();
        instance.borrow(lent);

        instance._util.stop();
        assert.strictEqual(disposed.get(held), 1);
        assert.strictEqual(disposed.get(dropped), 1);
        assert.strictEqual(disposed.get(twice), 1);
        assert.isFalse(disposed.has(lent), 'the host still owns what it lent');

        instance._util.stop();
        assert.strictEqual(disposed.get(held), 1);
    });
});

// Async component exports require the current JSPI API, which older Node versions lack.
suite.skipIf(!hasJspi)('stopping an instance closes its streams and futures', () => {
    test.concurrent("a guest's writer stops, and its reader sees a shutdown error", async () => {
        const instantiate = await transpiled(WRITES_FOREVER);
        let ticks = 0;
        const instance = await instantiate({ 'test:host/api': { tick: () => (ticks += 1) } });
        const stream = await instance.start();
        for (let i = 0; i < 3; i++) {
            const { value, done } = await stream.next();
            assert.isFalse(done);
            assert.deepStrictEqual([...value], [7]);
        }
        instance._util.stop();
        const ended = ticks;
        await expect(stream.next()).rejects.toMatchObject({ code: 'ERR_COMPONENT_STOPPED' });
        await sleep(50);
        assert.strictEqual(ticks, ended);
    });

    test.concurrent('a pending read settles, of a stream or a future', async () => {
        const instantiate = await transpiled(NEVER_WRITES);
        const instance = await instantiate({});
        const [stream, future] = await instance.start();
        const read = expect(stream.next()).rejects.toMatchObject({
            code: 'ERR_COMPONENT_STOPPED',
            message: 'component instance has been stopped',
        });
        const value = expect(Promise.resolve(future)).rejects.toThrow(/component instance has been stopped/);
        await sleep(10);
        instance._util.stop();
        await read;
        await value;
        // Later reads report the same interruption without waiting.
        await expect(stream.next()).rejects.toMatchObject({ code: 'ERR_COMPONENT_STOPPED' });
    });

    test.concurrent('a stream first read after stop reports a host-side shutdown error', async () => {
        const instantiate = await transpiled(NEVER_WRITES);
        const instance = await instantiate({});
        const [stream] = await instance.start();
        instance._util.stop();
        await expect(stream.next()).rejects.toMatchObject({ code: 'ERR_COMPONENT_STOPPED' });
        assert.deepStrictEqual(await stream.return(), { done: true });
    });

    test.concurrent('queued host reads all report shutdown', async () => {
        const instantiate = await transpiled(NEVER_WRITES);
        const instance = await instantiate({});
        const [stream] = await instance.start();
        const reads = Array.from({ length: 3 }, () =>
            expect(stream.next()).rejects.toMatchObject({ code: 'ERR_COMPONENT_STOPPED' }),
        );
        await sleep(10);
        instance._util.stop();
        await Promise.all(reads);
    });

    test.concurrent('returning a stream before stop remains an ordinary close', async () => {
        const instantiate = await transpiled(NEVER_WRITES);
        const instance = await instantiate({});
        const [stream] = await instance.start();
        const read = stream.next();
        await sleep(10);
        await stream.return();
        instance._util.stop();
        assert.isTrue((await read).done);
        assert.isTrue((await stream.next()).done);
    });

    test.concurrent('a naturally ended stream stays at EOF after stop', async () => {
        const instantiate = await transpiled(READS_FROM_HOST);
        const instance = await instantiate({});
        const stream = instance.pass((async function* () {})());
        assert.isTrue((await stream.next()).done);
        instance._util.stop();
        assert.isTrue((await stream.next()).done);
    });

    test.concurrent('a copied stream item survives stop before its host continuation', async () => {
        const instantiate = await transpiled(WRITES_FOREVER);
        const instance = await instantiate({ 'test:host/api': { tick() {} } });
        const stream = await instance.start();
        const read = stream.next();
        instance._util.stop();
        const { value, done } = await read;
        assert.isFalse(done);
        assert.deepStrictEqual([...value], [7]);
        await expect(stream.next()).rejects.toMatchObject({ code: 'ERR_COMPONENT_STOPPED' });
    });

    test.concurrent('a future first read after the stop fails', async () => {
        const instantiate = await transpiled(NEVER_WRITES);
        const instance = await instantiate({});
        const [, future] = await instance.start();
        instance._util.stop();
        await expect(Promise.resolve(future)).rejects.toThrow(/component instance has been stopped/);
    });

    test.concurrent("a pending write fails, and so does the writer's next", async () => {
        const instantiate = await transpiled(WRITES_ACROSS_THE_END);
        let memory;
        class Thing {
            [Symbol.dispose]() {
                instance._util.stop();
            }
        }
        const instance = await instantiate({ 'test:host/things': { Thing } }, undefined, async (module, imports) => {
            const core = await WebAssembly.instantiate(module, imports);
            memory ??= core.exports.memory;
            return core;
        });
        await expect(instance.start(new Thing())).rejects.toThrow(/component instance has been stopped/);
        const written = new Uint32Array(memory.buffer, 96, 2);
        assert.strictEqual(written[0], 0xffffffff, 'blocked, with no reader');
        assert.strictEqual(written[1] & 0xf, 1, 'dropped, with no items written');
        assert.strictEqual(written[1] >> 4, 0);
    });

    test.concurrent('what a host writes to a guest is stopped', async () => {
        const instantiate = await transpiled(READS_FROM_HOST);
        const instance = await instantiate({});
        let reads = 0;
        let returned = false;
        await instance.feed({
            [Symbol.asyncIterator]() {
                return this;
            },
            next() {
                reads += 1;
                return new Promise(() => {});
            },
            async return() {
                returned = true;
                return { done: true };
            },
        });
        while (reads === 0) {
            await sleep(1);
        }
        instance._util.stop();
        await sleep(0);
        assert.isTrue(returned);
        assert.strictEqual(reads, 1);
    });

    test.concurrent('what a host stream yields after the stop is disposed', async () => {
        const instantiate = await transpiled(READS_FROM_HOST);
        const instance = await instantiate({});
        let release;
        let reading = false;
        let disposed = 0;
        const late = {
            [Symbol.dispose]() {
                disposed += 1;
            },
        };
        await instance.feed({
            [Symbol.asyncIterator]() {
                return this;
            },
            next() {
                reading = true;
                return new Promise((resolve) => {
                    release = () => resolve({ done: false, value: late });
                });
            },
            async return() {
                return { done: true };
            },
        });
        while (!reading) {
            await sleep(1);
        }
        instance._util.stop();
        release();
        await sleep(1);
        assert.strictEqual(disposed, 1);
    });

    test.concurrent('late host stream values are disposed after reader return without stopping', async ({ expect }) => {
        const instantiate = await transpiled(READS_FROM_HOST);
        const instance = await instantiate({});
        let release;
        let reading;
        const started = new Promise((resolve) => {
            reading = resolve;
        });
        let disposed = 0;
        const source = {
            [Symbol.asyncIterator]() {
                return this;
            },
            next() {
                reading();
                return new Promise((resolve) => {
                    release = () =>
                        resolve({
                            done: false,
                            value: {
                                [Symbol.dispose]() {
                                    disposed += 1;
                                },
                            },
                        });
                });
            },
            async return() {
                return { done: true };
            },
        };
        try {
            const reader = instance.pass(source)[Symbol.asyncIterator]();
            const pending = reader.next();
            await started;
            await reader.return();
            release();
            assert.isTrue((await pending).done);
            await expect.poll(() => disposed).toBe(1);
        } finally {
            instance._util.stop();
        }
    });

    test.concurrent("another instance's stream is unaffected", async () => {
        const instantiate = await transpiled(WRITES_FOREVER);
        const imports = { 'test:host/api': { tick() {} } };
        const ended = await instantiate(imports);
        const other = await instantiate(imports);
        const endedStream = await ended.start();
        const otherStream = await other.start();
        assert.isFalse((await otherStream.next()).done);
        ended._util.stop();
        await expect(endedStream.next()).rejects.toMatchObject({ code: 'ERR_COMPONENT_STOPPED' });
        for (let i = 0; i < 3; i++) {
            assert.isFalse((await otherStream.next()).done);
        }
        other._util.stop();
        await expect(otherStream.next()).rejects.toMatchObject({ code: 'ERR_COMPONENT_STOPPED' });
    });

    test.concurrent('the process exits with reads pending', async () => {
        const { code, signal, out, err } = await ownProcess(
            NEVER_WRITES,
            `
            const instance = await instantiate({});
            const [stream, future] = await instance.start();
            stream.next().catch((e) => print("read failed:", e.code));
            Promise.resolve(future).catch((e) => print("future failed:", e.message));
            await sleep(10);
            instance._util.stop();
            print("finished");
            `,
        );
        assert.strictEqual(err, '');
        assert.deepStrictEqual({ code, signal }, { code: 0, signal: null });
        const lines = out.trim().split('\n').sort();
        assert.deepStrictEqual(lines, [
            'finished',
            'future failed: component instance has been stopped',
            'read failed: ERR_COMPONENT_STOPPED',
        ]);
    });

    test.concurrent('the process exits with a guest still writing', async () => {
        const { code, signal, out, err } = await ownProcess(
            WRITES_FOREVER,
            `
            const instance = await instantiate({ "test:host/api": { tick() {} } });
            const stream = await instance.start();
            await stream.next();
            instance._util.stop();
            await stream.next().catch((e) => print("finished", e.code));
            `,
        );
        assert.strictEqual(err, '');
        assert.deepStrictEqual({ code, signal }, { code: 0, signal: null });
        assert.strictEqual(out, 'finished ERR_COMPONENT_STOPPED\n');
    });
});

// A structurally empty component checks that utilities need no core module or exports.
const NO_EXPORTS = `(component)`;

/** `feed` returns, and its task stays until the stream it reads gives it something. */
const LINGERS = READS_FROM_HOST;

suite.skipIf(!hasJspi)('knowing when an instance is idle', () => {
    /** A stream of one byte, which comes when `release` is called. */
    function oneByte() {
        let release!: () => void;
        const arrives = new Promise<void>((resolve) => (release = resolve));
        let sent = false;
        return {
            release,
            stream: {
                [Symbol.asyncIterator]() {
                    return this;
                },
                async next() {
                    if (sent) {
                        return { done: true };
                    }
                    await arrives;
                    sent = true;
                    return { done: false, value: 1 };
                },
                async return() {
                    return { done: true };
                },
            },
        };
    }

    /** Observe that a promise stays pending while its task is blocked by the host. */
    async function settled(promise: Promise<unknown>) {
        let done = false;
        promise.then(() => (done = true));
        await sleep(20);
        return done;
    }

    test.concurrent('with nothing running it already is', async () => {
        const instance = await (await transpiled(LINGERS))({});
        await instance._util.whenIdle();
        const bare = await (await transpiled(NO_EXPORTS))({});
        await bare._util.whenIdle();
    });

    test.concurrent('a task that has returned counts until it has exited', async () => {
        const instance = await (await transpiled(LINGERS))({});
        const { stream, release } = oneByte();
        await instance.feed(stream);
        const idle = instance._util.whenIdle();
        assert.isFalse(await settled(idle), 'its task is still reading');
        release();
        await idle;
        await instance._util.whenIdle();
    });

    test.concurrent('stopping an instance ends the wait', async () => {
        const instance = await (await transpiled(LINGERS))({});
        await instance.feed(oneByte().stream);
        const idle = instance._util.whenIdle();
        assert.isFalse(await settled(idle));
        instance._util.stop();
        await idle;
        await instance._util.whenIdle();
    });

    test.concurrent('a trap ends the wait', async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        const instance = await instantiate({}, { onTrap() {} });
        await instance.start();
        // Wait for the notification itself; callback scheduling can exceed a short timer under load.
        await instance._util.whenIdle();
    });

    test.concurrent('tracked calls finish independently beside unrelated work', async () => {
        const instance = await (await transpiled(LINGERS, true))({});
        const [one, other] = [oneByte(), oneByte()];
        try {
            const first = instance._util.calls.start(instance.feed, one.stream);
            const second = instance._util.calls.start(instance.feed, other.stream);
            await Promise.all([first.result, second.result]);
            assert.isFalse(await settled(first.finished));
            one.release();
            assert.deepStrictEqual(await first.finished, { status: 'completed' });
            assert.isFalse(await settled(second.finished));
            assert.isFalse(await settled(instance._util.whenIdle()));
            other.release();
            assert.deepStrictEqual(await second.finished, { status: 'completed' });
            await instance._util.whenIdle();
        } finally {
            instance._util.stop();
        }
    });

    test.concurrent('a tracked call includes composed callees after its own task exits', async () => {
        let finished = false;
        let reportTrap!: (error: Error) => void;
        const trapped = new Promise<Error>((resolve) => {
            reportTrap = resolve;
        });
        const instance = await (
            await transpiled(TRAPS_IN_THE_BACKGROUND, true)
        )(
            {},
            {
                onTrap(error) {
                    reportTrap(error);
                },
            },
        );
        const call = instance._util.calls.start(instance.startLater);
        call.finished.then(() => {
            finished = true;
        });
        await call.result;
        assert.isFalse(finished, 'the composed callee still has execution left');
        const error = await trapped;
        assert.match(error.message, /unreachable/);
        assert.deepStrictEqual(await call.finished, { status: 'trapped', error });
    });

    test.concurrent('handles are frozen and reject functions from another instance', async () => {
        const instantiate = await transpiled(LINGERS, true);
        const first = await instantiate({});
        const other = await instantiate({});
        try {
            const call = first._util.calls.start(first.feed, oneByte().stream);
            await call.result;
            assert.isTrue(Object.isFrozen(call));
            assert.deepStrictEqual(Object.keys(call).sort(), ['finished', 'result']);
            assert.isTrue(Object.isFrozen(first._util.calls));
            assert.throws(() => other._util.calls.start(first.feed, oneByte().stream), TypeError);
            assert.throws(() => first._util.calls.start(() => undefined), TypeError);
            assert.throws(() => first._util.calls.start(undefined), TypeError);
            other._util.stop();
            assert.isFalse(await settled(call.finished));
            first._util.stop();
            assert.deepStrictEqual(await call.finished, { status: 'stopped' });
        } finally {
            first._util.stop();
            other._util.stop();
        }
    });

    test.concurrent('async entry failures settle without adopting an earlier call', async () => {
        const instance = await (await transpiled(LINGERS, true))({});
        const first = instance._util.calls.start(instance.feed, oneByte().stream);
        await first.result;
        instance._util.stop();
        const afterStop = instance._util.calls.start(instance.feed, oneByte().stream);
        await expect(afterStop.result).rejects.toThrow(/stopped/);
        assert.deepStrictEqual(await afterStop.finished, { status: 'stopped' });
        assert.deepStrictEqual(await first.finished, { status: 'stopped' });
    });

    test.concurrent('another instance of the same module is its own', async () => {
        const instantiate = await transpiled(LINGERS);
        const [first, second] = [await instantiate({}), await instantiate({})];
        const { stream, release } = oneByte();
        await first.feed(stream);
        await second._util.whenIdle();
        const idle = first._util.whenIdle();
        assert.isFalse(await settled(idle));
        release();
        await idle;
    });
});

suite.skipIf(!hasJspi)('hearing of traps', () => {
    /** Resolves with the first trap `onTrap` is given, with every one kept in `traps`. */
    function hear() {
        const traps = [];
        let heard;
        const first = new Promise((resolve) => (heard = resolve));
        const onTrap = (err) => {
            traps.push(err);
            heard(err);
        };
        return { traps, first, onTrap };
    }

    test.concurrent('a trap in a task that has returned, which no call can report', async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        const { traps, first, onTrap } = hear();
        const instance = await instantiate({}, { onTrap });
        await instance.start();
        const err = await first;
        assert.instanceOf(err, WebAssembly.RuntimeError);
        assert.match(err.message, /unreachable/);
        await sleep(20);
        assert.strictEqual(traps.length, 1);
    });

    test.concurrent("a trap in a composed component's call, once the call of the host's has returned", async () => {
        const instantiate = await transpiled(TRAPS_IN_THE_BACKGROUND);
        const { traps, first, onTrap } = hear();
        const instance = await instantiate({}, { onTrap });
        await instance.startLater();
        const err = await first;
        assert.match(err.message, /unreachable/);
        await sleep(20);
        assert.strictEqual(traps.length, 1);
    });

    test.concurrent("a trap as a composed component's call starts", async () => {
        const instantiate = await transpiled(TRAPS_IN_THE_BACKGROUND);
        const { first, onTrap } = hear();
        const instance = await instantiate({}, { onTrap });
        await expect(instance.startFirst()).rejects.toThrow(/unreachable/);
        assert.match((await first).message, /unreachable/);
    });

    test.concurrent('a trap that fails a call is heard too, by the time the call has failed', async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        const { traps, onTrap } = hear();
        const instance = await instantiate({}, { onTrap });
        assert.throws(() => instance.syncTrap(), /unreachable/);
        assert.strictEqual(traps.length, 1);
    });

    test.concurrent('each trap is heard once', async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        const { traps, first, onTrap } = hear();
        const instance = await instantiate({}, { onTrap });
        await instance.start();
        await first;
        // That ended only its task: it can happen again.
        await instance.start();
        while (traps.length < 2) {
            await sleep(1);
        }
        assert.notStrictEqual(traps[0], traps[1]);
        // A trap of the instance's: it can't be entered again, which is not another trap.
        assert.throws(() => instance.syncTrap());
        assert.throws(() => instance.syncTrap());
        assert.strictEqual(traps.length, 3);
    });

    test.concurrent('a deadlock is a trap', async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        const { first, onTrap } = hear();
        const instance = await instantiate({}, { onTrap });
        await expect(instance.stuck()).rejects.toThrow(/deadlock/);
        assert.match((await first).message, /deadlock/);
    });

    test.concurrent('no trap is heard of for stopping an instance, and none after', async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        const { traps, onTrap } = hear();
        const ended = await instantiate({}, { onTrap });
        const stuck = ended.stuck().catch(() => {});
        ended._util.stop();
        await stuck;
        await sleep(20);
        assert.deepStrictEqual(traps, []);
    });

    test.concurrent('it may stop the instance', async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        let ended;
        const heard = new Promise((resolve) => (ended = resolve));
        const instance = await instantiate(
            {},
            {
                onTrap: (err) => {
                    instance._util.stop();
                    ended(err);
                },
            },
        );
        await instance.start();
        assert.match((await heard).message, /unreachable/);
        await sleep(20);
        await expect(instance.start()).rejects.toThrow(/component instance has been stopped/);
    });

    test.concurrent('another instance of the same module hears only its own', async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        const mine = hear();
        const yours = hear();
        const trapping = await instantiate({}, { onTrap: mine.onTrap });
        const other = await instantiate({}, { onTrap: yours.onTrap });
        await trapping.start();
        await mine.first;
        await sleep(20);
        assert.deepStrictEqual(yours.traps, []);
        other._util.stop();
    });

    test.concurrent('an instance without the option traps as before, and its process exits', async () => {
        const { code, signal, out, err } = await ownProcess(
            TRAPS_AFTER_RETURNING,
            `
            const instance = await instantiate({});
            await instance.start();
            await sleep(20);
            print("finished");
            `,
        );
        assert.strictEqual(err, '');
        assert.deepStrictEqual({ code, signal }, { code: 0, signal: null });
        assert.strictEqual(out, 'finished\n');
    });

    test.concurrent('what onTrap throws is left uncaught', async () => {
        const { code, signal, err } = await ownProcess(
            TRAPS_AFTER_RETURNING,
            `
            const instance = await instantiate({}, { onTrap: () => { throw new Error("from onTrap"); } });
            await instance.start();
            await sleep(100);
            print("not reached");
            `,
        );
        assert.notStrictEqual(code, 0);
        assert.isNull(signal);
        assert.include(err, 'from onTrap');
    });
});
