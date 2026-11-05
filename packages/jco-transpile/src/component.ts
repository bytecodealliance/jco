import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { instantiate, type ImportObject } from '../vendor/js-component-bindgen-component-instantiation.js';
import type * as Bindgen from '../vendor/js-component-bindgen-component.js';

export type * from '../vendor/js-component-bindgen-component.js';

type Component = Awaited<ReturnType<typeof instantiate>>;

const modules = new Map<string, WebAssembly.Module | Promise<WebAssembly.Module>>();
// Generated JS consumes unversioned WASI keys; its declarations retain the
// versions from the component's WIT imports.
const imports = new WASIShim().getImportObject() as unknown as ImportObject;
let component: Component | undefined;

// Written out, as a bundler only follows a URL that is one literal.
const CORE_MODULES = new Map([
    [
        'js-component-bindgen-component.core.wasm',
        new URL('../vendor/js-component-bindgen-component.core.wasm', import.meta.url),
    ],
    [
        'js-component-bindgen-component.core2.wasm',
        new URL('../vendor/js-component-bindgen-component.core2.wasm', import.meta.url),
    ],
    [
        'js-component-bindgen-component.core3.wasm',
        new URL('../vendor/js-component-bindgen-component.core3.wasm', import.meta.url),
    ],
    [
        'js-component-bindgen-component.core4.wasm',
        new URL('../vendor/js-component-bindgen-component.core4.wasm', import.meta.url),
    ],
]);

async function compileCoreModule(path: string): Promise<WebAssembly.Module> {
    const url = CORE_MODULES.get(path);
    if (!url) {
        throw new Error(`unknown core module [${path}]`);
    }
    if (typeof process !== 'undefined' && process.versions?.node) {
        const { readFile } = await import('node:fs/promises');
        return WebAssembly.compile(await readFile(url));
    }
    return WebAssembly.compileStreaming(fetch(url));
}

function loadCoreModule(path: string): WebAssembly.Module | Promise<WebAssembly.Module> {
    let module = modules.get(path);
    if (!module) {
        module = compileCoreModule(path).then((compiled) => {
            modules.set(path, compiled);
            return compiled;
        });
        modules.set(path, module);
    }
    return module;
}

async function initialize(): Promise<void> {
    component = await instantiate(loadCoreModule, imports);
}

/** Await this live promise before using the synchronous component exports. */
export let $init: Promise<void> = initialize();

/** Run an operation after the current initialization, including any recovery. */
export async function callBindgen<T>(run: () => T): Promise<T> {
    for (;;) {
        const init = $init;
        await init;
        // Another queued call may have trapped since this await was scheduled.
        if (init === $init) {
            return run();
        }
    }
}

function call<T>(run: (instance: Component) => T): T {
    if (!component) {
        throw new Error('bindgen component is not initialized: await $init before calling its exports');
    }
    try {
        return run(component);
    } catch (error) {
        if (error instanceof WebAssembly.RuntimeError) {
            // A trap permanently poisons a component instance. Drop all references
            // to its exports and memory so the next call can use a fresh instance.
            component = undefined;
            $init = initialize();
            // Recovery can fail even if the caller makes no further requests.
            // Keep its rejection observable through $init without an unhandled rejection.
            $init.catch(() => {});
        }
        throw error;
    }
}

export const generate: typeof Bindgen.generate = (...args) => call((instance) => instance.generate(...args));
export const generateTypes: typeof Bindgen.generateTypes = (...args) =>
    call((instance) => instance.generateTypes(...args));
export const unpackWit: typeof Bindgen.unpackWit = (...args) => call((instance) => instance.unpackWit(...args));
export const scripts: typeof Bindgen.scripts = {
    createWorld: (...args) => call((instance) => instance.scripts.createWorld(...args)),
    createComponent: (...args) => call((instance) => instance.scripts.createComponent(...args)),
};
