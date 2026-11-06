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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Locate components built from crates/test-components alongside the transpiler fixtures. */
function rustComponent(name) {
    return new URL(`./fixtures/generated/rust-test-components/${name}.wasm`, import.meta.url);
}

/** Transpile a Rust component, or a focused canonical ABI regression written in WAT. */
async function generated(wat) {
    await $init;
    const { files } = generate(wat instanceof URL ? await readFile(wat) : await parse(wat), {
        name: 'component',
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
async function transpiled(wat) {
    let source;
    const modules = new Map();
    for (const [name, bytes] of await generated(wat)) {
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
// Drive one write per canonical callback, independently of a language executor.
const WRITES_FOREVER = `
(component
  (import "test:host/api" (instance $host
    (export "tick" (func))
  ))
  (alias export $host "tick" (func $tick))
  (type $s (stream u8))
  (core module $mem (memory (export "memory") 1))
  (core instance $mem_i (instantiate $mem))
  (alias core export $mem_i "memory" (core memory $memory))
  (core func $tick_l (canon lower (func $tick)))
  (core func $stream_new (canon stream.new $s))
  (core func $stream_write (canon stream.write $s async (memory $memory)))
  (core func $task_return (canon task.return (result $s)))
  (core func $set_new (canon waitable-set.new))
  (core func $join (canon waitable.join))
  (core module $m
    (import "" "memory" (memory 1))
    (import "" "tick" (func $tick))
    (import "" "stream.new" (func $stream_new (result i64)))
    (import "" "stream.write" (func $write (param i32 i32 i32) (result i32)))
    (import "" "task.return" (func $ret (param i32)))
    (import "" "waitable-set.new" (func $set_new (result i32)))
    (import "" "waitable.join" (func $join (param i32 i32)))
    (global $writer (mut i32) (i32.const 0))
    (global $set (mut i32) (i32.const 0))
    ;; What to do after writing an item: wait for it to be taken, or write again.
    (func $next (param $written i32) (result i32)
      (if (result i32) (i32.eq (local.get $written) (i32.const -1))
        (then (i32.or (i32.const 2) (i32.shl (global.get $set) (i32.const 4))))
        (else (i32.const 1))
      )
    )
    (func (export "start") (result i32)
      (local $ends i64)
      (local.set $ends (call $stream_new))
      (global.set $writer (i32.wrap_i64 (i64.shr_u (local.get $ends) (i64.const 32))))
      (global.set $set (call $set_new))
      (call $ret (i32.wrap_i64 (local.get $ends)))
      (i32.store8 (i32.const 16) (i32.const 7))
      (call $next (call $write (global.get $writer) (i32.const 16) (i32.const 1)))
      (call $join (global.get $writer) (global.get $set))
    )
    (func (export "cb") (param i32 i32 i32) (result i32)
      (call $tick)
      (call $next (call $write (global.get $writer) (i32.const 16) (i32.const 1)))
    )
  )
  (core instance $i (instantiate $m (with "" (instance
    (export "memory" (memory $memory))
    (export "tick" (func $tick_l))
    (export "stream.new" (func $stream_new))
    (export "stream.write" (func $stream_write))
    (export "task.return" (func $task_return))
    (export "waitable-set.new" (func $set_new))
    (export "waitable.join" (func $join))
  ))))
  (type $start (func async (result $s)))
  (func (export "start") (type $start)
    (canon lift (core func $i "start") async (callback (core func $i "cb"))))
)`;

/** `start` returns a stream and a future it never writes to, and its task waits. */
const NEVER_WRITES = rustComponent('instance-stop-unwritten');

/**
 * A write of `start`'s blocks, as nothing reads it. It then drops the object it is
 * given, and writes again, whose result only it sees if the host ends the instance
 * on being told of that drop. Memory has what its writes returned: the first at 96,
 * the second at 100.
 */
// Keep WAT here to observe raw write results in memory after a reentrant stop.
// Rust ownership and executor teardown would hide this canonical ABI boundary.
const WRITES_ACROSS_THE_END = `
(component
  (import "test:host/things" (instance $host
    (export "thing" (type (sub resource)))
  ))
  (alias export $host "thing" (type $thing))
  (type $s (stream u8))
  (core module $mem (memory (export "memory") 1))
  (core instance $mem_i (instantiate $mem))
  (alias core export $mem_i "memory" (core memory $memory))
  (core func $drop (canon resource.drop $thing))
  (core func $stream_new (canon stream.new $s))
  (core func $stream_write (canon stream.write $s async (memory $memory)))
  (core module $m
    (import "" "memory" (memory 1))
    (import "" "drop" (func $drop (param i32)))
    (import "" "stream.new" (func $stream_new (result i64)))
    (import "" "stream.write" (func $write (param i32 i32 i32) (result i32)))
    (func (export "start") (param $thing i32) (result i32)
      (local $writer i32)
      (local.set $writer (i32.wrap_i64 (i64.shr_u (call $stream_new) (i64.const 32))))
      (i32.store (i32.const 96) (call $write (local.get $writer) (i32.const 16) (i32.const 1)))
      (call $drop (local.get $thing))
      (i32.store (i32.const 100) (call $write (local.get $writer) (i32.const 16) (i32.const 1)))
      (i32.const 0)
    )
    (func (export "cb") (param i32 i32 i32) (result i32) (unreachable))
  )
  (core instance $i (instantiate $m (with "" (instance
    (export "memory" (memory $memory))
    (export "drop" (func $drop))
    (export "stream.new" (func $stream_new))
    (export "stream.write" (func $stream_write))
  ))))
  (type $start (func async (param "t" (own $thing))))
  (func (export "start") (type $start)
    (canon lift (core func $i "start") async (callback (core func $i "cb"))))
)`;

/** `feed` takes a stream from the host, reads it, and waits for the read. */
const READS_FROM_HOST = rustComponent('instance-stop-reader');

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
const HAS_JSPI = typeof WebAssembly.Suspending === 'function' && typeof WebAssembly.promising === 'function';
suite.skipIf(!HAS_JSPI)('stopping an instance closes its streams and futures', () => {
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
