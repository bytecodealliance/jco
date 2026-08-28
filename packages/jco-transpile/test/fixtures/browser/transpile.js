import { $init, generate as _generate } from '../../../vendor/js-component-bindgen-component.js';

await $init;

const WASI_MAP = [
    ['wasi:cli/*', '@bytecodealliance/preview2-shim/cli#*'],
    ['wasi:clocks/*', '@bytecodealliance/preview2-shim/clocks#*'],
    ['wasi:filesystem/*', '@bytecodealliance/preview2-shim/filesystem#*'],
    ['wasi:http/*', '@bytecodealliance/preview2-shim/http#*'],
    ['wasi:io/*', '@bytecodealliance/preview2-shim/io#*'],
    ['wasi:random/*', '@bytecodealliance/preview2-shim/random#*'],
    ['wasi:sockets/*', '@bytecodealliance/preview2-shim/sockets#*'],
];

/** Shim modules the generated bindings can import, resolved via the harness page's import map */
const SHIM_SPECIFIERS = [...new Set(WASI_MAP.map(([, target]) => target.split('#')[0]))];

let shimModules;

/**
 * Transpile every provided component in the browser, then evaluate and instantiate
 * the JS that comes out of each one.
 *
 * All components are handled by a single page so that the bindgen component itself is
 * only fetched and instantiated once; failures are reported per component rather than
 * aborting the run, so one bad component does not hide the results of the others.
 *
 * @param {string[]} componentPaths - URLs of components to transpile, resolved against this module
 * @returns {Promise<Array<{ path: string, ok: boolean, exports?: string[], error?: string }>>}
 */
export async function transpile(componentPaths) {
    shimModules ??= Object.fromEntries(
        await Promise.all(SHIM_SPECIFIERS.map(async (specifier) => [specifier, await import(specifier)])),
    );

    const results = [];
    for (const componentPath of componentPaths) {
        try {
            const exports = await transpileOne(componentPath);
            results.push({ path: componentPath, ok: true, exports });
        } catch (error) {
            results.push({ path: componentPath, ok: false, error: error?.stack ?? String(error) });
        }
    }
    return results;
}

async function transpileOne(componentPath) {
    const componentUrl = new URL(componentPath, import.meta.url);
    const response = await fetch(componentUrl);
    if (!response.ok) {
        throw new Error(`failed to fetch component [${componentUrl}]: HTTP ${response.status}`);
    }
    const component = await response.arrayBuffer();

    // NOTE: the output is always named "test" so that the file to evaluate can be found
    // without depending on how bindgen normalizes component file names
    const output = await _generate(component, {
        name: 'test',
        noTypescript: true,
        noNodejsCompat: true,
        instantiation: { tag: 'async' },
        base64Cutoff: 1_000_000,
        map: WASI_MAP,
    });
    const source = output.files.find(([name]) => name === 'test.js')?.[1];
    if (!source) {
        throw new Error(`transpile output did not contain test.js: ${output.files.map(([name]) => name)}`);
    }
    const coreModules = new Map(output.files.filter(([name]) => name.endsWith('.wasm')));

    // NOTE: the generated module is evaluated from a blob URL, which has no meaningful base
    // for resolving relative URLs. In instantiation mode that is only safe because nothing is
    // fetched relative to the module: the core modules are handed over via getCoreModule
    // below (bindgen otherwise falls back to fetching them next to `import.meta.url`) and the
    // imports are passed in rather than imported, so the generated source has no static
    // imports of its own.
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    let module;
    try {
        module = await import(url);
    } finally {
        URL.revokeObjectURL(url);
    }

    const instance = await module.instantiate((name) => {
        const bytes = coreModules.get(name);
        if (!bytes) {
            throw new Error(`generated bindings requested unknown core module [${name}]`);
        }
        return WebAssembly.compile(bytes);
    }, buildImports());

    const exports = Object.keys(instance ?? {});
    if (exports.length === 0) {
        throw new Error('instantiation produced no exports');
    }
    return exports;
}

/**
 * Build the import object handed to the generated bindings.
 *
 * WASI imports are satisfied by the real preview2-shim browser build, so that instantiation
 * checks the shim against what bindgen expects. Everything else -- the interfaces each test
 * component defines for its own host -- is stubbed, since these components are only
 * instantiated here and never called into.
 */
function buildImports() {
    return new Proxy(shimModules, {
        get: (shims, specifier) => (specifier in shims ? shims[specifier] : stub()),
    });
}

/**
 * Stand-in for an import that this test does not implement.
 *
 * Instantiation checks that every import the bindings expect is present, and reports
 * anything missing (e.g. "unexpectedly undefined local import 'getStderr'"), so a stub has
 * to answer property access at any depth with something callable.
 */
function stub() {
    return new Proxy(function stub() {}, {
        // NOTE: `then` must stay undefined, otherwise a stub reaching an await would be
        // mistaken for a thenable and never settle
        get: (_target, property) => (property === 'then' ? undefined : stub()),
        apply: () => stub(),
        construct: () => stub(),
    });
}
