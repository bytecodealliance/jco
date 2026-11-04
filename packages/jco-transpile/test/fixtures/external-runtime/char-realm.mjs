import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const platform = globalThis.WebAssembly;
class SelectedRuntimeError extends Error {}
globalThis.WebAssembly = Object.assign(Object.create(platform), { RuntimeError: SelectedRuntimeError });
const bindings = await import(pathToFileURL(process.argv[2]).href);
for (const operation of ['direct', 'send']) {
    const instance = await bindings.instantiate(undefined, {});
    assert.equal(await instance[operation](0), '\0');
    assert.equal(await instance[operation](0x1f600), '😀');
    await assert.rejects(
        async () => instance[operation](0xd800),
        (error) => {
            assert.ok(error instanceof SelectedRuntimeError);
            assert.match(error.message, /invalid `char` bit pattern/);
            return true;
        },
    );
}
const instance = await bindings.instantiate(undefined, {});
await assert.rejects(async () => instance.echo(42), TypeError);
