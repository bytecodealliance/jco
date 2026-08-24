import { $init, generate as _generate } from '../../vendor/js-component-bindgen-component.js';

await $init;

const wasiMap = [
    ['wasi:cli/*', '@bytecodealliance/preview2-shim/cli#*'],
    ['wasi:clocks/*', '@bytecodealliance/preview2-shim/clocks#*'],
    ['wasi:filesystem/*', '@bytecodealliance/preview2-shim/filesystem#*'],
    ['wasi:http/*', '@bytecodealliance/preview2-shim/http#*'],
    ['wasi:io/*', '@bytecodealliance/preview2-shim/io#*'],
    ['wasi:random/*', '@bytecodealliance/preview2-shim/random#*'],
    ['wasi:sockets/*', '@bytecodealliance/preview2-shim/sockets#*'],
];

export async function transpile() {
    const componentUrl = new URL('../fixtures/components/runtime/lists.component.wasm', import.meta.url);
    const component = await (await fetch(componentUrl)).arrayBuffer();
    const output = await _generate(component, {
        name: 'test',
        noTypescript: true,
        noNodejsCompat: true,
        instantiation: { tag: 'async' },
        base64Cutoff: 1_000_000,
        map: wasiMap,
    });
    const source = output.files.find(([name]) => name === 'test.js')?.[1];
    if (!source) {
        throw new Error(`transpile output did not contain test.js: ${output.files.map(([name]) => name)}`);
    }

    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
        await import(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function jspi(modulePath) {
    const module = await import(modulePath);
    const instance = await module.instantiate(undefined, {
        'something:test/test-interface': {
            callAsync: () => new Promise((resolve) => setTimeout(() => resolve('callAsync'), 50)),
            callSync: () => 'callSync',
        },
    });

    let ticks = 0;
    const interval = setInterval(() => ticks++, 5);
    try {
        const responseText = await instance.runAsync();
        if (ticks < 2) {
            throw new Error(`event loop was blocked during JSPI call; observed only ${ticks} ticks`);
        }
        return { responseText };
    } finally {
        clearInterval(interval);
    }
}
