import { assert, expect, test } from 'vitest';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { $init, generate, validate } from '../../vendor/js-component-bindgen-component.js';
import { parse } from '../../src/wasm-tools.js';
import { getTmpDir, setupAsyncTest } from '../helpers.js';

test.concurrent.each([
    {
        name: 'malformed namespace',
        source: '(component (import "foo:bar:baz/qux" (func)))',
        message: 'expected `/` after package name',
    },
    {
        name: 'borrowed task result',
        source: '(component (type $r (resource (rep i32))) (core func (canon task.return (result (borrow $r)))))',
        message: '`task.return` result cannot contain a `borrow` type',
    },
])('invalid $name does not poison later transpilation', async ({ source, message }) => {
    await $init;
    const invalid = await parse(source);
    assert.throws(() => generate(invalid, { name: 'invalid' }), message);
    const valid = await parse('(component)');
    assert.isNotEmpty(generate(valid, { name: 'valid' }).files);
});

test.concurrent('structural validation accepts modules and interface-free components', async () => {
    await $init;
    for (const source of ['(module (func))', '(component (import "f" (func)))']) {
        const bytes = await parse(source);
        assert.doesNotThrow(() => validate(bytes));
    }
});

test.concurrent('exported record types produce declarations without runtime exports', async () => {
    await $init;
    const component = await parse(`(component
        (type $record (record (field "value" u32)))
        (export "record-type" (type $record))
    )`);
    const output = generate(component, { name: 'record' });
    const declarations = output.files
        .filter(([name]) => name.endsWith('.d.ts'))
        .map(([, bytes]) => new TextDecoder().decode(bytes))
        .join('\n');
    assert.include(declarations, 'interface RecordType');
    assert.include(declarations, 'value: number');
    assert.isEmpty(output.exports);
});

test.concurrent.each([false, true])('core module exports preserve initialization and functions (trap=%s)', async (trap) => {
    const directory = await getTmpDir();
    const path = join(directory, 'fixture.wasm');
    const bytes = await parse(`(component
        (core module $m
            (func $start ${trap ? 'unreachable' : ''})
            (start $start)
            (func (export "value") (result i32) i32.const 42))
        (export "module" (core module $m))
        (component $unused)
        (export "definition" (component $unused))
        (core instance $i (instantiate $m))
        (func (export "value") (result u32) (canon lift (core func $i "value"))))
    `);
    await writeFile(path, bytes);
    try {
        const setup = setupAsyncTest({
            asyncMode: 'jspi',
            component: { name: 'module-export', path, outputDir: directory },
        });
        if (trap) {
            await expect(setup).rejects.toThrow(/unreachable/);
        } else {
            const { instance, cleanup } = await setup;
            try {
                assert.strictEqual(await instance.value(), 42);
            } finally {
                await cleanup();
            }
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
