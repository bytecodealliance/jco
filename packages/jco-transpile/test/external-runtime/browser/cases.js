async function loadProvider(path) {
    if (!path) {
        return undefined;
    }
    const provider = await import(path);
    provider.resetTableGetCallCount();
    return provider;
}

function captureTrap(fn) {
    try {
        fn();
        return null;
    } catch (error) {
        return { runtimeError: error instanceof WebAssembly.RuntimeError, message: error.message };
    }
}

function exerciseInstances(instance, sibling, provider) {
    const values = [instance.run(42), instance.run(24)];
    const tableGets = provider?.tableGetCallCount ?? null;
    return {
        values,
        invalidHandle: captureTrap(() => instance.invalid(0)),
        afterTrap: captureTrap(() => instance.run(42)),
        siblingValue: sibling ? sibling.run(7) : null,
        contexts: provider?.contexts.size ?? null,
        tableGets,
    };
}

async function fetchBytes(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`failed to fetch ${url}: HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

/** Load generated bindings and their external runtime through the browser's ES module loader. */
export async function runComponent({ componentPath, corePaths, instantiation, providerPath }) {
    const provider = await loadProvider(providerPath);
    const moduleUrl = new URL(componentPath, location.href);
    const bindings = await import(moduleUrl.href);
    if (!instantiation) {
        return exerciseInstances(bindings, undefined, provider);
    }

    const modules = new Map(
        await Promise.all(
            corePaths.map(async (name) => [name, new WebAssembly.Module(await fetchBytes(new URL(name, moduleUrl)))]),
        ),
    );
    const load = (name) => {
        if (!modules.has(name)) {
            throw new Error(`generated bindings requested unknown core module ${name}`);
        }
        return instantiation === 'async' ? Promise.resolve(modules.get(name)) : modules.get(name);
    };
    const first = await bindings.instantiate(load, {});
    const second = await bindings.instantiate(load, {});
    return exerciseInstances(first, second, provider);
}

/** Exercise real host scheduling through independently instantiated browser stores. */
export async function runHost({ componentPath, corePaths, deferred }) {
    const moduleUrl = new URL(componentPath, location.href);
    const bindings = await import(moduleUrl.href);
    const modules = new Map(
        await Promise.all(
            corePaths.map(async (name) => [name, new WebAssembly.Module(await fetchBytes(new URL(name, moduleUrl)))]),
        ),
    );
    const values = [],
        completed = [];
    for (let store = 0; store < 2; store++) {
        const instance = bindings.instantiate((name) => modules.get(name), {});
        const value = await instance.run();
        values.push(deferred ? [(value >>> 8) & 15, value & 15] : value);
        if (deferred) {
            for (let i = 0; i < 50 && instance.completed() !== 2; i++) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            completed.push(instance.completed());
        }
    }
    return { values, completed };
}

/** Exercise the option through the bindgen component running in the browser as well. */
export async function transpileInBrowser({ componentPath, cmRuntimeEsModule, providerPath }) {
    const provider = await loadProvider(providerPath);
    const bindgen = await import('/jco-transpile/vendor/js-component-bindgen-component.js');
    await bindgen.$init;
    const output = await bindgen.generate(await fetchBytes(componentPath), {
        name: 'browser-generated',
        noTypescript: true,
        noNodejsCompat: true,
        instantiation: { tag: 'async' },
        base64Cutoff: 0,
        cmRuntimeEsModule: cmRuntimeEsModule.startsWith('/')
            ? new URL(cmRuntimeEsModule, location.href).href
            : cmRuntimeEsModule,
    });
    const source = output.files.find(([name]) => name === 'browser-generated.js')?.[1];
    if (!source) {
        throw new Error('transpilation did not produce browser-generated.js');
    }
    const modules = new Map(output.files.filter(([name]) => name.endsWith('.wasm')));
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
        const bindings = await import(url);
        const load = (name) => {
            const bytes = modules.get(name);
            if (!bytes) {
                throw new Error(`generated bindings requested unknown core module ${name}`);
            }
            return WebAssembly.compile(bytes);
        };
        const first = await bindings.instantiate(load, {});
        const second = await bindings.instantiate(load, {});
        return exerciseInstances(first, second, provider);
    } finally {
        URL.revokeObjectURL(url);
    }
}
