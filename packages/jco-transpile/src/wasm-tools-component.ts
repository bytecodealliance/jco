import { instantiate, type ImportObject } from '../vendor/wasm-tools-instantiation.js';
import type { tools as ToolsNamespace } from '../vendor/wasm-tools.js';
import { compileCoreModule, createToolImports } from './tool-imports.js';

type Component = Awaited<ReturnType<typeof instantiate>>;

// Written out, as a bundler only follows a URL that is one literal.
const CORE_MODULES = new Map([
    ['wasm-tools.core.wasm', new URL('../vendor/wasm-tools.core.wasm', import.meta.url)],
    ['wasm-tools.core2.wasm', new URL('../vendor/wasm-tools.core2.wasm', import.meta.url)],
    ['wasm-tools.core3.wasm', new URL('../vendor/wasm-tools.core3.wasm', import.meta.url)],
    ['wasm-tools.core4.wasm', new URL('../vendor/wasm-tools.core4.wasm', import.meta.url)],
]);

let component: Component | undefined;

function loadCoreModule(path: string): Promise<WebAssembly.Module> {
    const url = CORE_MODULES.get(path);
    if (!url) {
        throw new Error(`unknown core module [${path}]`);
    }
    return compileCoreModule(url);
}

/** Await this promise before using the synchronous exports in `tools`. */
export const $init: Promise<void> = Promise.resolve(
    instantiate(loadCoreModule, createToolImports<ImportObject>()),
).then((instance) => {
    component = instance;
});

function call<K extends keyof typeof ToolsNamespace>(name: K): (typeof ToolsNamespace)[K] {
    return ((...args: unknown[]) => {
        if (!component) {
            throw new Error('wasm-tools component is not initialized: await $init before calling its exports');
        }
        return (component.tools[name] as (...args: unknown[]) => unknown)(...args);
    }) as (typeof ToolsNamespace)[K];
}

/** The `local:wasm-tools/tools` exports, usable once `$init` has resolved. */
export const tools: typeof ToolsNamespace = {
    parse: call('parse'),
    print: call('print'),
    componentNew: call('componentNew'),
    componentWit: call('componentWit'),
    componentWitMetadataForWorld: call('componentWitMetadataForWorld'),
    componentEmbed: call('componentEmbed'),
    metadataShow: call('metadataShow'),
    metadataAdd: call('metadataAdd'),
};
