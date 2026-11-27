import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { transpileBytes, writeFiles } from './transpilation.js';

const component = new TextEncoder().encode(`(component
    (core module $m
        (func (export "increment") (param i32) (result i32)
            (if (i32.eq (local.get 0) (i32.const -1)) (then unreachable))
            (i32.add (local.get 0) (i32.const 1)))
        (func (export "wide") (param i64) (result i64) local.get 0)
        (func (export "double") (param f64) (result f64) local.get 0)
        (func (export "ping")))
    (core instance $i (instantiate $m))
    (func (export "increment") (param "n" u32) (result u32) (canon lift (core func $i "increment")))
    (func (export "wide") (param "n" u64) (result u64) (canon lift (core func $i "wide")))
    (func (export "double") (param "n" f64) (result f64) (canon lift (core func $i "double")))
    (func (export "ping") (canon lift (core func $i "ping"))))`);

test.each(['bundled', 'external'])('%s numeric exports preserve traps, coercion and stop', async (mode) => {
    // A directory inside the runtime package resolves its standard package
    // name through Node's package self-reference, as a consumer would.
    const runtime = fileURLToPath(new URL('../../jco-cm-runtime/', import.meta.url));
    const dir = await mkdtemp(join(runtime, '.numeric-test-'));
    try {
        const { files } = await transpileBytes(component, {
            name: 'numeric',
            instantiation: 'async',
            cmRuntimeEsModule: mode === 'external' ? '@bytecodealliance/jco-cm-runtime' : undefined,
        });
        expect(new TextDecoder().decode(files['numeric.js'])).toContain('nativeNumericExports');
        await writeFiles(files, { baseDir: dir });
        const { instantiate } = await import(pathToFileURL(join(dir, 'numeric.js')).href);
        const guest = await instantiate();
        expect(guest.increment(2 ** 32)).toBe(1);
        expect(guest.increment(2.5)).toBe(3);
        expect(guest.wide(-1n)).toBe(2n ** 64n - 1n);
        expect(guest.double(-0)).toBe(-0);
        expect(guest.ping()).toBeUndefined();
        expect(guest.increment({ valueOf: () => guest.increment(3) })).toBe(5);
        expect(() => guest.increment(0xffffffff)).toThrow(WebAssembly.RuntimeError);
        expect(() => guest.ping()).toThrow(/cannot enter/);
        await guest._util.whenIdle();

        const other = await instantiate();
        other._util.stop();
        expect(() => other.ping()).toThrow(/stopped/);

        const reported: Error[] = [];
        const observed = await instantiate(undefined, {}, undefined, { onTrap: (e: Error) => reported.push(e) });
        expect(() => observed.increment(0xffffffff)).toThrow(WebAssembly.RuntimeError);
        expect(reported).toHaveLength(1);

        const hostError = new Error('custom core');
        const custom = await instantiate(undefined, {}, () => ({
            exports: {
                increment: () => {
                    throw hostError;
                },
                ping: () => {},
            },
        }));
        expect(() => custom.increment(1)).toThrow(hostError);
        expect(custom.ping()).toBeUndefined();

        const strict = await transpileBytes(component, {
            name: 'strict-numeric',
            strict: true,
            cmRuntimeEsModule: mode === 'external' ? '@bytecodealliance/jco-cm-runtime' : undefined,
        });
        await writeFiles(strict.files, { baseDir: dir });
        const direct = await import(pathToFileURL(join(dir, 'strict-numeric.js')).href);
        expect(() => direct.increment(2.5)).toThrow();
        expect(direct.increment(3)).toBe(4);
        expect(() => direct.increment(0xffffffff)).toThrow(WebAssembly.RuntimeError);
        expect(() => direct.ping()).toThrow(/cannot enter/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
