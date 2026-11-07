/** Exercise the bundled compiler, embedded runtime, and resulting bindings in the browser. */
import { callBindgen, generate } from '../../../../dist/component.js';

/** Compile and execute a component using the embedded runtime. */
async function run() {
    const component = new Uint8Array([0, 97, 115, 109, 13, 0, 1, 0]);
    const empty = await callBindgen(() => generate(component, { name: 'empty', map: [], embedRuntime: true }));
    const bytes = new Uint8Array(
        await (await fetch(new URL('../../components/runtime/adder.component.wasm', import.meta.url))).arrayBuffer(),
    );
    const result = await callBindgen(() =>
        generate(bytes, {
            name: 'adder',
            map: [],
            embedRuntime: true,
            instantiation: { tag: 'sync' },
            base64Cutoff: 0,
        }),
    );
    const files = new Map(result.files);
    const source = new TextDecoder().decode(files.get('adder.js'));
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
        const { instantiate } = await import(/* @vite-ignore */ url);
        const instance = instantiate((name) => new WebAssembly.Module(files.get(name)), {});
        return {
            files: empty.files.map(([name]) => name),
            sum: instance.add.add(17, 25),
            embedded: source.includes('__jcoEmbeddedRuntime$'),
        };
    } finally {
        URL.revokeObjectURL(url);
    }
}
globalThis.componentBundling = run().catch((error) => ({ error: String(error) }));
