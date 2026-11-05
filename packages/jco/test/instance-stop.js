/** Exercise instance cleanup and task lifecycle through generated bindings and isolated processes. */
import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env, execArgv } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { assert, expect, suite, test } from "vitest";

import { parse } from "../src/api.js";
import { $init, generate } from "../obj/js-component-bindgen-component.js";
import { getTmpDir } from "./helpers.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Locate components built from crates/test-components alongside the transpiler fixtures. */
function rustComponent(name) {
    return new URL(`../../jco-transpile/test/fixtures/generated/rust-test-components/${name}.wasm`, import.meta.url);
}

/** Transpile a Rust component, or a focused canonical ABI regression written in WAT. */
async function generated(wat) {
    await $init;
    const { files } = generate(wat instanceof URL ? await readFile(wat) : await parse(wat), {
        name: "component",
        instantiation: { tag: "async" },
        noTypescript: true,
        cmRuntimeEsModule:
            env.JCO_TEST_RUNTIME === "external"
                ? new URL("../../jco-cm-runtime/dist/", import.meta.url).href
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
        if (name.endsWith(".wasm")) {
            modules.set(name, WebAssembly.compile(bytes));
        } else if (name.endsWith(".js")) {
            source = Buffer.from(bytes).toString("base64");
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
            await writeFile(join(dir, name.replace(/\.js$/, ".mjs")), bytes);
        }
        const script = join(dir, "run.mjs");
        await writeFile(
            script,
            `
            import { WASIShim } from ${JSON.stringify(import.meta.resolve("@bytecodealliance/preview2-shim/instantiation"))};
            import { writeSync } from "node:fs";
            import { readFile } from "node:fs/promises";
            import { instantiate as generated } from ${JSON.stringify(pathToFileURL(join(dir, "component.mjs")).href)};
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
            const child = spawn(process.execPath, [...execArgv.filter((arg) => arg.includes("wasm")), script], {
                stdio: ["ignore", "pipe", "pipe"],
            });
            let out = "";
            let err = "";
            child.stdout.on("data", (data) => (out += data));
            child.stderr.on("data", (data) => (err += data));
            const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
            child.on("error", reject);
            child.on("close", (code, signal) => {
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
const SYNC_THINGS = rustComponent("instance-stop-resources");

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
const NEVER_WRITES = rustComponent("instance-stop-unwritten");

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
const READS_FROM_HOST = rustComponent("instance-stop-reader");

/**
 * Each `start` makes a call of a composed component, and returns before it ends.
 * `later`'s task then traps in a callback, by when no call of the host's is left to
 * fail. `first` traps as it starts.
 */
// Exact callback traps and nested task-return ordering require direct canonical ABI control.
const TRAPS_IN_THE_BACKGROUND = `
(component
  (component $callee
    (core module $m
      (func (export "first") (result i32) (unreachable))
      (func (export "later") (result i32) (i32.const 1))
      (func (export "cb") (param i32 i32 i32) (result i32) (unreachable))
    )
    (core instance $i (instantiate $m))
    (type $t (func async))
    (func (export "first") (type $t) (canon lift (core func $i "first") async (callback (core func $i "cb"))))
    (func (export "later") (type $t) (canon lift (core func $i "later") async (callback (core func $i "cb"))))
  )
  (instance $c (instantiate $callee))
  (core func $first (canon lower (func $c "first") async))
  (core func $later (canon lower (func $c "later") async))
  (core func $task_return (canon task.return))
  (core module $m
    (import "" "first" (func $first (result i32)))
    (import "" "later" (func $later (result i32)))
    (import "" "task.return" (func $ret))
    (func (export "start-first") (result i32)
      (drop (call $first))
      (call $ret)
      (i32.const 0)
    )
    (func (export "start-later") (result i32)
      (drop (call $later))
      (call $ret)
      (i32.const 0)
    )
    (func (export "cb") (param i32 i32 i32) (result i32) (i32.const 0))
  )
  (core instance $i (instantiate $m (with "" (instance
    (export "first" (func $first))
    (export "later" (func $later))
    (export "task.return" (func $task_return))
  ))))
  (type $t (func async))
  (func (export "start-first") (type $t)
    (canon lift (core func $i "start-first") async (callback (core func $i "cb"))))
  (func (export "start-later") (type $t)
    (canon lift (core func $i "start-later") async (callback (core func $i "cb"))))
)`;

/** `start` returns, and its own task traps in a callback. `stuck` waits on nothing that can happen. */
// Exercise the raw callback/deadlock protocol independently of a language executor.
const TRAPS_AFTER_RETURNING = `
(component
  (type $s (stream u8))
  (core func $stream_new (canon stream.new $s))
  (core func $task_return (canon task.return))
  (core func $set_new (canon waitable-set.new))
  (core func $join (canon waitable.join))
  (core module $m
    (import "" "stream.new" (func $stream_new (result i64)))
    (import "" "task.return" (func $ret))
    (import "" "waitable-set.new" (func $set_new (result i32)))
    (import "" "waitable.join" (func $join (param i32 i32)))
    (func (export "start") (result i32)
      (call $ret)
      (i32.const 1)
    )
    (func (export "stuck") (result i32)
      (local $set i32)
      (local.set $set (call $set_new))
      (call $join (i32.wrap_i64 (call $stream_new)) (local.get $set))
      (i32.or (i32.const 2) (i32.shl (local.get $set) (i32.const 4)))
    )
    (func (export "cb") (param i32 i32 i32) (result i32) (unreachable))
    (func (export "sync-trap") (unreachable))
  )
  (core instance $i (instantiate $m (with "" (instance
    (export "stream.new" (func $stream_new))
    (export "task.return" (func $task_return))
    (export "waitable-set.new" (func $set_new))
    (export "waitable.join" (func $join))
  ))))
  (type $t (func async))
  (func (export "start") (type $t)
    (canon lift (core func $i "start") async (callback (core func $i "cb"))))
  (func (export "stuck") (type $t)
    (canon lift (core func $i "stuck") async (callback (core func $i "cb"))))
  (func (export "sync-trap") (canon lift (core func $i "sync-trap")))
)`;

suite("stopping an instance", () => {
    test.concurrent("each host object is disposed once, and what was only lent is not", async () => {
        const instantiate = await transpiled(SYNC_THINGS);
        const { Thing, disposed } = things();
        const instance = await instantiate({
            "jco:test-components/instance-stop-host": { Thing, stop() {}, destroyed() {} },
        });

        const held = new Thing();
        instance.hold(held);
        const dropped = new Thing();
        instance.drop(dropped);
        assert.strictEqual(disposed.get(dropped), 1, "jco disposes what a guest drops");
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
        assert.isFalse(disposed.has(lent), "the host still owns what it lent");

        instance._util.stop();
        assert.strictEqual(disposed.get(held), 1);
    });
});

suite("stopping an instance closes its streams and futures", () => {
    test.concurrent("a guest's writer stops, and its reader sees the stream end", async () => {
        const instantiate = await transpiled(WRITES_FOREVER);
        let ticks = 0;
        const instance = await instantiate({ "test:host/api": { tick: () => (ticks += 1) } });
        const stream = await instance.start();
        for (let i = 0; i < 3; i++) {
            const { value, done } = await stream.next();
            assert.isFalse(done);
            assert.deepStrictEqual([...value], [7]);
        }
        instance._util.stop();
        const ended = ticks;
        assert.isTrue((await stream.next()).done);
        await sleep(50);
        assert.strictEqual(ticks, ended);
    });

    test.concurrent("a pending read settles, of a stream or a future", async () => {
        const instantiate = await transpiled(NEVER_WRITES);
        const instance = await instantiate({});
        const [stream, future] = await instance.start();
        const read = stream.next();
        const value = expect(Promise.resolve(future)).rejects.toThrow(/component instance has been stopped/);
        await sleep(10);
        instance._util.stop();
        assert.isTrue((await read).done);
        await value;
        // Later ones have nothing to wait for.
        assert.isTrue((await stream.next()).done);
    });

    test.concurrent("a future first read after the stop fails", async () => {
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
        const instance = await instantiate({ "test:host/things": { Thing } }, undefined, async (module, imports) => {
            const core = await WebAssembly.instantiate(module, imports);
            memory ??= core.exports.memory;
            return core;
        });
        await expect(instance.start(new Thing())).rejects.toThrow(/component instance has been stopped/);
        const written = new Uint32Array(memory.buffer, 96, 2);
        assert.strictEqual(written[0], 0xffffffff, "blocked, with no reader");
        assert.strictEqual(written[1] & 0xf, 1, "dropped, with no items written");
        assert.strictEqual(written[1] >> 4, 0);
    });

    test.concurrent("what a host writes to a guest is stopped", async () => {
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
        const imports = { "test:host/api": { tick() {} } };
        const ended = await instantiate(imports);
        const other = await instantiate(imports);
        const endedStream = await ended.start();
        const otherStream = await other.start();
        assert.isFalse((await otherStream.next()).done);
        ended._util.stop();
        assert.isTrue((await endedStream.next()).done);
        for (let i = 0; i < 3; i++) {
            assert.isFalse((await otherStream.next()).done);
        }
        other._util.stop();
        assert.isTrue((await otherStream.next()).done);
    });

    test.concurrent("the process exits with reads pending", async () => {
        const { code, signal, out, err } = await ownProcess(
            NEVER_WRITES,
            `
            const instance = await instantiate({});
            const [stream, future] = await instance.start();
            stream.next().then(({ done }) => print("read ended", done));
            Promise.resolve(future).catch((e) => print("future failed:", e.message));
            await sleep(10);
            instance._util.stop();
            print("finished");
            `,
        );
        assert.strictEqual(err, "");
        assert.deepStrictEqual({ code, signal }, { code: 0, signal: null });
        const lines = out.trim().split("\n").sort();
        assert.deepStrictEqual(lines, [
            "finished",
            "future failed: component instance has been stopped",
            "read ended true",
        ]);
    });

    test.concurrent("the process exits with a guest still writing", async () => {
        const { code, signal, out, err } = await ownProcess(
            WRITES_FOREVER,
            `
            const instance = await instantiate({ "test:host/api": { tick() {} } });
            const stream = await instance.start();
            await stream.next();
            instance._util.stop();
            print("finished", (await stream.next()).done);
            `,
        );
        assert.strictEqual(err, "");
        assert.deepStrictEqual({ code, signal }, { code: 0, signal: null });
        assert.strictEqual(out, "finished true\n");
    });
});

suite("hearing of traps", () => {
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

    test.concurrent("a trap in a task that has returned, which no call can report", async () => {
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

    test.concurrent("a trap that fails a call is heard too, by the time the call has failed", async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        const { traps, onTrap } = hear();
        const instance = await instantiate({}, { onTrap });
        assert.throws(() => instance.syncTrap(), /unreachable/);
        assert.strictEqual(traps.length, 1);
    });

    test.concurrent("each trap is heard once", async () => {
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

    test.concurrent("a deadlock is a trap", async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        const { first, onTrap } = hear();
        const instance = await instantiate({}, { onTrap });
        await expect(instance.stuck()).rejects.toThrow(/deadlock/);
        assert.match((await first).message, /deadlock/);
    });

    test.concurrent("no trap is heard of for stopping an instance, and none after", async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        const { traps, onTrap } = hear();
        const ended = await instantiate({}, { onTrap });
        const stuck = ended.stuck().catch(() => {});
        ended._util.stop();
        await stuck;
        await sleep(20);
        assert.deepStrictEqual(traps, []);
    });

    test.concurrent("it may stop the instance", async () => {
        const instantiate = await transpiled(TRAPS_AFTER_RETURNING);
        let instance;
        let ended;
        const heard = new Promise((resolve) => (ended = resolve));
        instance = await instantiate(
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

    test.concurrent("another instance of the same module hears only its own", async () => {
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

    test.concurrent("an instance without the option traps as before, and its process exits", async () => {
        const { code, signal, out, err } = await ownProcess(
            TRAPS_AFTER_RETURNING,
            `
            const instance = await instantiate({});
            await instance.start();
            await sleep(20);
            print("finished");
            `,
        );
        assert.strictEqual(err, "");
        assert.deepStrictEqual({ code, signal }, { code: 0, signal: null });
        assert.strictEqual(out, "finished\n");
    });

    test.concurrent("what onTrap throws is left uncaught", async () => {
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
        assert.include(err, "from onTrap");
    });
});
